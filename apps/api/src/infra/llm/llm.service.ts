import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Global, HttpStatus, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiFeature } from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { z } from 'zod';
import type { Env } from '../../common/config/env';
import { requestContext } from '../../common/context/request-context';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClaudeProvider,
  GeminiProvider,
  type LlmPrompt,
  type LlmProvider,
  LlmProviderError,
  MockProvider,
  OpenAiProvider,
} from './llm.providers';

const TIMEOUT_MS = 30_000;
const PROMPTS_DIR = path.join(__dirname, '..', '..', 'modules', 'ai', 'prompts');

/** Shown to users whenever AI can't help; manual entry always remains possible (CLAUDE.md §12). */
export const aiUnavailable = (
  message = 'AI is temporarily unavailable. You can continue manually.',
) => new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'AI_UNAVAILABLE', message);

/**
 * Wraps untrusted text (CV, cover note) in delimiters the prompts tell the model to treat as data
 * only. A closing tag inside the text is neutralised so it can't end the block early.
 */
export function untrusted(text: string, maxChars = 24_000): string {
  const clean = text.slice(0, maxChars).replace(/<\/?untrusted_document>/gi, '[tag removed]');
  return `<untrusted_document>\n${clean}\n</untrusted_document>`;
}

export type LlmRunOptions<S extends z.ZodType> = {
  feature: AiFeature;
  /** Prompt file name without extension, e.g. "cv-parse.v1". */
  prompt: string;
  vars: Record<string, string>;
  schema: S;
  entity?: { type: string; id: string };
};

