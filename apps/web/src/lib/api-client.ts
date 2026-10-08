import { apiErrorSchema, type ApiError } from '@staffos/shared';
import type { z } from 'zod';
import { getAccessToken, refreshSession } from './session';

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

  get code(): string {
    return this.error.code;
  }

  /** Field errors from a 400 VALIDATION_FAILED response. */
  get fieldErrors(): Record<string, string[]> {
    const fields = this.error.details.fields;
    return fields && typeof fields === 'object' ? (fields as Record<string, string[]>) : {};
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

type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** Non-2xx statuses whose body is still a valid payload (e.g. 503 from /health). */
  acceptStatuses?: number[];
  /** Send the access token and retry once after refreshing on 401 (default true). */
  auth?: boolean;
};

async function send(
  path: string,
  { body, headers, auth, ...init }: ApiFetchOptions,
): Promise<Response> {
  const token = auth === false ? null : getAccessToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      // FormData sets its own multipart boundary header.
      ...(body === undefined || body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
}

/**
 * Calls a JSON endpoint and validates the response with a Zod schema, so contract drift shows up
 * as a clear error instead of `undefined` deep in a component. Pass `null` as schema for 204s.
 */
export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T> | null,
  options: ApiFetchOptions = {},
): Promise<T> {
  let res = await send(path, options);

  // Expired access token: refresh once (single-flight) and replay the request.
  if (res.status === 401 && options.auth !== false && getAccessToken()) {
    const session = await refreshSession();
    if (session) {
      res = await send(path, options);
    }
  }

  if (!res.ok && !options.acceptStatuses?.includes(res.status)) {
    throw new ApiClientError(res.status, await toApiError(res));
  }
  if (schema === null || res.status === 204 || res.status === 202) {
    return undefined as T;
  }
  return schema.parse(await res.json());
}
