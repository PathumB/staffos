import { z } from 'zod';

export const healthCheckStatusSchema = z.enum(['ok', 'error']);

export const healthResponseSchema = z.object({
  status: healthCheckStatusSchema,
  version: z.string(),
  uptimeS: z.number().int().nonnegative(),
  checks: z.object({ db: healthCheckStatusSchema }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
