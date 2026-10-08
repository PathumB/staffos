import { resolve } from 'node:path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { JwtAuthGuard, PermissionsGuard } from './common/auth/guards';
import { Env, validateEnv } from './common/config/env';
import { RequestContextMiddleware } from './common/context/request-context';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loggerParams } from './common/logging/logger.config';
import { AppValidationPipe } from './common/validation/validation.pipe';
import { DomainEventsModule } from './infra/events/domain-events.service';
import { JobsModule } from './infra/jobs/jobs.module';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { StorageModule } from './infra/storage/storage.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { CareersModule } from './modules/careers/careers.module';
import { ClientsModule } from './modules/clients/clients.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthModule } from './modules/health/health.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { JobsModule as RecruitmentJobsModule } from './modules/jobs/jobs.module';
import { ManpowerRequestsModule } from './modules/manpower-requests/manpower-requests.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OffersModule } from './modules/offers/offers.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { SettingsModule } from './modules/settings/settings.service';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { UsersModule } from './modules/users/users.module';

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
    ThrottlerModule.forRoot({
      // Generous default per IP; sensitive routes set tighter limits with @Throttle.
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // Integration tests hit login many times; rate-limit tests opt back in.
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.THROTTLE_IN_TESTS !== 'true',
    }),
    PrismaModule,
    JobsModule,
    MailModule,
    StorageModule,
    DomainEventsModule,
    AuthCoreModule,
    AuditModule,
    NotificationsModule,
    SettingsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ManpowerRequestsModule,
    RecruitmentJobsModule,
    CandidatesModule,
    ApplicationsModule,
    InterviewsModule,
    OffersModule,
    EmployeesModule,
    OnboardingModule,
    DocumentsModule,
    CareersModule,
    DeploymentsModule,
    TimesheetsModule,
    InvoicesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useClass: AppValidationPipe },
    // Order matters: rate limit first, then authenticate, then authorise (deny by default).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
