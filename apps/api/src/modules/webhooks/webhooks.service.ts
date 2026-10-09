import { lookup } from 'node:dns/promises';
import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type Paginated,
  SUBSCRIBABLE_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_NAMES,
  type Webhook,
  type WebhookDelivery,
  type WebhookDeliveryListQuery,
  type WebhookEvent,
  type WebhookInput,
  type WebhookUpdate,
  type WebhookWithSecret,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Actor } from '../../common/auth/actor';
import type { Env } from '../../common/config/env';
import { AppException } from '../../common/errors/app.exception';
import { paginated, toSkipTake } from '../../common/pagination/pagination';
import type { Prisma } from '../../generated/prisma/client';
import { DomainEventsService } from '../../infra/events/domain-events.service';
import { JobsService } from '../../infra/jobs/jobs.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  isPrivateAddress,
  newWebhookSecret,
  nextDeliveryState,
  SecretBox,
  signBody,
} from './webhook.rules';

export const WEBHOOK_DELIVER_JOB = 'webhooks.deliver';
export const WEBHOOK_RETRY_JOB = 'webhooks.retry';
const TIMEOUT_MS = 10_000;
/** A claimed delivery is retried by the sweeper if its worker died mid-attempt. */
const LEASE_MS = 2 * 60_000;
const RETRY_BATCH = 50;

/** Routing fields used inside StaffOS that endpoints don't need. */
const INTERNAL_FIELDS = new Set(['accountManagerId', 'recruiterIds']);

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'WEBHOOK_NOT_FOUND', 'Webhook not found.');

