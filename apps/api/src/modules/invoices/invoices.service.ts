import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Invoice,
  type InvoiceListQuery,
  lineAmountFils,
  type Paginated,
  type SignedUrl,
  vatFils,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { todayInDubai } from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import { invoiceReadScope } from '../../common/scoping/workforce-scope';
import { Prisma } from '../../generated/prisma/client';
import { DomainEventsService } from '../../infra/events/domain-events.service';
import { JobsService } from '../../infra/jobs/jobs.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { renderInvoicePdf } from './invoice-pdf';

export const INVOICE_PDF_JOB = 'invoices.pdf';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const URL_TTL_SECONDS = 300;

const include = {
  client: { select: { id: true, name: true } },
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: {
      deployment: { select: { employee: { select: { firstName: true, lastName: true } } } },
    },
  },
  _count: { select: { timesheets: true } },
} satisfies Prisma.InvoiceInclude;
type Row = Prisma.InvoiceGetPayload<{ include: typeof include }>;

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, days: number) =>
  new Date(toDate(s).getTime() + days * 86_400_000).toISOString().slice(0, 10);

function toInvoice(i: Row, withLines = true): Invoice {
  return {
    id: i.id,
    number: i.number,
    client: i.client,
    status: i.status,
    periodStart: isoDay(i.periodStart)!,
    periodEnd: isoDay(i.periodEnd)!,
    issueDate: isoDay(i.issueDate),
    dueDate: isoDay(i.dueDate),
    paidOn: isoDay(i.paidOn),
    currency: i.currency,
    subtotalFils: i.subtotalFils,
    vatRateBps: i.vatRateBps,
    vatFils: i.vatFils,
    totalFils: i.totalFils,
    voidReason: i.voidReason,
    pdfReady: Boolean(i.pdfStorageKey),
    timesheetCount: i._count.timesheets,
    lines: withLines
      ? i.lines.map((l) => ({
          deploymentId: l.deploymentId,
          employeeName: `${l.deployment.employee.firstName} ${l.deployment.employee.lastName}`,
          description: l.description,
          minutes: l.minutes,
          rateFils: l.rateFils,
          amountFils: l.amountFils,
        }))
      : undefined,
    version: i.version,
    createdAt: i.createdAt.toISOString(),
  };
}

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND', 'Invoice not found.');
const badState = (status: string, action: string) =>
  new AppException(
    HttpStatus.CONFLICT,
    'INVALID_INVOICE_TRANSITION',
    `A ${status.toLowerCase()} invoice cannot be ${action}.`,
    { status },
  );

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly events: DomainEventsService,
    private readonly jobs: JobsService,
    @InjectPinoLogger(InvoicesService.name) private readonly logger: PinoLogger,
  ) {
    jobs.register<{ invoiceId: string }>(INVOICE_PDF_JOB, async ({ invoiceId }) => {
      await this.generatePdf(invoiceId);
    });
  }

  async list(query: InvoiceListQuery, actor: Actor): Promise<Paginated<Invoice>> {
    const f = query.filter ?? {};
    const where: Prisma.InvoiceWhereInput = {
      AND: [invoiceReadScope(actor), { clientId: f.clientId, status: f.status }],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginated(
      rows.map((i) => toInvoice(i, false)),
      total,
      query,
    );
  }

  async get(id: string, actor: Actor): Promise<Invoice> {
    return toInvoice(await this.find(id, invoiceReadScope(actor)));
  }

  /**
   * US-INV-01: one DRAFT invoice per client and period from APPROVED timesheets whose week starts
   * in the period. One line per deployment (minutes × hourly rate), VAT at the client's rate,
   * all integer fils; the timesheets become INVOICED in the same transaction. With an
   * Idempotency-Key, a repeated call returns the first result and creates nothing.
   */
  async generate(
    input: { clientId: string; periodStart: string; periodEnd: string },
    idempotencyKey: string | undefined,
    actor: Actor,
  ): Promise<{ status: number; body: Invoice }> {
    const requestHash = createHash('sha256')
      .update(JSON.stringify([actor.id, input.clientId, input.periodStart, input.periodEnd]))
      .digest('hex');
    if (idempotencyKey) {
      const replay = await this.replay(idempotencyKey, requestHash);
      if (replay) return replay;
    }

    const client = await this.prisma.client.findFirst({
      where: { id: input.clientId, deletedAt: null },
      select: { id: true, vatRateBps: true },
    });
    if (!client)
      throw new AppException(HttpStatus.NOT_FOUND, 'CLIENT_NOT_FOUND', 'Client not found.');

    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        const sheets = await tx.timesheet.findMany({
          where: {
            clientId: client.id,
            status: 'APPROVED',
            invoiceId: null,
            weekStart: { gte: toDate(input.periodStart), lte: toDate(input.periodEnd) },
          },
          include: {
            deployment: {
              select: {
                id: true,
                billRateFils: true,
                project: { select: { name: true } },
                employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
              },
            },
          },
        });
        if (sheets.length === 0) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'NOTHING_TO_INVOICE',
            'There are no approved, uninvoiced timesheets for this client in this period.',
          );
        }

        const byDeployment = new Map<
          string,
          { dep: (typeof sheets)[number]['deployment']; minutes: number }
        >();
        for (const s of sheets) {
          const entry = byDeployment.get(s.deploymentId) ?? { dep: s.deployment, minutes: 0 };
          entry.minutes += s.totalMinutes;
          byDeployment.set(s.deploymentId, entry);
        }
        const lines = [...byDeployment.values()]
          .sort((a, b) => a.dep.employee.lastName.localeCompare(b.dep.employee.lastName))
          .map(({ dep, minutes }, sortOrder) => ({
            deploymentId: dep.id,
            description: `${dep.employee.firstName} ${dep.employee.lastName} (${dep.employee.employeeNumber}) · ${dep.project.name}`,
            minutes,
            rateFils: dep.billRateFils,
            amountFils: lineAmountFils(minutes, dep.billRateFils),
            sortOrder,
          }));
        const subtotal = lines.reduce((sum, l) => sum + l.amountFils, 0);
        const vat = vatFils(subtotal, client.vatRateBps);

        const created = await tx.invoice.create({
          data: {
            clientId: client.id,
            periodStart: toDate(input.periodStart),
            periodEnd: toDate(input.periodEnd),
            subtotalFils: subtotal,
            vatRateBps: client.vatRateBps,
            vatFils: vat,
            totalFils: subtotal + vat,
            createdById: actor.id,
            lines: { create: lines },
          },
        });
        // Conditional: a timesheet invoiced by a concurrent request makes this one roll back.
        const { count } = await tx.timesheet.updateMany({
          where: { id: { in: sheets.map((s) => s.id) }, status: 'APPROVED', invoiceId: null },
          data: { status: 'INVOICED', invoiceId: created.id, version: { increment: 1 } },
        });
        if (count !== sheets.length) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'CONCURRENT_CHANGE',
            'Some timesheets changed while generating. Try again.',
          );
        }
        await this.audit.record(
          {
            action: 'GENERATE',
            entity: 'invoice',
            entityId: created.id,
            after: {
              ...input,
              timesheets: sheets.length,
              totalFils: subtotal + vat,
            },
          },
          tx,
        );
        const body = toInvoice(
          await tx.invoice.findUniqueOrThrow({ where: { id: created.id }, include }),
        );
        if (idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              scope: 'invoices.generate',
              key: idempotencyKey,
              requestHash,
              responseStatus: 201,
              responseBody: body as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            },
          });
        }
        return body;
      });
      return { status: 201, body: invoice };
    } catch (error) {
      // Two identical requests at once: the loser rolls back and returns the winner's result.
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.replay(idempotencyKey, requestHash);
        if (replay) return replay;
      }
      throw error;
    }
  }

  /** Assigns the next number for the year, sets dates, queues the PDF and emits INVOICE_ISSUED. */
  async issue(id: string, version: number, actor: Actor): Promise<Invoice> {
    const before = await this.find(id, invoiceReadScope(actor));
    if (before.status !== 'DRAFT') throw badState(before.status, 'issued');
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: before.clientId },
      select: { paymentTermsDays: true },
    });
    const issueDate = todayInDubai();
    const year = Number(issueDate.slice(0, 4));
    const issued = await this.prisma.$transaction(async (tx) => {
      // Gap-free per year, safe under concurrency (the row is locked by the upsert).
      const [{ last_value: n }] = await tx.$queryRaw<[{ last_value: number }]>`
        INSERT INTO invoice_number_sequences (year, last_value) VALUES (${year}, 1)
        ON CONFLICT (year) DO UPDATE SET last_value = invoice_number_sequences.last_value + 1
        RETURNING last_value`;
      const number = `INV-${year}-${String(n).padStart(6, '0')}`;
      const { count } = await tx.invoice.updateMany({
        where: { id, version, status: 'DRAFT' },
        data: {
          status: 'ISSUED',
          number,
          issueDate: toDate(issueDate),
          dueDate: toDate(addDays(issueDate, client.paymentTermsDays)),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw this.stale(before.version);
      await this.audit.record(
        {
          action: 'ISSUE',
          entity: 'invoice',
          entityId: id,
          after: { number, totalFils: before.totalFils },
        },
        tx,
      );
      return tx.invoice.findUniqueOrThrow({ where: { id }, include });
    });
    try {
      await this.jobs.send(INVOICE_PDF_JOB, { invoiceId: id });
    } catch (err) {
      this.logger.warn(
        { err, invoiceId: id },
        'Invoice PDF job not queued; it will be built on first download',
      );
    }
    await this.events.emit('INVOICE_ISSUED', {
      invoiceId: id,
      number: issued.number,
      clientId: issued.clientId,
      totalFils: issued.totalFils,
      currency: issued.currency,
    });
    return toInvoice(issued);
  }

  /** Voiding (draft or issued) needs a reason; its timesheets become APPROVED again. */
  async void(
    id: string,
    input: { version: number; reason: string },
    actor: Actor,
  ): Promise<Invoice> {
    const before = await this.find(id, invoiceReadScope(actor));
    if (before.status !== 'DRAFT' && before.status !== 'ISSUED')
      throw badState(before.status, 'voided');
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.invoice.updateMany({
        where: { id, version: input.version, status: before.status },
        data: { status: 'VOID', voidReason: input.reason, version: { increment: 1 } },
      });
      if (count === 0) throw this.stale(before.version);
      const released = await tx.timesheet.updateMany({
        where: { invoiceId: id },
        data: { status: 'APPROVED', invoiceId: null, version: { increment: 1 } },
      });
      await this.audit.record(
        {
          action: 'VOID',
          entity: 'invoice',
          entityId: id,
          before: { status: before.status },
          after: { status: 'VOID', reason: input.reason, timesheetsReleased: released.count },
        },
        tx,
      );
      return toInvoice(await tx.invoice.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  /** US-INV-02: ISSUED → PAID on a date (not before the issue date). */
  async markPaid(
    id: string,
    input: { version: number; paidOn: string },
    actor: Actor,
  ): Promise<Invoice> {
    const before = await this.find(id, invoiceReadScope(actor));
    if (before.status !== 'ISSUED') throw badState(before.status, 'marked as paid');
    if (input.paidOn < isoDay(before.issueDate)!) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_PAYMENT_DATE',
        'The payment date cannot be before the issue date.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.invoice.updateMany({
        where: { id, version: input.version, status: 'ISSUED' },
        data: { status: 'PAID', paidOn: toDate(input.paidOn), version: { increment: 1 } },
      });
      if (count === 0) throw this.stale(before.version);
      await this.audit.record(
        { action: 'MARK_PAID', entity: 'invoice', entityId: id, after: { paidOn: input.paidOn } },
        tx,
      );
      return toInvoice(await tx.invoice.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  /** A 5-minute link to the PDF; built now if the background job hasn't run yet. */
  async pdfUrl(id: string, actor: Actor): Promise<SignedUrl> {
    const invoice = await this.find(id, invoiceReadScope(actor));
    if (!invoice.number) {
      throw new AppException(HttpStatus.CONFLICT, 'INVOICE_NOT_ISSUED', 'Issue the invoice first.');
    }
    const key = invoice.pdfStorageKey ?? (await this.generatePdf(id));
    const url = await this.storage.provider.signedUrl(
      key,
      URL_TTL_SECONDS,
      `${invoice.number}.pdf`,
    );
    return { url, expiresAt: new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString() };
  }

  /** Renders and stores the PDF of an issued invoice (idempotent); returns the storage key. */
  async generatePdf(id: string): Promise<string> {
    const inv = await this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: {
        client: { select: { name: true, trn: true, addressLine1: true, city: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (inv.pdfStorageKey) return inv.pdfStorageKey;
    if (!inv.number || !inv.issueDate || !inv.dueDate) throw badState(inv.status, 'printed');
    const pdf = await renderInvoicePdf({
      number: inv.number,
      issueDate: isoDay(inv.issueDate)!,
      dueDate: isoDay(inv.dueDate)!,
      periodStart: isoDay(inv.periodStart)!,
      periodEnd: isoDay(inv.periodEnd)!,
      currency: inv.currency,
      client: {
        name: inv.client.name,
        trn: inv.client.trn,
        address: [inv.client.addressLine1, inv.client.city, 'United Arab Emirates']
          .filter(Boolean)
          .join(', '),
      },
      lines: inv.lines,
      subtotalFils: inv.subtotalFils,
      vatRateBps: inv.vatRateBps,
      vatFils: inv.vatFils,
      totalFils: inv.totalFils,
    });
    const key = `invoice/${inv.id}/${randomUUID()}.pdf`;
    await this.storage.provider.put(key, pdf, 'application/pdf');
    // The immutability trigger allows pdf_storage_key to be set after issue.
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, pdfStorageKey: null },
      data: { pdfStorageKey: key },
    });
    if (count === 0) {
      await this.storage.provider.delete(key).catch(() => undefined);
      return (await this.prisma.invoice.findUniqueOrThrow({ where: { id } })).pdfStorageKey!;
    }
    return key;
  }

  private async replay(
    key: string,
    requestHash: string,
  ): Promise<{ status: number; body: Invoice } | null> {
    const saved = await this.prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope: 'invoices.generate', key } },
    });
    if (!saved || saved.expiresAt < new Date()) return null;
    if (saved.requestHash !== requestHash) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request.',
      );
    }
    return { status: saved.responseStatus, body: saved.responseBody as unknown as Invoice };
  }

  private stale(current: number) {
    return new AppException(
      HttpStatus.CONFLICT,
      'STALE_VERSION',
      'This invoice was changed by someone else. Reload and try again.',
      { currentVersion: current },
    );
  }

  private async find(id: string, scope: Prisma.InvoiceWhereInput) {
    const row = await this.prisma.invoice.findFirst({
      where: { AND: [{ id }, scope] },
      include: { ...include, client: { select: { id: true, name: true } } },
    });
    if (!row) throw notFound();
    return row;
  }
}
