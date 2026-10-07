import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEFAULT_APPROVAL_THRESHOLD,
  type ManpowerRequest,
  type ManpowerRequestInput,
  type ManpowerRequestListQuery,
  type ManpowerRequestUpdate,
  type Paginated,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import {
  fromDate,
  personName,
  toDate,
  todayInDubai,
  userNameSelect,
} from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  isInternal,
  manpowerRequestReadScope,
  manpowerRequestWriteScope,
  requestClientScope,
} from '../../common/scoping/crm-scope';
import { validationFailed } from '../../common/validation/validation.pipe';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { assertTransition, statusAfterSubmit } from './manpower-request.rules';

const include = {
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  decidedBy: userNameSelect,
  createdBy: userNameSelect,
} satisfies Prisma.ManpowerRequestInclude;
type Row = Prisma.ManpowerRequestGetPayload<{ include: typeof include }>;

function toDto(r: Row): ManpowerRequest {
  return {
    id: r.id,
    client: r.client,
    project: r.project,
    roleTitle: r.roleTitle,
    category: r.category,
    headcount: r.headcount,
    location: r.location,
    emirate: r.emirate,
    startDate: fromDate(r.startDate)!,
    durationMonths: r.durationMonths,
    billRateMinFils: r.billRateMinFils,
    billRateMaxFils: r.billRateMaxFils,
    currency: r.currency,
    requirements: r.requirements,
    status: r.status,
    version: r.version,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decidedBy: personName(r.decidedBy),
    decisionComment: r.decisionComment,
    cancelReason: r.cancelReason,
    createdBy: personName(r.createdBy),
    createdAt: r.createdAt.toISOString(),
  };
}

const snapshot = (r: ManpowerRequest) => ({
  status: r.status,
  headcount: r.headcount,
  roleTitle: r.roleTitle,
  startDate: r.startDate,
  version: r.version,
});

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'MANPOWER_REQUEST_NOT_FOUND',
    'Manpower request not found.',
  );

export const APPROVAL_THRESHOLD_KEY = 'manpowerApprovalThreshold';

@Injectable()
export class ManpowerRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(query: ManpowerRequestListQuery, actor: Actor): Promise<Paginated<ManpowerRequest>> {
    const f = query.filter ?? {};
    const where: Prisma.ManpowerRequestWhereInput = {
      AND: [
        manpowerRequestReadScope(actor),
        {
          status: f.status,
          clientId: f.clientId,
          category: f.category,
          client: { deletedAt: null },
        },
        query.search
          ? {
              OR: [
                { roleTitle: { contains: query.search, mode: 'insensitive' } },
                { location: { contains: query.search, mode: 'insensitive' } },
                { client: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.manpowerRequest.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.manpowerRequest.count({ where }),
    ]);
    return paginated(rows.map(toDto), total, query);
  }

  async get(id: string, actor: Actor): Promise<ManpowerRequest> {
    return toDto(await this.find(id, manpowerRequestReadScope(actor)));
  }

  /**
   * Internal users create a DRAFT for a client they manage. Client users always create for their
   * own company (any clientId they send is ignored) and the request lands as SUBMITTED for the
   * account manager to review (US-MR-03).
   */
  async create(input: ManpowerRequestInput, actor: Actor): Promise<ManpowerRequest> {
    const internal = isInternal(actor);
    const clientId = internal ? input.clientId : actor.clientId;
    if (!clientId) {
      throw validationFailed({ clientId: ['Choose a client.'] });
    }
    if (internal) {
      const allowed = await this.prisma.client.findFirst({
        where: { AND: [{ id: clientId, deletedAt: null }, requestClientScope(actor)] },
        select: { id: true },
      });
      if (!allowed)
        throw new AppException(HttpStatus.NOT_FOUND, 'CLIENT_NOT_FOUND', 'Client not found.');
    }
    this.assertStartDate(input.startDate);
    await this.assertProject(clientId, input.projectId);

    return this.prisma.$transaction(async (tx) => {
      const created = toDto(
        await tx.manpowerRequest.create({
          data: {
            clientId,
            projectId: input.projectId,
            roleTitle: input.roleTitle,
            category: input.category,
            headcount: input.headcount,
            location: input.location,
            emirate: input.emirate,
            startDate: toDate(input.startDate),
            durationMonths: input.durationMonths,
            billRateMinFils: input.billRateMinFils,
            billRateMaxFils: input.billRateMaxFils,
            requirements: input.requirements,
            status: internal ? 'DRAFT' : 'SUBMITTED',
            submittedAt: internal ? null : new Date(),
            createdById: actor.id,
          },
          include,
        }),
      );
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'manpower_request',
          entityId: created.id,
          after: { clientId, ...snapshot(created) },
        },
        tx,
      );
      return created;
    });
  }

