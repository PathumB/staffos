import { Injectable } from '@nestjs/common';
import {
  SETTING_DEFAULTS,
  type Settings,
  type SettingsUpdate,
  settingsSchema,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Runtime settings stored in the `settings` table (docs/api-contract.md §2.23).
 * Missing or invalid values fall back to the code default, so a bad edit can't break a workflow.
 * Admins edit them on the Settings page (GET/PATCH /settings).
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectPinoLogger(SettingsService.name) private readonly logger: PinoLogger,
  ) {}

  /** Every editable setting, with defaults for the ones never saved. */
  async getAll(): Promise<Settings> {
    const keys = Object.keys(SETTING_DEFAULTS) as (keyof Settings)[];
    const rows = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    const out = { ...SETTING_DEFAULTS };
    for (const row of rows) {
      const key = row.key as keyof Settings;
      const parsed = settingsSchema.shape[key].safeParse(row.value);
      if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
    }
    return out;
  }

  async update(input: SettingsUpdate, actorId: string): Promise<Settings> {
    const before = await this.getAll();
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined) continue;
        await tx.setting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue, updatedById: actorId },
          update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
        });
      }
      await this.audit.record(
        { action: 'UPDATE', entity: 'settings', before, after: { ...before, ...input } },
        tx,
      );
    });
    return this.getAll();
  }

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
