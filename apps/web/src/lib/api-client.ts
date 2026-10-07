import { apiErrorSchema, type ApiError } from '@staffos/shared';
import type { z } from 'zod';

/** All API calls are same-origin (Vite proxy in dev, Vercel rewrite in prod). */
export const API_BASE = '/api/v1';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

/** Builds an ApiError even when the response isn't our JSON shape (e.g. a proxy's HTML 502 page). */
export async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => undefined);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    code: 'HTTP_ERROR',
    message: `Request failed with status ${res.status}.`,
    details: {},
    traceId: res.headers.get('x-request-id') ?? 'unknown',
  };
}

type ApiFetchOptions = RequestInit & {
  /** Non-2xx statuses whose body is still a valid payload (e.g. 503 from /health). */
  acceptStatuses?: number[];
};

/**
 * Fetches a JSON endpoint and validates the response with a Zod schema, so a contract drift
 * shows up as a clear error instead of `undefined` deep in a component.
 */
export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  { acceptStatuses = [], headers, ...init }: ApiFetchOptions = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...headers },
    credentials: 'same-origin',
  });

  if (!res.ok && !acceptStatuses.includes(res.status)) {
    throw new ApiClientError(res.status, await toApiError(res));
  }

  return schema.parse(await res.json());
}
