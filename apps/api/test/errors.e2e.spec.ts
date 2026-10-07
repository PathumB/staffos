import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema } from '@staffos/shared';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import { Public } from '../src/common/decorators/public.decorator';
import { AppException } from '../src/common/errors/app.exception';
import { createTestApp } from './utils/create-test-app';

class ProbeDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  headcount: number;
}

/** Test-only routes that exercise the global pipe and exception filter. */
@Public()
@Controller('__probe')
class ProbeController {
  @Post('validate')
  validate(@Body() body: ProbeDto): ProbeDto {
    return body;
  }

  @Get('business-error')
  businessError(): never {
    throw new AppException(HttpStatus.CONFLICT, 'INVALID_TRANSITION', 'Cannot move.', {
      from: 'APPLIED',
      to: 'HIRED',
    });
  }

  @Get('crash')
  crash(): never {
    throw new Error('secret internal detail at /srv/app.ts:42');
  }
}

describe('API error shape', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      prisma: { $queryRaw: jest.fn() },
      controllers: [ProbeController],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns NOT_FOUND with a traceId for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    const body = apiErrorSchema.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.traceId).toBe(res.headers['x-request-id']);
  });

  it('returns VALIDATION_FAILED with field details for invalid input', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/__probe/validate')
      .send({ name: 'Drivers', headcount: 0 })
      .expect(400);

    const body = apiErrorSchema.parse(res.body);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details).toEqual({ fields: { headcount: [expect.stringContaining('1')] } });
  });

  it('rejects unknown fields instead of silently dropping them', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/__probe/validate')
      .send({ name: 'Drivers', headcount: 5, isAdmin: true })
      .expect(400);

    expect(res.body.details.fields).toHaveProperty('isAdmin');
  });

  it('accepts valid input', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/__probe/validate')
      .send({ name: 'Drivers', headcount: 5 })
      .expect(201, { name: 'Drivers', headcount: 5 });
  });

  it('returns BAD_REQUEST for malformed JSON', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/__probe/validate')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);

    expect(apiErrorSchema.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('passes AppException code and details through', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/__probe/business-error')
      .expect(409);

    expect(apiErrorSchema.parse(res.body)).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'Cannot move.',
      details: { from: 'APPLIED', to: 'HIRED' },
    });
  });

  it('hides internal details of unexpected errors', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/__probe/crash').expect(500);

    const body = apiErrorSchema.parse(res.body);
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', details: {} });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(res.body).not.toHaveProperty('stack');
  });
});
