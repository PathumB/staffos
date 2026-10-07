import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiError, jsonResponse, mockApi, sessionResponse } from '@/test/render';
import { ApiClientError, apiFetch } from './api-client';
import { safeRedirect } from './safe-redirect';
import { getAccessToken, startSession } from './session';

const session = {
  accessToken: 'old-token',
  expiresIn: 900,
  user: (await sessionResponse().json()).user,
};

describe('apiFetch', () => {
  it('returns schema-validated data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'a' })));

    await expect(apiFetch('/x', z.object({ id: z.string() }))).resolves.toEqual({ id: 'a' });
  });

  it('throws ApiClientError carrying the API error shape and field errors', async () => {
    const fields = { email: ['Invalid'] };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(apiError('VALIDATION_FAILED', 400, 'Bad', { fields })),
    );

    const error = await apiFetch('/x', z.unknown()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', fieldErrors: fields });
  });

  it('builds a fallback error for non-JSON failures (e.g. proxy HTML)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })),
    );

    await expect(apiFetch('/x', z.unknown())).rejects.toMatchObject({
      status: 502,
      error: { code: 'HTTP_ERROR' },
    });
  });

  it('rejects responses that break the contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 1 })));

    await expect(apiFetch('/x', z.object({ id: z.string() }))).rejects.toBeInstanceOf(z.ZodError);
  });

  it('sends the bearer token, refreshes once on 401 and replays the request', async () => {
    startSession(session);
    let calls = 0;
    const fetchMock = mockApi({
      'GET /api/v1/secret': (init) => {
        calls += 1;
        const auth = (init?.headers as Record<string, string>).Authorization;
        return auth === 'Bearer access-token'
          ? jsonResponse({ ok: true })
          : apiError('TOKEN_EXPIRED', 401);
      },
      'POST /api/v1/auth/refresh': () => sessionResponse(),
    });

    await expect(apiFetch('/secret', z.object({ ok: z.boolean() }))).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBe('access-token');
  });

  it('shares one refresh between concurrent 401s', async () => {
    startSession(session);
    const fetchMock = mockApi({
      'GET /api/v1/a': (init) =>
        (init?.headers as Record<string, string>).Authorization === 'Bearer access-token'
          ? jsonResponse({})
          : apiError('TOKEN_EXPIRED', 401),
      'POST /api/v1/auth/refresh': () => sessionResponse(),
    });

    await Promise.all([apiFetch('/a', z.object({})), apiFetch('/a', z.object({}))]);

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh')),
    ).toHaveLength(1);
  });
});

describe('safeRedirect', () => {
  it.each([
    ['/admin/users?page=2', '/admin/users?page=2'],
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    ['/\\evil.example', '/'],
    [null, '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
