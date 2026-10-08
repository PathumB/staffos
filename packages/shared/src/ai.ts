import { z } from 'zod';
import { AiFeature } from './enums.js';
import { pageQuery } from './pagination.js';

// AI features (docs/api-contract.md §2.19). LLM output is validated with these schemas before use;
// anything AI-generated is a suggestion a person confirms (CLAUDE.md §12).

const confidence = z.number().min(0).max(1);
const field = <T extends z.ZodType>(value: T) =>
  z.object({ value, confidence }).nullable().optional();

/** What the cv-parse prompt must return. */
export const parsedCvSchema = z.object({
  firstName: field(z.string().max(100)),
  lastName: field(z.string().max(100)),
  email: field(z.string().max(254)),
  phone: field(z.string().max(40)),
  currentTitle: field(z.string().max(150)),
  totalYearsExperience: field(z.number().min(0).max(60)),
  skills: z
    .array(
      z.object({
        name: z.string().max(60),
        years: z.number().min(0).max(50).nullable().optional(),
        confidence,
      }),
    )
    .max(40)
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string().max(150),
        institution: z.string().max(150).nullable().optional(),
        year: z.number().int().nullable().optional(),
      }),
    )
    .max(10)
    .default([]),
  certifications: z.array(z.string().max(150)).max(20).default([]),
  languages: z.array(z.string().max(40)).max(10).default([]),
});
export type ParsedCv = z.infer<typeof parsedCvSchema>;

/** Fields below this confidence are highlighted for the recruiter to check (US-CAND-01). */
export const LOW_CONFIDENCE = 0.7;

export const cvParseResponseSchema = z.object({
  /** Signed reference to the uploaded CV; pass it when saving the candidate to attach the file. */
  cvToken: z.string(),
  fileName: z.string(),
  parsed: parsedCvSchema.nullable(),
  /** Set when parsing wasn't possible (AI unavailable, scanned PDF): fill the fields manually. */
  message: z.string().nullable(),
});
export type CvParseResponse = z.infer<typeof cvParseResponseSchema>;

// ── Matching ──

export const matchLlmSchema = z.object({
  adjustment: z.number().int().min(-100).max(100),
  explanation: z.string().max(1_000),
});

export const matchResultSchema = z.object({
  applicationId: z.uuid(),
  candidate: z.object({ id: z.uuid(), name: z.string() }),
  stage: z.string(),
  score: z.number().int(),
  preScore: z.number().int(),
  adjustment: z.number().int(),
  matched: z.array(z.string()),
  partial: z.array(z.string()),
  missing: z.array(z.string()),
  explanation: z.string().nullable(),
  promptVersion: z.string(),
  createdAt: z.string(),
});
export type MatchResult = z.infer<typeof matchResultSchema>;

// ── Job description writer ──

export const jdDraftInputSchema = z.strictObject({
  title: z.string().trim().min(1, 'Required.').max(150),
  industry: z.string().trim().max(60).optional(),
  location: z.string().trim().max(150).optional(),
  salaryBand: z.string().trim().max(60).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});
export type JdDraftInput = z.input<typeof jdDraftInputSchema>;

export const jdLlmSchema = z.object({ draft: z.string().min(50).max(6_000) });

export const inclusiveFlagSchema = z.object({
  term: z.string(),
  reason: z.string(),
  suggestion: z.string(),
});
export type InclusiveFlag = z.infer<typeof inclusiveFlagSchema>;

export const jdDraftResponseSchema = z.object({
  draft: z.string(),
  inclusiveLanguageFlags: z.array(inclusiveFlagSchema),
});
export type JdDraftResponse = z.infer<typeof jdDraftResponseSchema>;

// ── Interviews ──

export const interviewKitSchema = z.object({
  technical: z.array(z.string().max(400)).min(1).max(12),
  behavioural: z.array(z.string().max(400)).min(1).max(12),
  rubric: z
    .array(z.object({ criterion: z.string().max(100), lookFor: z.string().max(400) }))
    .min(1)
    .max(10),
});
export type InterviewKit = z.infer<typeof interviewKitSchema>;
export const interviewKitInputSchema = z.strictObject({ jobId: z.uuid() });

export const interviewSummarySchema = z.object({
  summary: z.string().max(2_000),
  strengths: z.array(z.string().max(300)).max(8),
  concerns: z.array(z.string().max(300)).max(8),
});
export type InterviewSummary = z.infer<typeof interviewSummarySchema>;

// ── Usage ──

export const aiFeatureSchema = z.enum(Object.values(AiFeature) as [AiFeature, ...AiFeature[]]);

export const aiRequestSchema = z.object({
  id: z.uuid(),
  feature: aiFeatureSchema,
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  estimatedCostMicroUsd: z.number().int(),
  latencyMs: z.number().int(),
  status: z.string(),
  errorCode: z.string().nullable(),
  user: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.string(),
});
export type AiRequest = z.infer<typeof aiRequestSchema>;

export const aiRequestListQuerySchema = z.strictObject({
  page: pageQuery().page,
  pageSize: pageQuery().pageSize,
  feature: aiFeatureSchema.optional(),
});
export type AiRequestListQuery = z.infer<typeof aiRequestListQuerySchema>;

export const aiUsageSchema = z.object({
  monthToDateMicroUsd: z.number().int(),
  budgetMicroUsd: z.number().int(),
  provider: z.string(),
  model: z.string(),
  byFeature: z.array(
    z.object({
      feature: aiFeatureSchema,
      calls: z.number().int(),
      failed: z.number().int(),
      costMicroUsd: z.number().int(),
    }),
  ),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  CV_PARSE: 'CV parsing',
  MATCH: 'Match ranking',
  JD_DRAFT: 'Job description writer',
  INTERVIEW_KIT: 'Interview kit',
  INTERVIEW_SUMMARY: 'Interview summary',
  ASK_DATA: 'Ask your data',
};

export const AI_SUGGESTION_LABEL = 'AI-assisted suggestion';
