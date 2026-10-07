import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { APP_VERSION } from '../../common/config/version';
import { withTimeout } from '../../common/utils/with-timeout';
import { PrismaService } from '../../infra/prisma/prisma.service';

// Neon's free tier suspends idle compute; waking it plus the TLS handshake takes ~3.5 s from
// the UAE. Still well under an uptime monitor's own timeout (30 s on UptimeRobot).
export const DB_CHECK_TIMEOUT_MS = 5000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(HealthService.name) private readonly logger: PinoLogger,
  ) {}

  async check(): Promise<HealthResponse> {
    const db = await this.checkDatabase();
    return {
      status: db,
      version: APP_VERSION,
      uptimeS: Math.floor(process.uptime()),
      checks: { db },
    };
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, DB_CHECK_TIMEOUT_MS, 'database check');
      return 'ok';
    } catch (error) {
      this.logger.warn({ err: error }, 'Health check: database unavailable');
      return 'error';
    }
  }
}
