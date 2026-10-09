import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IntegrationStatus } from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import { JobsService } from '../../infra/jobs/jobs.service';
import { LlmService } from '../../infra/llm/llm.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { type CrmProvider, ZohoCrmProvider } from './crm.providers';

export const ZOHO_SYNC_JOB = 'integrations.zoho-sync';
export const ZOHO_SYNC_KEY = 'zoho.lastSync';
export const CRM_PROVIDER = Symbol('CRM_PROVIDER');

export type SyncResult = { at: string; accounts: number; contacts: number; error: string | null };

/** Status of every external service (US-ADMIN-01) and the Zoho CRM client/contact sync. */
@Injectable()
export class IntegrationsService {
  readonly crm: CrmProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly llm: LlmService,
    private readonly config: ConfigService<Env, true>,
    @InjectPinoLogger(IntegrationsService.name) private readonly logger: PinoLogger,
  ) {
    this.crm = new ZohoCrmProvider({
      clientId: config.get('ZOHO_CLIENT_ID', { infer: true }),
      clientSecret: config.get('ZOHO_CLIENT_SECRET', { infer: true }),
      refreshToken: config.get('ZOHO_REFRESH_TOKEN', { infer: true }),
      accountsUrl: config.get('ZOHO_ACCOUNTS_URL', { infer: true }),
      apiUrl: config.get('ZOHO_API_URL', { infer: true }),
    });
    jobs.register<object>(ZOHO_SYNC_JOB, async () => {
      await this.syncZoho();
    });
  }

  status(): IntegrationStatus[] {
    const c = (k: keyof Env) => this.config.get(k, { infer: true });
    const mail = c('MAIL_PROVIDER') as string;
    const storage = c('STORAGE_PROVIDER') as string;
    const llm = this.llm.provider;
    return [
      {
        key: 'mail',
        name: 'Email',
        provider: mail === 'smtp' ? `SMTP (${String(c('SMTP_HOST'))})` : mail,
        status: mail === 'smtp' ? 'ok' : 'dev_only',
        detail:
          mail === 'smtp'
            ? 'Emails are delivered.'
            : 'Emails are written to the log, not delivered.',
      },
      {
        key: 'storage',
        name: 'File storage',
        provider: storage === 'supabase' ? 'Supabase Storage (private bucket)' : 'Local disk',
        status: storage === 'supabase' ? 'ok' : 'dev_only',
        detail:
          storage === 'supabase'
            ? 'Signed links valid for 5 minutes.'
            : 'Files live on the server disk and are lost on redeploy.',
      },
      {
        key: 'llm',
        name: 'AI provider',
        provider: `${llm.name} · ${llm.model}`,
        status: llm.name === 'mock' ? 'dev_only' : 'ok',
        detail:
          llm.name === 'mock'
            ? 'Deterministic test provider.'
            : 'Every call is logged with its cost.',
      },
      {
        key: 'zoho',
        name: 'CRM sync',
        provider: this.crm.name,
        status: this.crm.configured ? 'ok' : 'not_configured',
        detail: this.crm.configured
          ? 'Pushes clients and contacts to Zoho CRM.'
          : 'Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN to enable.',
      },
      {
        key: 'captcha',
        name: 'Careers CAPTCHA',
        provider: 'Cloudflare Turnstile',
        status: c('TURNSTILE_SECRET_KEY') ? 'ok' : 'not_configured',
        detail: c('TURNSTILE_SECRET_KEY')
          ? 'Applications are bot-checked.'
          : 'Applications are not bot-checked.',
      },
    ];
  }

  async startZohoSync(): Promise<{ jobId: string }> {
    if (!this.crm.configured) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INTEGRATION_NOT_CONFIGURED',
        'Zoho CRM is not configured.',
      );
    }
    await this.audit.record({ action: 'SYNC', entity: 'integration', after: { provider: 'zoho' } });
    await this.jobs.send(ZOHO_SYNC_JOB, {});
    return { jobId: ZOHO_SYNC_JOB };
  }

  /**
   * Pushes active clients, then their contacts, and stores the Zoho ids so later runs update the
   * same records. A failure is recorded (shown on the admin page) and never thrown to callers.
   */
  async syncZoho(): Promise<SyncResult> {
    let accounts = 0;
    let contacts = 0;
    let error: string | null = null;
    try {
      const clients = await this.prisma.client.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, city: true, zohoId: true },
        orderBy: { createdAt: 'asc' },
      });
      const accountIds = await this.crm.upsertAccounts(
        clients.map((c) => ({ id: c.zohoId, name: c.name, city: c.city })),
      );
      await this.linkIds(
        'clients',
        clients.map((c, i) => [c.id, c.zohoId, accountIds[i]!]),
      );
      accounts = clients.length;
      const zohoByClient = new Map(clients.map((c, i) => [c.id, accountIds[i]!]));
      const people = await this.prisma.clientContact.findMany({
        where: { deletedAt: null, clientId: { in: clients.map((c) => c.id) } },
        select: {
          id: true,
          clientId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          jobTitle: true,
          zohoId: true,
        },
      });
      const contactIds = await this.crm.upsertContacts(
        people.map((p) => ({
          id: p.zohoId,
          accountId: zohoByClient.get(p.clientId)!,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone,
          title: p.jobTitle,
        })),
      );
      await this.linkIds(
        'client_contacts',
        people.map((p, i) => [p.id, p.zohoId, contactIds[i]!]),
      );
      contacts = people.length;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.logger.warn({ err: error }, 'Zoho sync failed');
    }
    const result: SyncResult = { at: new Date().toISOString(), accounts, contacts, error };
    await this.prisma.setting.upsert({
      where: { key: ZOHO_SYNC_KEY },
      create: { key: ZOHO_SYNC_KEY, value: result as unknown as Prisma.InputJsonValue },
      update: { value: result as unknown as Prisma.InputJsonValue },
    });
    this.logger.info(result, 'Zoho sync finished');
    return result;
  }

  /**
   * Stores Zoho ids in bulk (one UPDATE per 200 rows). Zoho de-duplicates by name/email, so two
   * StaffOS rows can map to one Zoho record; the zoho_id column is unique, so only the first row
   * (or the row already holding it) keeps the link.
   */
  private async linkIds(
    table: 'clients' | 'client_contacts',
    rows: [id: string, current: string | null, zohoId: string][],
  ): Promise<void> {
    const held = new Set(rows.map(([, current]) => current).filter(Boolean));
    const seen = new Set<string>();
    const changes: [string, string][] = [];
    for (const [id, current, zohoId] of rows) {
      if (seen.has(zohoId)) continue;
      seen.add(zohoId);
      if (current === zohoId) continue;
      if (held.has(zohoId)) continue; // another row already links to this Zoho record
      changes.push([id, zohoId]);
    }
    // The table name is one of two literals above, never input.
    const target = Prisma.raw(table);
    for (let i = 0; i < changes.length; i += 200) {
      const values = Prisma.join(
        changes.slice(i, i + 200).map(([id, z]) => Prisma.sql`(${id}::uuid, ${z})`),
      );
      await this.prisma.$executeRaw`
        UPDATE ${target} AS t SET zoho_id = v.zoho_id
        FROM (VALUES ${values}) AS v(id, zoho_id)
        WHERE t.id = v.id AND NOT EXISTS (SELECT 1 FROM ${target} o WHERE o.zoho_id = v.zoho_id)`;
    }
  }
}
