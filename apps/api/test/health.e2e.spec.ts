import type { NestExpressApplication } from '@nestjs/platform-express';
import { healthResponseSchema } from '@staffos/shared';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app';

describe('GET /api/v1/health', () => {
  let app: NestExpressApplication;
  const queryRaw = jest.fn();

  beforeAll(async () => {
    app = await createTestApp({ prisma: { $queryRaw: queryRaw } });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => queryRaw.mockReset());

  it('is public and returns 200 with the shared health shape when the DB is up', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(healthResponseSchema.parse(res.body)).toMatchObject({
      status: 'ok',
      checks: { db: 'ok' },
    });
  });

  it('returns 503 with the same shape when the DB is down', async () => {
    queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);

    expect(healthResponseSchema.parse(res.body)).toMatchObject({
      status: 'error',
      checks: { db: 'error' },
    });
  });

  it('sets a request id and security headers', async () => {
    queryRaw.mockResolvedValue([]);

    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('echoes a well-formed incoming X-Request-Id and replaces a malformed one', async () => {
    queryRaw.mockResolvedValue([]);
    const server = app.getHttpServer();

    const good = await request(server).get('/api/v1/health').set('X-Request-Id', 'trace-1234abcd');
    const bad = await request(server).get('/api/v1/health').set('X-Request-Id', '<script>');

    expect(good.headers['x-request-id']).toBe('trace-1234abcd');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });

  it('allows CORS only for allow-listed origins', async () => {
    queryRaw.mockResolvedValue([]);
    const server = app.getHttpServer();

    const allowed = await request(server)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');
    const denied = await request(server)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