const lastDelivery = {
  deliveries: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const satisfies Prisma.WebhookInclude;
type Row = Prisma.WebhookGetPayload<{ include: typeof lastDelivery }>;

function toWebhook(w: Row): Webhook {
  const d = w.deliveries[0];
  return {
    id: w.id,
    url: w.url,
    events: w.events,
    active: w.active,
    lastDelivery: d
      ? { status: d.status, responseStatus: d.responseStatus, createdAt: d.createdAt.toISOString() }
      : null,
    createdAt: w.createdAt.toISOString(),
  };
}

type DeliveryRow = Prisma.WebhookDeliveryGetPayload<object>;
function toDelivery(d: DeliveryRow): WebhookDelivery {
  return {
    id: d.id,
    event: d.event,
    status: d.status,
    attempts: d.attempts,
    responseStatus: d.responseStatus,
    responseBody: d.responseBody,
    nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

/**
 * Outgoing webhooks (US-HOOK-01): signed with `X-StaffOS-Signature: sha256=<hmac>`, sent as
 * background jobs, retried with backoff up to 5 attempts, every attempt logged on the delivery.
 */
@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly box: SecretBox;
  private readonly production: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly events: DomainEventsService,
    config: ConfigService<Env, true>,
    @InjectPinoLogger(WebhooksService.name) private readonly logger: PinoLogger,
  ) {
    this.box = new SecretBox(
      config.get('WEBHOOK_SIGNING_SECRET', { infer: true }) ??
        config.get('JWT_REFRESH_SECRET', { infer: true }),
    );
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
    jobs.register<{ deliveryId: string }>(WEBHOOK_DELIVER_JOB, ({ deliveryId }) =>
      this.attempt(deliveryId).then(() => undefined),
    );
    jobs.schedule(WEBHOOK_RETRY_JOB, '* * * * *', async () => {
      await this.retryDue();
    });
  }

  onModuleInit(): void {
    for (const event of SUBSCRIBABLE_WEBHOOK_EVENTS) {
      this.events.on(event, (payload) => this.dispatch(event, payload));
    }
  }

  // ── Endpoints ──

  async list(): Promise<Webhook[]> {
    const rows = await this.prisma.webhook.findMany({
      where: { deletedAt: null },
      include: lastDelivery,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWebhook);
  }

  async create(input: WebhookInput, actor: Actor): Promise<WebhookWithSecret> {
    this.assertUrl(input.url);
    const secret = newWebhookSecret();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.webhook.create({
        data: {
          url: input.url,
          events: [...new Set(input.events)],
          active: input.active ?? true,
          secret: this.box.seal(secret),
          createdById: actor.id,
        },
        include: lastDelivery,
      });
      const after = toWebhook(row);
      await this.audit.record(
        { action: 'CREATE', entity: 'webhook', entityId: row.id, after }, // never the secret
        tx,
      );
      return { ...after, secret };
    });
  }

  async update(id: string, input: WebhookUpdate): Promise<Webhook> {
    const before = await this.find(id);
    if (input.url) this.assertUrl(input.url);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.webhook.update({
        where: { id },
        data: {
          url: input.url,
          events: input.events ? [...new Set(input.events)] : undefined,
          active: input.active,
        },
        include: lastDelivery,
      });
      const after = toWebhook(row);
      await this.audit.record(
        { action: 'UPDATE', entity: 'webhook', entityId: id, before: toWebhook(before), after },
        tx,
      );
      return after;
    });
  }

  async remove(id: string): Promise<void> {
    const before = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.webhook.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
      await this.audit.record(
        { action: 'DELETE', entity: 'webhook', entityId: id, before: toWebhook(before) },
        tx,
      );
    });
  }

  /** The old secret stops working immediately; the new one is shown once. */
  async rotateSecret(id: string): Promise<WebhookWithSecret> {
    await this.find(id);
    const secret = newWebhookSecret();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.webhook.update({
        where: { id },
        data: { secret: this.box.seal(secret) },
        include: lastDelivery,
      });
      await this.audit.record({ action: 'ROTATE_SECRET', entity: 'webhook', entityId: id }, tx);
      return { ...toWebhook(row), secret };
    });
  }

  async deliveries(
    id: string,
    query: WebhookDeliveryListQuery,
  ): Promise<Paginated<WebhookDelivery>> {
    await this.find(id);
    const where = { webhookId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);
    return paginated(rows.map(toDelivery), total, query);
  }

  /** Sends the same payload again as a new delivery (the original's log is kept). */
  async redeliver(deliveryId: string): Promise<WebhookDelivery> {
    const original = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, webhook: { deletedAt: null } },
    });
    if (!original) {
      throw new AppException(HttpStatus.NOT_FOUND, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
    }
    const copy = await this.prisma.webhookDelivery.create({
      data: {
        webhookId: original.webhookId,
        event: original.event,
        payload: original.payload as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      action: 'REDELIVER',
      entity: 'webhook_delivery',
      entityId: copy.id,
      after: { originalId: original.id },
    });
    await this.jobs.send(WEBHOOK_DELIVER_JOB, { deliveryId: copy.id });
    return toDelivery(
      await this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: copy.id } }),
    );
  }

  // ── Delivery ──

  /** Domain event → one delivery per active endpoint subscribed to it. */
  async dispatch(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    const hooks = await this.prisma.webhook.findMany({
      where: { active: true, deletedAt: null, events: { has: event } },
      select: { id: true },
    });
    for (const hook of hooks) await this.enqueue(hook.id, event, payload);
  }

  /** Also used by the `call_webhook` automation action, whatever the endpoint subscribes to. */
  async enqueue(
    webhookId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const data = Object.fromEntries(
      Object.entries(payload).filter(([key]) => !INTERNAL_FIELDS.has(key)),
    );
    const delivery = await this.prisma.webhookDelivery.create({
      data: { webhookId, event, payload: data as Prisma.InputJsonValue },
    });
    await this.jobs.send(WEBHOOK_DELIVER_JOB, { deliveryId: delivery.id });
    return delivery.id;
  }

  /** Cron sweeper: attempts whose backoff has elapsed (or whose worker died mid-attempt). */
  async retryDue(now = new Date()): Promise<number> {
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      select: { id: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: RETRY_BATCH,
    });
    for (const d of due) await this.attempt(d.id, now);
    return due.length;
  }

  /** One attempt. Returns the delivery's status afterwards (null if another worker has it). */
  async attempt(deliveryId: string, now = new Date()): Promise<string | null> {
    // Claim with a lease: concurrent workers/sweeper can't send the same attempt twice.
    const { count } = await this.prisma.webhookDelivery.updateMany({
      where: {
        id: deliveryId,
        status: 'PENDING',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
    });
    if (count === 0) return null;
    const d = await this.prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: { webhook: true },
    });
    let ok = false;
    let responseStatus: number | null = null;
    let responseBody: string;
    if (!d.webhook.active || d.webhook.deletedAt) {
      responseBody = 'Endpoint disabled; not sent.';
    } else {
      const body = JSON.stringify({
        id: d.id,
        event: WEBHOOK_EVENT_NAMES[d.event],
        createdAt: d.createdAt.toISOString(),
        data: d.payload,
      });
      try {
        await this.assertDeliverable(d.webhook.url);
        const res = await fetch(d.webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'StaffOS-Webhooks/1',
            'X-StaffOS-Event': WEBHOOK_EVENT_NAMES[d.event],
            'X-StaffOS-Delivery': d.id,
            'X-StaffOS-Signature': signBody(this.box.open(d.webhook.secret), body),
          },
          body,
          redirect: 'manual', // a redirect could point at an internal address
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        responseStatus = res.status;
        ok = res.status >= 200 && res.status < 300;
        responseBody = (await res.text().catch(() => '')).slice(0, 1_000);
      } catch (err) {
        responseBody = (err instanceof Error ? err.message : String(err)).slice(0, 1_000);
      }
    }
    const disabled = !d.webhook.active || Boolean(d.webhook.deletedAt);
    const next = disabled
      ? { status: 'FAILED' as const, nextAttemptAt: null }
      : nextDeliveryState({ ok, attempts: d.attempts, now: new Date() });
    await this.prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: next.status,
        nextAttemptAt: next.nextAttemptAt,
        responseStatus,
        responseBody,
        deliveredAt: ok ? new Date() : null,
      },
    });
    this.logger.info(
      {
        deliveryId: d.id,
        webhookId: d.webhookId,
        attempt: d.attempts,
        responseStatus,
        status: next.status,
      },
      'Webhook delivery attempt',
    );
    return next.status;
  }

  // ── Helpers ──

  private async find(id: string): Promise<Row> {
    const row = await this.prisma.webhook.findFirst({
      where: { id, deletedAt: null },
      include: lastDelivery,
    });
    if (!row) throw notFound();
    return row;
  }

  /** Registration check for obvious internal targets (the real check runs at send time). */
  private assertUrl(url: string): void {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    const internal =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      (Boolean(isIpLiteral(host)) && isPrivateAddress(host));
    if (this.production && internal) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'WEBHOOK_URL_NOT_ALLOWED',
        'Webhook URLs must point to a public internet address.',
      );
    }
  }

  /** In production every resolved address must be public (SSRF guard). */
  private async assertDeliverable(url: string): Promise<void> {
    if (!this.production) return;
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    const addresses = isIpLiteral(host)
      ? [{ address: host }]
      : await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      throw new Error('Refused: the URL resolves to a non-public address.');
    }
  }
}

function isIpLiteral(host: string): boolean {
  return /^[\d.]+$/.test(host) || host.includes(':');
}
