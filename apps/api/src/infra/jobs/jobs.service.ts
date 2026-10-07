import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PgBoss } from 'pg-boss';
import type { Env } from '../../common/config/env';

export type JobHandler<T> = (data: T) => Promise<void>;

/**
 * Background jobs on pg-boss (Postgres-backed, no Redis — CLAUDE.md §4).
 * Modules register handlers in their constructor and enqueue with `send()`.
 * In tests, or when the queue can't start, jobs run inline so the core flow never breaks
 * (CLAUDE.md §7); failures are logged, never thrown to the caller.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private boss?: PgBoss;
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private readonly connectionString?: string;
  private readonly inlineOnly: boolean;

  constructor(
    config: ConfigService<Env, true>,
    @InjectPinoLogger(JobsService.name) private readonly logger: PinoLogger,
  ) {
    this.connectionString = config.get('DATABASE_URL', { infer: true });
    this.inlineOnly = config.get('NODE_ENV', { infer: true }) === 'test' || !this.connectionString;
  }

  register<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  async send<T extends object>(name: string, data: T): Promise<void> {
    if (!this.handlers.has(name)) {
      throw new Error(`No job handler registered for "${name}"`);
    }
    if (this.boss) {
      await this.boss.send(name, data, { retryLimit: 5, retryBackoff: true, retryDelay: 30 });
      return;
    }
    await this.runInline(name, data);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.inlineOnly) {
      return;
    }
    const boss = new PgBoss({ connectionString: this.connectionString, schema: 'pgboss' });
    boss.on('error', (err) => this.logger.error({ err }, 'pg-boss error'));
    try {
      await boss.start();
      for (const [name, handler] of this.handlers) {
        await boss.createQueue(name);
        await boss.work<object>(name, async (jobs) => {
          for (const job of jobs) await handler(job.data);
        });
      }
      this.boss = boss;
      this.logger.info({ queues: [...this.handlers.keys()] }, 'Job queue started');
    } catch (err) {
      this.logger.error({ err }, 'Job queue unavailable; running jobs inline');
      await boss.stop({ graceful: false }).catch(() => undefined);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 10_000 });
  }

  private async runInline(name: string, data: unknown): Promise<void> {
    try {
      await this.handlers.get(name)?.(data);
    } catch (err) {
      this.logger.error({ err, job: name }, 'Inline job failed');
    }
  }
}
