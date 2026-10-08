/**
 * Swappable LLM providers (CLAUDE.md §3, §12). Business code never sees these: it calls
 * LlmService, which picks a provider, validates JSON, retries once and logs every call.
 * All providers use plain REST (no SDKs) and ask for a JSON object back.
 */

export type LlmPrompt = { system: string; user: string };
export type LlmCompletion = { text: string; inputTokens: number; outputTokens: number };

export interface LlmProvider {
  readonly name: 'gemini' | 'claude' | 'openai' | 'mock';
  readonly model: string;
  complete(prompt: LlmPrompt, signal: AbortSignal): Promise<LlmCompletion>;
  /** Estimated cost in integer micro-USD (1 USD = 1,000,000). */
  costMicroUsd(inputTokens: number, outputTokens: number): number;
}

export class LlmProviderError extends Error {
  constructor(
    readonly code: 'PROVIDER_ERROR' | 'RATE_LIMITED' | 'NOT_CONFIGURED',
    message: string,
  ) {
    super(message);
  }
}

/** Price per 1M tokens in micro-USD, [input, output]; unknown models are priced at 0. */
const PRICES: Record<string, [number, number]> = {
  'gemini-3.8-flash': [0, 0], // free tier (CLAUDE.md §4)
  'claude-haiku-4-5-20251001': [1_000_000, 5_000_000],
  'gpt-4o-mini': [150_000, 600_000],
};
const priced = (model: string, input: number, output: number) => {
  const [i, o] = PRICES[model] ?? [0, 0];
  return Math.round((input * i + output * o) / 1_000_000);
};

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 429)
    throw new LlmProviderError('RATE_LIMITED', 'Provider rate limit or quota reached');
  if (!res.ok) throw new LlmProviderError('PROVIDER_ERROR', `Provider returned ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(prompt: LlmPrompt, signal: AbortSignal): Promise<LlmCompletion> {
    const json = (await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      { 'x-goog-api-key': this.apiKey },
      {
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      },
      signal,
    )) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    return {
      text: json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  costMicroUsd(i: number, o: number) {
    return priced(this.model, i, o);
  }
}

export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude' as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(prompt: LlmPrompt, signal: AbortSignal): Promise<LlmCompletion> {
    const json = (await post(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: this.model,
        max_tokens: 4096,
        temperature: 0.2,
        system: `${prompt.system}\nRespond with a single JSON object only.`,
        messages: [{ role: 'user', content: prompt.user }],
      },
      signal,
    )) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text:
        json.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('') ?? '',
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    };
  }

  costMicroUsd(i: number, o: number) {
    return priced(this.model, i, o);
  }
}

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(prompt: LlmPrompt, signal: AbortSignal): Promise<LlmCompletion> {
    const json = (await post(
      'https://api.openai.com/v1/chat/completions',
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      },
      signal,
    )) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  costMicroUsd(i: number, o: number) {
    return priced(this.model, i, o);
  }
}

/**
 * Tests only (CLAUDE.md §12): returns queued responses (string or thrown error), else `{}`.
 * Records the prompts it received so tests can assert what was (not) sent.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock' as const;
  readonly model = 'mock-1';
  readonly prompts: LlmPrompt[] = [];
  private readonly queue: (string | Error)[] = [];

  enqueue(...responses: (string | Error | object)[]): void {
    for (const r of responses) {
      this.queue.push(typeof r === 'string' || r instanceof Error ? r : JSON.stringify(r));
    }
  }

  reset(): void {
    this.queue.length = 0;
    this.prompts.length = 0;
  }

  async complete(prompt: LlmPrompt): Promise<LlmCompletion> {
    this.prompts.push(prompt);
    const next = this.queue.shift() ?? offlineAnswer(prompt);
    if (next instanceof Error) throw next;
    return { text: next, inputTokens: prompt.user.length / 4, outputTokens: next.length / 4 };
  }

  costMicroUsd() {
    return 0;
  }
}

/**
 * Deterministic stand-in used by the mock when no response is queued (E2E runs, offline demos):
 * reads obvious facts from a CV with simple rules and never adjusts match scores. Real behaviour
 * is covered by unit/integration tests with queued responses.
 */
function offlineAnswer(prompt: LlmPrompt): string {
  if (prompt.user.startsWith('Extract the profile')) {
    const text =
      /<untrusted_document>\n([\s\S]*?)\n<\/untrusted_document>/.exec(prompt.user)?.[1] ?? '';
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const [first = '', ...rest] = (lines[0] ?? '').split(/\s+/);
    const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(text)?.[0];
    const phone = /\+?\d[\d ()-]{7,}\d/.exec(text)?.[0];
    const field = <T>(value: T | undefined, confidence: number) =>
      value === undefined || value === '' ? null : { value, confidence };
    return JSON.stringify({
      firstName: field(first, 0.9),
      lastName: field(rest.join(' '), 0.9),
      email: field(email, 0.95),
      phone: field(phone, 0.6),
      skills: [],
      education: [],
      certifications: [],
      languages: [],
    });
  }
  if (prompt.user.startsWith('Job:')) {
    return JSON.stringify({ adjustment: 0, explanation: 'Offline mode: skills check only.' });
  }
  return '{}';
}
