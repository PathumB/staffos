import { Global, Injectable, Module } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { z } from 'zod';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Runtime settings stored in the `settings` table (docs/api-contract.md §2.23).
 * Missing or invalid values fall back to the code default, so a bad edit can't break a workflow.
 * The admin screen for editing settings arrives with the settings module.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(SettingsService.name) private readonly logger: PinoLogger,
  ) {}

  async get<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return fallback;
    const parsed = schema.safeParse(row.value);
    if (!parsed.success) {
      this.logger.warn({ key }, 'Invalid setting value; using default');
      return fallback;
    }
    return parsed.data;
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
