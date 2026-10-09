import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SystemHealth } from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';
import { JobsService } from '../../infra/jobs/jobs.service';
import { LlmService } from '../../infra/llm/llm.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { seedAutomations } from '../../seed/automations';
import { seedAllDemo } from '../../seed/main';
import { seedOnboardingTemplates } from '../../seed/onboarding';
import { seedRbac } from '../../seed/rbac';
import { AuditService } from '../audit/audit.service';
import { ZOHO_SYNC_KEY } from './integrations.service';

export const DEMO_RESET_JOB = 'admin.demo-reset';

/** US-ADMIN-01: health details for admins and the demo-data reset (DEMO_MODE only). */
@Injectable()
export class AdminService {
  private readonly demoMode: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
    @InjectPinoLogger(AdminService.name) private readonly logger: PinoLogger,
  ) {
    this.demoMode = config.get('DEMO_MODE', { infer: true }) === true;
    jobs.register<object>(DEMO_RESET_JOB, async () => {
      await this.runDemoReset();
    });
  }

  async system(): Promise<SystemHealth> {
    const since = new Date(Date.now() - 86_400_000);
    let db: 'ok' | 'down' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    const [aiTotal, aiFailed, runsFailed, lastRun, hooksFailed, hooksPending, unsent, sync] =
      await Promise.all([
        this.prisma.aiRequest.count({ where: { createdAt: { gte: since } } }),
        this.prisma.aiRequest.count({
          where: { createdAt: { gte: since }, status: { not: 'SUCCEEDED' } },
        }),
        this.prisma.automationRun.count({ where: { createdAt: { gte: since }, status: 'FAILED' } }),
        this.prisma.automationRun.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.webhookDelivery.count({
          where: { createdAt: { gte: since }, status: 'FAILED' },
        }),
        this.prisma.webhookDelivery.count({ where: { status: 'PENDING' } }),
        this.prisma.notification.count({
          where: { sendEmail: true, emailedAt: null, createdAt: { gte: since } },
        }),
        this.prisma.setting.findUnique({ where: { key: ZOHO_SYNC_KEY } }),
      ]);
    const syncAt = (sync?.value as { at?: string } | undefined)?.at ?? null;
    return {
      db,
      demoMode: this.demoMode,
      queue: { mode: this.jobs.mode, pending: await this.jobs.queueDepth() },
      ai: {
        provider: this.llm.provider.name,
        model: this.llm.provider.model,
        last24h: aiTotal,
        failed24h: aiFailed,
      },
      automationRuns: { failed24h: runsFailed, last: lastRun?.createdAt.toISOString() ?? null },
      webhooks: { failed24h: hooksFailed, pending: hooksPending },
      notificationsUnsent: unsent,
      lastSync: { zoho: syncAt },
    };
  }

  async demoReset(): Promise<void> {
    if (!this.demoMode) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'DEMO_MODE_OFF',
        'Demo reset is only available in demo mode.',
      );
    }
    await this.audit.record({ action: 'DEMO_RESET', entity: 'system' });
    await this.jobs.send(DEMO_RESET_JOB, {});
  }

  /** Re-applies the same idempotent seed as `pnpm db:seed` (slow on a remote DB, so a job). */
  private async runDemoReset(): Promise<void> {
    const started = Date.now();
    await seedRbac(this.prisma);
    await seedOnboardingTemplates(this.prisma);
    await seedAutomations(this.prisma);
    await seedAllDemo(this.prisma);
    this.logger.info({ ms: Date.now() - started }, 'Demo data reset');
  }
}
