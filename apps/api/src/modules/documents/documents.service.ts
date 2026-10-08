import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Document,
  type DocumentListQuery,
  type DocumentOwnerType,
  type DocumentType,
  DOCUMENT_TYPE_LABELS,
  type DocumentUpdateData,
  type DocumentUploadData,
  EXPIRY_TRACKED_TYPES,
  expiryStatus,
  IDENTITY_DOCUMENT_TYPES,
  type SignedUrl,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { personName, todayInDubai, userNameSelect } from '../../common/errors/prisma-errors';
import { employeeReadScope, employeeWriteScope } from '../../common/scoping/hr-scope';
import { candidateReadScope, candidateWriteScope } from '../../common/scoping/recruitment-scope';
import type { Prisma } from '../../generated/prisma/client';
import { JobsService } from '../../infra/jobs/jobs.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ALERT_THRESHOLDS,
  detectFileKind,
  dueThreshold,
  maskNumber,
  sanitizeFileName,
  type UploadedFile,
} from './document.rules';

/** Signed URLs live 5 minutes (security.md §3). */
const URL_TTL_SECONDS = 300;
export const EXPIRY_JOB = 'documents.expiry';

const include = {
  createdBy: userNameSelect,
  employee: { select: { firstName: true, lastName: true } },
  candidate: { select: { firstName: true, lastName: true } },
} satisfies Prisma.DocumentInclude;
type Row = Prisma.DocumentGetPayload<{ include: typeof include }>;

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const isIdentity = (type: DocumentType) => IDENTITY_DOCUMENT_TYPES.includes(type);

function toDocument(d: Row, withOwnerName = false): Document {
  const owner = d.employee ?? d.candidate;
  return {
    id: d.id,
    ownerType: d.employeeId ? 'EMPLOYEE' : 'CANDIDATE',
    ownerId: (d.employeeId ?? d.candidateId)!,
    ownerName: withOwnerName && owner ? `${owner.firstName} ${owner.lastName}` : undefined,
    type: d.type,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    number: maskNumber(d.number),
    issueDate: isoDay(d.issueDate),
    expiryDate: isoDay(d.expiryDate),
    expiryStatus: expiryStatus(isoDay(d.expiryDate), todayInDubai()),
    uploadedBy: personName(d.createdBy),
    createdAt: d.createdAt.toISOString(),
  };
}

