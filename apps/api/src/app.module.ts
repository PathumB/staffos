import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { Env, validateEnv } from './common/config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loggerParams } from './common/logging/logger.config';
import { createValidationPipe } from './common/validation/validation.pipe';
import { PrismaModule } from './infra/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // One .env at the repo root (CLAUDE.md §17); production reads real env vars only.
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        loggerParams({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
    }),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