  async update(id: string, input: ManpowerRequestUpdate, actor: Actor): Promise<ManpowerRequest> {
    const current = toDto(await this.find(id, manpowerRequestWriteScope(actor)));
    assertTransition(current.status, 'edit');
    if (input.startDate) this.assertStartDate(input.startDate);
    const { version, startDate, ...fields } = input;
    if (fields.billRateMinFils !== undefined || fields.billRateMaxFils !== undefined) {
      const min = fields.billRateMinFils ?? current.billRateMinFils;
      const max = fields.billRateMaxFils ?? current.billRateMaxFils;
      if (min !== null && max !== null && max < min) {
        throw validationFailed({ billRateMaxFils: ['Maximum rate must be at least the minimum.'] });
      }
    }
    await this.assertProject(current.client.id, fields.projectId);
    return this.change(id, version, 'UPDATE', current, {
      ...fields,
      startDate: startDate ? toDate(startDate) : undefined,
    });
  }

  /** Applies the headcount rule (US-MR-01). Client users can't submit; their account manager does. */
  async submit(id: string, version: number, actor: Actor): Promise<ManpowerRequest> {
    if (!isInternal(actor)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Your account manager reviews and submits requests.',
      );
    }
    const current = toDto(await this.find(id, manpowerRequestWriteScope(actor)));
    assertTransition(current.status, 'submit');
    const threshold = await this.settings.get(
      APPROVAL_THRESHOLD_KEY,
      z.number().int().min(1),
      DEFAULT_APPROVAL_THRESHOLD,
    );
    const status = statusAfterSubmit(current.headcount, threshold);
    const now = new Date();
    return this.change(id, version, 'SUBMIT', current, {
      status,
      submittedAt: now,
      // Small requests are approved by the rule itself, recorded as such.
      ...(status === 'APPROVED'
        ? { decidedAt: now, decisionComment: `Auto-approved: headcount ≤ ${threshold}.` }
        : {}),
    });
  }

  async approve(
    id: string,
    version: number,
    comment: string | undefined,
    actor: Actor,
  ): Promise<ManpowerRequest> {
    const current = toDto(await this.find(id, manpowerRequestReadScope(actor)));
    assertTransition(current.status, 'approve');
    return this.change(id, version, 'APPROVE', current, {
      status: 'APPROVED',
      decidedAt: new Date(),
      decidedById: actor.id,
      decisionComment: comment ?? null,
    });
  }

  async reject(
    id: string,
    version: number,
    comment: string,
    actor: Actor,
  ): Promise<ManpowerRequest> {
    const current = toDto(await this.find(id, manpowerRequestReadScope(actor)));
    assertTransition(current.status, 'reject');
    return this.change(id, version, 'REJECT', current, {
      status: 'REJECTED',
      decidedAt: new Date(),
      decidedById: actor.id,
      decisionComment: comment,
    });
  }

  async cancel(
    id: string,
    version: number,
    reason: string,
    actor: Actor,
  ): Promise<ManpowerRequest> {
    const current = toDto(await this.find(id, manpowerRequestWriteScope(actor)));
    assertTransition(current.status, 'cancel');
    if (!isInternal(actor) && current.status !== 'SUBMITTED' && current.status !== 'DRAFT') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Ask your account manager to cancel this request.',
      );
    }
    return this.change(id, version, 'CANCEL', current, {
      status: 'CANCELLED',
      cancelReason: reason,
    });
  }

  // ── Helpers ──

  /**
   * Optimistic locking: the update only applies if the version the client saw is still current,
   * so two people acting on the same request can't overwrite each other (409 STALE_VERSION).
   */
  private async change(
    id: string,
    version: number,
    action: string,
    before: ManpowerRequest,
    data: Prisma.ManpowerRequestUncheckedUpdateManyInput,
  ): Promise<ManpowerRequest> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.manpowerRequest.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'STALE_VERSION',
          'This request was changed by someone else. Reload and try again.',
          {
            currentVersion: before.version,
          },
        );
      }
      const after = toDto(await tx.manpowerRequest.findUniqueOrThrow({ where: { id }, include }));
      await this.audit.record(
        {
          action,
          entity: 'manpower_request',
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
  }

  private async find(id: string, scope: Prisma.ManpowerRequestWhereInput): Promise<Row> {
    const row = await this.prisma.manpowerRequest.findFirst({
      where: { AND: [{ id, client: { deletedAt: null } }, scope] },
      include,
    });
    if (!row) throw notFound();
    return row;
  }

  private assertStartDate(startDate: string): void {
    if (startDate < todayInDubai()) {
      throw validationFailed({ startDate: ['Start date must be today or later.'] });
    }
  }

  private async assertProject(clientId: string, projectId: string | undefined): Promise<void> {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, clientId },
      select: { id: true },
    });
    if (!project) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PROJECT_NOT_IN_CLIENT',
        'The project does not belong to this client.',
      );
    }
  }
}
