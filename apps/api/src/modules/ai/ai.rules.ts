import type { InclusiveFlag } from '@staffos/shared';

// Deterministic parts of the AI features (CLAUDE.md §12): the LLM only explains and nudges.

export type JobSkill = { name: string; weight: 'MUST' | 'NICE'; minYears: number | null };
export type CandidateSkill = { name: string; years: number | null };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();

function findSkill(skill: string, have: readonly CandidateSkill[]): CandidateSkill | undefined {
  const target = norm(skill);
  return have.find((h) => {
    const n = norm(h.name);
    return n === target || n.includes(target) || target.includes(n);
  });
}

/**
 * US-APP-03 pre-score (0–100): must-have skills 70, nice-to-have 20, experience 10. A skill with
 * fewer years than required counts half and is listed as partial.
 */
export function preScore(
  job: { skills: readonly JobSkill[] },
  candidate: { skills: readonly CandidateSkill[]; totalExperienceMonths: number | null },
): { score: number; matched: string[]; partial: string[]; missing: string[] } {
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  const credit = (s: JobSkill) => {
    const found = findSkill(s.name, candidate.skills);
    if (!found) {
      missing.push(s.name);
      return 0;
    }
    if (s.minYears && (found.years ?? 0) < s.minYears) {
      partial.push(s.name);
      return 0.5;
    }
    matched.push(s.name);
    return 1;
  };
  const part = (list: JobSkill[], points: number) =>
    list.length === 0
      ? points
      : (list.reduce((sum, s) => sum + credit(s), 0) / list.length) * points;

  const must = job.skills.filter((s) => s.weight === 'MUST');
  const nice = job.skills.filter((s) => s.weight === 'NICE');
  const required = Math.max(0, ...must.map((s) => s.minYears ?? 0));
  const years = (candidate.totalExperienceMonths ?? 0) / 12;
  const experience = required === 0 ? (years > 0 ? 10 : 5) : Math.min(1, years / required) * 10;

  const score = Math.round(part(must, 70) + part(nice, 20) + experience);
  return { score: Math.max(0, Math.min(100, score)), matched, partial, missing };
}

/** The LLM may move the pre-score by at most ±10, whatever its output says (prompt injection). */
export function finalScore(
  pre: number,
  llmAdjustment: number,
): { adjustment: number; score: number } {
  const adjustment = Math.max(-10, Math.min(10, Math.round(llmAdjustment)));
  return { adjustment, score: Math.max(0, Math.min(100, pre + adjustment)) };
}

/**
 * What a matching prompt may see about a candidate: skills and experience only. Name, contact,
 * gender, age, nationality, photo and identity documents never leave this function (US-APP-03).
 */
export function anonymisedProfile(c: {
  currentTitle: string | null;
  totalExperienceMonths: number | null;
  skills: readonly CandidateSkill[];
  certifications: readonly string[];
  languages: readonly string[];
  education: unknown;
}): string {
  const degrees = Array.isArray(c.education)
    ? (c.education as { degree?: unknown }[])
        .map((e) => (typeof e?.degree === 'string' ? e.degree : null))
        .filter((d): d is string => Boolean(d))
    : [];
  return JSON.stringify({
    currentTitle: c.currentTitle,
    totalYearsExperience:
      c.totalExperienceMonths === null ? null : Math.round(c.totalExperienceMonths / 12),
    skills: c.skills.map((s) => ({ name: s.name, years: s.years })),
    certifications: c.certifications,
    languages: c.languages,
    degrees,
  });
}

const RULES: { pattern: RegExp; reason: string; suggestion: string }[] = [
  {
    pattern: /\b(male|female|men|women|ladies|gentlemen)\s+(only|preferred|candidates?)\b/gi,
    reason: 'Gender requirement',
    suggestion: 'Remove; describe the work instead.',
  },
  {
    pattern: /\b(salesman|chairman|foreman|workman|manpower|cameraman|handyman)\b/gi,
    reason: 'Gendered job word',
    suggestion: 'Use a neutral word (e.g. salesperson, supervisor, workforce).',
  },
  {
    pattern: /\b(he|she) (will|must|should|is)\b/gi,
    reason: 'Gendered pronoun for the candidate',
    suggestion: 'Use "you" or "the candidate".',
  },
  {
    pattern:
      /\b(age|aged)\s*(limit|between|below|under|above|over)?\s*\d{2}(\s*(-|to)\s*\d{2})?\b/gi,
    reason: 'Age limit',
    suggestion: 'Remove; ask for the experience or licence actually needed.',
  },
  {
    pattern: /\b(under|below|not older than|maximum age)\s+\d{2}\b/gi,
    reason: 'Age limit',
    suggestion: 'Remove; ask for the experience or licence actually needed.',
  },
  {
    pattern: /\b(young|youthful|energetic young|digital native|recent graduates? only)\b/gi,
    reason: 'Age-coded wording',
    suggestion: 'Describe the skills or pace of work instead.',
  },
  {
    pattern:
      /\b(indian|pakistani|filipino|arab|emirati|nepali|european|western|asian|african)s?\s+(only|nationals? only|preferred|candidates? only)\b/gi,
    reason: 'Nationality preference',
    suggestion: 'Remove; state language or licence requirements if they matter.',
  },
  {
    pattern: /\bnative (english|arabic) speakers?\b/gi,
    reason: 'Native-speaker requirement',
    suggestion: 'Ask for a language level, e.g. "fluent English".',
  },
  {
    pattern:
      /\b(attractive|good[- ]looking|pleasant appearance|photo required|send (a )?photo)\b/gi,
    reason: 'Appearance requirement or photo request',
    suggestion: 'Remove.',
  },
  {
    pattern: /\b(married|single|unmarried|bachelors? only)\b/gi,
    reason: 'Marital status',
    suggestion: 'Remove.',
  },
];

/** US-AI-01: flags exclusionary wording in a job description (deterministic, explainable). */
export function inclusiveLanguageFlags(text: string): InclusiveFlag[] {
  const flags: InclusiveFlag[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const term = m[0].trim();
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push({ term, reason: rule.reason, suggestion: rule.suggestion });
    }
  }
  return flags;
}
