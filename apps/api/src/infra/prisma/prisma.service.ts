import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { Env } from '../../common/config/env';

/**
 * The single Prisma client for the API. Connections are opened lazily on the first query, so the
 * app still boots (and /health reports `db: error`) when the database is unreachable.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    const connectionString = config.get('DATABASE_URL', { infer: true });
    if (!connectionString) {
      new Logger(PrismaService.name).warn('DATABASE_URL is not set; database calls will fail.');
    }
    super({
      adapter: new PrismaPg({ connectionString }),
      // Prisma's 5 s default is too tight for multi-step business transactions (hire: employee +
      // plan + tasks + audit) on a serverless database that may be waking from a cold start.
      transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
