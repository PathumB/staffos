import { z } from 'zod';

/**
 * The single error shape returned by every API endpoint (CLAUDE.md §8, api-contract.md §1.3).
 * The web client parses failed responses with this schema.
 */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
  traceId: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Generic codes used across modules. Module-specific codes (e.g. CANDIDATE_NOT_FOUND) live with the module. */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  STALE_VERSION: 'STALE_VERSION',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  HTTP_ERROR: 'HTTP_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
