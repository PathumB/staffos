import { z } from 'zod';

// `.env` files produce empty strings for unset values; treat them as "not provided".
const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalString = z.preprocess(blankToUndefined, z.string().optional());
const optionalBool = z.preprocess(
  blankToUndefined,
  z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
);
const secret = z.string().min(32, 'must be at least 32 characters');

/**
 * Environment contract for the API. The app refuses to boot when this fails (security.md §8).
 * Variables are added here when the module that needs them lands; .env.example lists them all.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    APP_URL: z.url().default('http://localhost:5173'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((s) =>
        s
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    SWAGGER_ENABLED: optionalBool,
    DEMO_MODE: optionalBool,
    DATABASE_URL: optionalString,
    JWT_ACCESS_SECRET: secret,
    // Keys the HMAC used to hash refresh/reset/invite tokens at rest (a DB leak alone can't
    // be used to verify or forge them). Name kept from CLAUDE.md §17.
    JWT_REFRESH_SECRET: secret,
    MAIL_PROVIDER: z.preprocess(
      blankToUndefined,
      z.enum(['console', 'ethereal', 'smtp']).default('console'),
    ),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().optional()),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    STORAGE_PROVIDER: z.preprocess(
      blankToUndefined,
      z.enum(['local', 'supabase']).default('local'),
    ),
    /** Local provider only: folder for uploads (git-ignored). */
    STORAGE_LOCAL_DIR: z.preprocess(blankToUndefined, z.string().default('uploads')),
    SUPABASE_URL: z.preprocess(blankToUndefined, z.url().optional()),
    SUPABASE_SERVICE_KEY: optionalString,
    SUPABASE_BUCKET: z.preprocess(blankToUndefined, z.string().default('documents')),
    LLM_DEFAULT_PROVIDER: z.preprocess(
      blankToUndefined,
      z.enum(['gemini', 'claude', 'openai', 'mock']).default('gemini'),
    ),
    GEMINI_API_KEY: optionalString,
    GEMINI_MODEL: z.preprocess(blankToUndefined, z.string().default('gemini-3.8-flash')),
    ANTHROPIC_API_KEY: optionalString,
    CLAUDE_MODEL: z.preprocess(blankToUndefined, z.string().default('claude-haiku-4-5-20251001')),
    OPENAI_API_KEY: optionalString,
    OPENAI_MODEL: z.preprocess(blankToUndefined, z.string().default('gpt-4o-mini')),
    /** Month-to-date AI spend limit in USD; 0 = no limit (the free Gemini tier costs nothing). */
    AI_MONTHLY_BUDGET_USD: z.preprocess(blankToUndefined, z.coerce.number().min(0).default(0)),
    /** Encrypts webhook endpoint secrets at rest; unset = derived from JWT_REFRESH_SECRET. */
    WEBHOOK_SIGNING_SECRET: z.preprocess(blankToUndefined, secret.optional()),
    /** Cloudflare Turnstile (free CAPTCHA) for the public apply form; unset = not checked. */
    TURNSTILE_SECRET_KEY: optionalString,
    MAIL_FROM: z.preprocess(
      blankToUndefined,
      z.string().default('StaffOS <no-reply@staffos.local>'),
    ),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (env.STORAGE_PROVIDER === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)) {
      issue(
        'SUPABASE_URL',
        'SUPABASE_URL and SUPABASE_SERVICE_KEY are required for supabase storage',
      );
    }
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
      issue('DATABASE_URL', 'is required in production');
    }
    if (env.CORS_ORIGINS.includes('*')) {
      issue('CORS_ORIGINS', 'must be an explicit allow-list, not *');
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      issue('JWT_REFRESH_SECRET', 'must differ from JWT_ACCESS_SECRET');
    }
    if (env.MAIL_PROVIDER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'] as const) {
        if (!env[key]) issue(key, 'is required when MAIL_PROVIDER=smtp');
      }
    }
  });

export type Env = z.output<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