/** The one entry point for AI in business code: budget, timeout, validation, retry, logging. */
@Injectable()
export class LlmService {
  readonly provider: LlmProvider;
  private readonly budgetMicroUsd: number;
  private readonly prompts = new Map<string, { system: string; user: string }>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
    @InjectPinoLogger(LlmService.name) private readonly logger: PinoLogger,
  ) {
    this.budgetMicroUsd = Math.round(
      config.get('AI_MONTHLY_BUDGET_USD', { infer: true }) * 1_000_000,
    );
    this.provider = LlmService.createProvider(config);
  }

  /**
   * Runs a prompt and returns validated JSON. Invalid output is retried once; provider errors
   * once with a short backoff. Every attempt is logged to ai_requests. Throws AI_UNAVAILABLE.
   */
  async run<S extends z.ZodType>(
    opts: LlmRunOptions<S>,
  ): Promise<{ data: z.output<S>; aiRequestId: string; promptVersion: string }> {
    const userId = requestContext.get()?.actor?.id ?? null;
    if (await this.overBudget()) {
      await this.log(opts, 'BUDGET_EXCEEDED', 0, 0, 0, userId, 'BUDGET_EXCEEDED');
      throw aiUnavailable();
    }
    const prompt = this.render(opts.prompt, opts.vars);
    let lastCode = 'INVALID_OUTPUT';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = Date.now();
      try {
        const out = await this.provider.complete(prompt, AbortSignal.timeout(TIMEOUT_MS));
        const parsed = opts.schema.safeParse(safeJson(out.text));
        const status = parsed.success ? 'SUCCEEDED' : 'INVALID_OUTPUT';
        const id = await this.log(
          opts,
          status,
          out.inputTokens,
          out.outputTokens,
          Date.now() - started,
          userId,
          parsed.success ? null : 'INVALID_OUTPUT',
        );
        if (parsed.success)
          return { data: parsed.data, aiRequestId: id, promptVersion: opts.prompt };
        lastCode = 'INVALID_OUTPUT';
      } catch (error) {
        const code =
          error instanceof LlmProviderError
            ? error.code
            : error instanceof Error && error.name === 'TimeoutError'
              ? 'TIMEOUT'
              : 'PROVIDER_ERROR';
        lastCode = code;
        await this.log(opts, 'FAILED', 0, 0, Date.now() - started, userId, code);
        this.logger.warn({ feature: opts.feature, code, attempt }, 'LLM call failed');
        if (code === 'NOT_CONFIGURED') break;
        await new Promise((r) => setTimeout(r, 1_000 * attempt));
      }
    }
    this.logger.warn({ feature: opts.feature, code: lastCode }, 'AI unavailable after retries');
    throw aiUnavailable();
  }

  /** Month-to-date estimated spend vs AI_MONTHLY_BUDGET_USD (0 = no limit). */
  async usage(): Promise<{ monthToDateMicroUsd: number; budgetMicroUsd: number }> {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const agg = await this.prisma.aiRequest.aggregate({
      _sum: { estimatedCostMicroUsd: true },
      where: { createdAt: { gte: start } },
    });
    return {
      monthToDateMicroUsd: agg._sum.estimatedCostMicroUsd ?? 0,
      budgetMicroUsd: this.budgetMicroUsd,
    };
  }

  private async overBudget(): Promise<boolean> {
    if (this.budgetMicroUsd <= 0) return false;
    return (await this.usage()).monthToDateMicroUsd >= this.budgetMicroUsd;
  }

  /** Prompts are versioned files: `## System` and `## User` sections with {{placeholders}}. */
  private render(name: string, vars: Record<string, string>): LlmPrompt {
    if (!/^[a-z-]+\.v\d+$/.test(name)) throw new Error(`Invalid prompt name ${name}`);
    let tpl = this.prompts.get(name);
    if (!tpl) {
      const raw = readFileSync(path.join(PROMPTS_DIR, `${name}.md`), 'utf8');
      const [, system = '', user = ''] =
        /## System\s*([\s\S]*?)## User\s*([\s\S]*)$/.exec(raw) ?? [];
      tpl = { system: system.trim(), user: user.trim() };
      this.prompts.set(name, tpl);
    }
    const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
    return { system: fill(tpl.system), user: fill(tpl.user) };
  }

  private async log(
    opts: LlmRunOptions<z.ZodType>,
    status: 'SUCCEEDED' | 'FAILED' | 'INVALID_OUTPUT' | 'BUDGET_EXCEEDED',
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
    userId: string | null,
    errorCode: string | null,
  ): Promise<string> {
    const row = await this.prisma.aiRequest.create({
      data: {
        feature: opts.feature,
        provider: this.provider.name,
        model: this.provider.model,
        promptVersion: opts.prompt,
        inputTokens: Math.ceil(inputTokens),
        outputTokens: Math.ceil(outputTokens),
        estimatedCostMicroUsd: this.provider.costMicroUsd(inputTokens, outputTokens),
        latencyMs,
        status,
        errorCode,
        userId,
        entityType: opts.entity?.type ?? null,
        entityId: opts.entity?.id ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }

  private static createProvider(config: ConfigService<Env, true>): LlmProvider {
    const key = (k: 'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY') =>
      config.get(k, { infer: true });
    switch (config.get('LLM_DEFAULT_PROVIDER', { infer: true })) {
      case 'mock':
        return new MockProvider();
      case 'claude':
        return key('ANTHROPIC_API_KEY')
          ? new ClaudeProvider(
              key('ANTHROPIC_API_KEY')!,
              config.get('CLAUDE_MODEL', { infer: true }),
            )
          : new UnconfiguredProvider('claude');
      case 'openai':
        return key('OPENAI_API_KEY')
          ? new OpenAiProvider(key('OPENAI_API_KEY')!, config.get('OPENAI_MODEL', { infer: true }))
          : new UnconfiguredProvider('openai');
      default:
        return key('GEMINI_API_KEY')
          ? new GeminiProvider(key('GEMINI_API_KEY')!, config.get('GEMINI_MODEL', { infer: true }))
          : new UnconfiguredProvider('gemini');
    }
  }
}

/** No API key: every call fails fast with NOT_CONFIGURED, so the app degrades to manual entry. */
class UnconfiguredProvider implements LlmProvider {
  readonly model = 'none';
  constructor(readonly name: 'gemini' | 'claude' | 'openai') {}
  async complete(): Promise<never> {
    throw new LlmProviderError('NOT_CONFIGURED', `${this.name} API key is not set`);
  }
  costMicroUsd() {
    return 0;
  }
}

function safeJson(text: string): unknown {
  // Some models wrap JSON in ```json fences despite instructions.
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

@Global()
@Module({ providers: [LlmService], exports: [LlmService] })
export class LlmModule {}
