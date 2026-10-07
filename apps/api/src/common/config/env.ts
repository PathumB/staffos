import { z } from 'zod';

// `.env` files produce empty strings for unset values; treat them as "not provided".
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const optionalBool = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
);

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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'is required in production',
      });
    }
    if (env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'must be an explicit allow-list, not *',
      });
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