/** Audit copy without the document number (it's personal data; the log keeps the type/dates). */
function snapshot(d: {
  type: DocumentType;
  fileName: string;
  issueDate: Date | null;
  expiryDate: Date | null;
}) {
  return {
    type: d.type,
    fileName: d.fileName,
    issueDate: isoDay(d.issueDate),
    expiryDate: isoDay(d.expiryDate),
  };
}

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'DOCUMENT_NOT_FOUND', 'Document not found.');
const identityForbidden = () =>
  new AppException(
    HttpStatus.FORBIDDEN,
    'IDENTITY_DOCUMENT_FORBIDDEN',
    'Only HR can access identity documents (passport, visa, Emirates ID, labour card).',
  );

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @InjectPinoLogger(DocumentsService.name) private readonly logger: PinoLogger,
    jobs: JobsService,
  ) {
    // 02:00 UTC = 06:00 in Dubai, before the working day starts.
    jobs.schedule(EXPIRY_JOB, '0 2 * * *', async () => {
      await this.runExpiryCheck();
    });
  }

  private canSeeIdentity(actor: Actor) {
    return actor.permissions.has('documents:read-identity');
  }

  /** Documents of owners the actor can see; identity types only with `documents:read-identity`. */
  private readScope(actor: Actor, includeIdentity = this.canSeeIdentity(actor)) {
    return {
      deletedAt: null,
      OR: [{ candidate: candidateReadScope(actor) }, { employee: employeeReadScope(actor) }],
      ...(includeIdentity ? {} : { type: { notIn: [...IDENTITY_DOCUMENT_TYPES] } }),
    } satisfies Prisma.DocumentWhereInput;
  }

  async list(query: DocumentListQuery, actor: Actor): Promise<Document[]> {
    const rows = await this.prisma.document.findMany({
      where: {
        AND: [
          this.readScope(actor),
          query.ownerType === 'EMPLOYEE'
            ? { employeeId: query.ownerId }
            : { candidateId: query.ownerId },
        ],
      },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((d) => toDocument(d));
  }

  /** US-DOCS-01. Identity documents need `documents:read-identity` (HR, or the employee). */
  async upload(input: DocumentUploadData, file: UploadedFile | undefined, actor: Actor) {
    if (isIdentity(input.type) && !this.canSeeIdentity(actor)) throw identityForbidden();
    await this.assertOwnerWritable(input.ownerType, input.ownerId, actor);
    const kind = detectFileKind(file);
    const storageKey = `${input.ownerType.toLowerCase()}/${input.ownerId}/${randomUUID()}.${kind.ext}`;
    const fileName = sanitizeFileName(file!.originalname, kind.ext);

    // File first, then the row: if the database write fails, the orphaned file is removed.
    await this.storage.provider.put(storageKey, file!.buffer, kind.mimeType);
    try {
      const doc = await this.prisma.$transaction(async (tx) => {
        const row = await tx.document.create({
          data: {
            ...(input.ownerType === 'EMPLOYEE'
              ? { employeeId: input.ownerId }
              : { candidateId: input.ownerId }),
            type: input.type,
            fileName,
            storageKey,
            mimeType: kind.mimeType,
            sizeBytes: file!.size,
            number: input.number ?? null,
            issueDate: input.issueDate ? toDate(input.issueDate) : null,
            expiryDate: input.expiryDate ? toDate(input.expiryDate) : null,
            createdById: actor.id,
          },
          include,
        });
        await this.audit.record(
          {
            action: 'UPLOAD',
            entity: 'document',
            entityId: row.id,
            after: { ownerType: input.ownerType, ownerId: input.ownerId, ...snapshot(row) },
          },
          tx,
        );
        return row;
      });
      const result = toDocument(doc);
      // US-DOCS-01: an already-expired document is saved, with a warning.
      return result.expiryStatus === 'EXPIRED'
        ? { ...result, warnings: ['ALREADY_EXPIRED'] }
        : result;
    } catch (error) {
      await this.storage.provider.delete(storageKey).catch((err: unknown) => {
        this.logger.warn({ err, storageKey }, 'Orphaned upload not removed');
      });
      throw error;
    }
  }

  /** A 5-minute download link; every issue is audited as DOCUMENT_VIEWED. */
  async signedUrl(id: string, actor: Actor): Promise<SignedUrl> {
    const doc = await this.find(id, this.readScope(actor, true));
    if (isIdentity(doc.type) && !this.canSeeIdentity(actor)) throw identityForbidden();
    const url = await this.storage.provider.signedUrl(
      doc.storageKey,
      URL_TTL_SECONDS,
      doc.fileName,
    );
    await this.audit.record({
      action: 'DOCUMENT_VIEWED',
      entity: 'document',
      entityId: doc.id,
      after: { type: doc.type },
    });
    return { url, expiresAt: new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString() };
  }

  async update(id: string, input: DocumentUpdateData, actor: Actor): Promise<Document> {
    const before = await this.find(id, this.readScope(actor));
    await this.assertOwnerWritable(
      before.employeeId ? 'EMPLOYEE' : 'CANDIDATE',
      (before.employeeId ?? before.candidateId)!,
      actor,
    );
    if (input.type && isIdentity(input.type) && !this.canSeeIdentity(actor)) {
      throw identityForbidden();
    }
    const data: Prisma.DocumentUpdateInput = {
      ...(input.type ? { type: input.type } : {}),
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.issueDate !== undefined
        ? { issueDate: input.issueDate ? toDate(input.issueDate) : null }
        : {}),
      ...(input.expiryDate !== undefined
        ? { expiryDate: input.expiryDate ? toDate(input.expiryDate) : null }
        : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({ where: { id }, data, include });
      // A new expiry date restarts the alert cycle for this document.
      if (input.expiryDate !== undefined) {
        await tx.documentExpiryAlert.deleteMany({ where: { documentId: id } });
      }
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'document',
          entityId: id,
          before: snapshot(before),
          after: snapshot(row),
        },
        tx,
      );
      return toDocument(row);
    });
  }

  /** Soft delete: the file is kept for history and audit; it just stops being listed. */
  async remove(id: string, actor: Actor): Promise<void> {
    const doc = await this.find(id, this.readScope(actor));
    await this.assertOwnerWritable(
      doc.employeeId ? 'EMPLOYEE' : 'CANDIDATE',
      (doc.employeeId ?? doc.candidateId)!,
      actor,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        { action: 'DELETE', entity: 'document', entityId: id, before: snapshot(doc) },
        tx,
      );
    });
  }

  /** HR's renewal list: tracked employee documents expiring within `withinDays` (or expired). */
  async expiring(withinDays: number, actor: Actor): Promise<Document[]> {
    const limit = new Date(toDate(todayInDubai()).getTime() + withinDays * 86_400_000);
    const rows = await this.prisma.document.findMany({
      where: {
        AND: [
          this.readScope(actor),
          {
            employeeId: { not: null },
            employee: { status: { not: 'TERMINATED' } },
            type: { in: [...EXPIRY_TRACKED_TYPES] },
            expiryDate: { lte: limit },
          },
        ],
      },
      include,
      orderBy: { expiryDate: 'asc' },
      take: 200,
    });
    return rows.map((d) => toDocument(d, true));
  }

  /**
   * US-DOCS-02 nightly job: for each tracked employee document that reached an alert threshold
   * (30 or 7 days, or expired), notify HR (in-app + email) and open a renewal task, once per
   * document and threshold. The unique (document, threshold) row makes re-runs a no-op.
   */
  async runExpiryCheck(today = toDate(todayInDubai())): Promise<number> {
    const horizon = new Date(today.getTime() + Math.max(...ALERT_THRESHOLDS) * 86_400_000);
    const docs = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        type: { in: [...EXPIRY_TRACKED_TYPES] },
        expiryDate: { lte: horizon },
        employee: { status: { not: 'TERMINATED' }, deletedAt: null },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        expiryAlerts: { select: { thresholdDays: true } },
      },
    });
    const hr = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: 'HR_MANAGER' } } } },
      select: { id: true },
    });
    let alerted = 0;
    for (const doc of docs) {
      const threshold = dueThreshold(doc.expiryDate!, today);
      if (threshold === null || doc.expiryAlerts.some((a) => a.thresholdDays <= threshold))
        continue;
      const e = doc.employee!;
      const label = DOCUMENT_TYPE_LABELS[doc.type];
      const expired = doc.expiryDate! < today;
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.documentExpiryAlert.createMany({
          data: [{ documentId: doc.id, thresholdDays: threshold }],
          skipDuplicates: true,
        });
        if (count === 0) return; // another instance got there first
        await tx.task.create({
          data: {
            title: `Renew ${label.toLowerCase()} for ${e.firstName} ${e.lastName}`,
            description: `${e.employeeNumber}: ${label} ${expired ? 'expired' : 'expires'} on ${isoDay(doc.expiryDate)}.`,
            assigneeRole: 'HR_MANAGER',
            dueDate: doc.expiryDate,
            entityType: 'document',
            entityId: doc.id,
          },
        });
        await this.notifications.notify(
          hr.map((u) => u.id),
          {
            type: 'document.expiring',
            title: `${label} ${expired ? 'expired' : `expires in ≤ ${threshold} days`}: ${e.firstName} ${e.lastName}`,
            body: `${e.employeeNumber}: expiry ${isoDay(doc.expiryDate)}. A renewal task has been created.`,
            link: `/employees/${e.id}`,
          },
          tx,
        );
      });
      alerted += 1;
    }
    if (alerted) this.logger.info({ alerted }, 'Document expiry alerts sent');
    return alerted;
  }

  private async find(id: string, scope: Prisma.DocumentWhereInput) {
    const doc = await this.prisma.document.findFirst({ where: { AND: [{ id }, scope] }, include });
    if (!doc) throw notFound();
    return doc;
  }

  /** Recruiters for their candidates; HR for anyone; employees for themselves. */
  private async assertOwnerWritable(type: DocumentOwnerType, id: string, actor: Actor) {
    const found =
      type === 'EMPLOYEE'
        ? await this.prisma.employee.count({ where: { AND: [{ id }, employeeWriteScope(actor)] } })
        : await this.prisma.candidate.count({
            where: { AND: [{ id, deletedAt: null }, candidateWriteScope(actor)] },
          });
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        type === 'EMPLOYEE' ? 'EMPLOYEE_NOT_FOUND' : 'CANDIDATE_NOT_FOUND',
        type === 'EMPLOYEE' ? 'Employee not found.' : 'Candidate not found.',
      );
    }
  }
}
