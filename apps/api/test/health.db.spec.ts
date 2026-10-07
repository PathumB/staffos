import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app';

/**
 * Real-database integration test. Runs wherever DATABASE_URL_TEST is set: always in CI (Postgres
 * service container), and locally once the Neon `test` branch is configured.
 */
const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;

// A suspended Neon compute takes a few seconds to wake; Jest's 5 s default is too tight.
jest.setTimeout(30_000);

describeWithDb('GET /api/v1/health against Postgres', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the database as ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.checks.db).toBe('ok');
  });
});
