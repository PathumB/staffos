import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './common/config/env';
import { initSentry } from './infra/monitoring/sentry';

async function bootstrap(): Promise<void> {
  // Before Nest starts, so boot errors are reported too (no-op without SENTRY_DSN).
  initSentry(
    process.env.SENTRY_DSN,
    process.env.NODE_ENV ?? 'development',
    process.env.RENDER_GIT_COMMIT,
  );
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);
  const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
