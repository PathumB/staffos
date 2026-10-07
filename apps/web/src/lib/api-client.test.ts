import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { jsonResponse } from '@/test/render';
import { ApiClientError, apiFetch } from './api-client';

describe('apiFetch', () => {
  it('returns schema-validated data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'a' })));

    await expect(apiFetch('/x', z.object({ id: z.string() }))).resolves.toEqual({ id: 'a' });
  });

  it('throws ApiClientError carrying the API error shape', async () => {
    const error = { code: 'FORBIDDEN', message: 'No.', details: {}, traceId: 't-1' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(error, 403)));

    const promise = apiFetch('/x', z.unknown());

    await expect(promise).rejects.toBeInstanceOf(ApiClientError);
    await expect(promise).rejects.toMatchObject({ status: 403, error });
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
});
