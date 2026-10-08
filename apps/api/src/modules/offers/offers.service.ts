import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ACTIVE_OFFER_STATUSES,
  nextOfferStatus,
  OFFER_STATUS_LABELS,
  type Offer,
  type OfferAction,
  type OfferCreateData,
  type OfferListQuery,
  type Paginated,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { personName, todayInDubai, userNameSelect } from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  applicationWriteScope,
  canApproveOffer,
  offerReadScope,
  offerWriteScope,
} from '../../common/scoping/recruitment-scope';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const include = {
  application: {
    select: {
      id: true,
      candidate: { select: { id: true, firstName: true, lastName: true } },
      job: {
        select: {
          id: true,
          title: true,
          hiringManagerId: true,
          recruiters: { select: { userId: true } },
        },
      },
    },
  },
  approvedBy: userNameSelect,
} satisfies Prisma.OfferInclude;
type Row = Prisma.OfferGetPayload<{ include: typeof include }>;

const PAST_TENSE: Record<OfferAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  send: 'sent',
  accept: 'accepted',
  decline: 'declined',
  withdraw: 'withdrawn',
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function toOffer(o: Row): Offer {
  const c = o.application.candidate;
  return {
    id: o.id,
    applicationId: o.application.id,
    salaryFils: o.salaryFils,
    currency: o.currency,
    startDate: isoDay(o.startDate),
    contractType: o.contractType,
    contractMonths: o.contractMonths,
    notes: o.notes,
    status: o.status,
    version: o.version,
    candidate: { id: c.id, name: `${c.firstName} ${c.lastName}` },
    job: { id: o.application.job.id, title: o.application.job.title },
    approvedBy: personName(o.approvedBy),
    approvedAt: o.approvedAt?.toISOString() ?? null,
    sentAt: o.sentAt?.toISOString() ?? null,
    respondedAt: o.respondedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  };
}

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'OFFER_NOT_FOUND', 'Offer not found.');
const offerExists = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'OFFER_EXISTS',
    'This candidate already has an open or accepted offer. Withdraw it first.',
  );

/** Postgres exclusion violation from `offers_one_active_per_application` (concurrent creates). */
function isActiveOfferConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes('offers_one_active_per_application');
}

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: OfferListQuery, actor: Actor): Promise<Paginated<Offer>> {
    const f = query.filter ?? {};
    const where: Prisma.OfferWhereInput = {
      AND: [offerReadScope(actor), { applicationId: f.applicationId, status: f.status }],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.offer.count({ where }),
    ]);
    return paginated(rows.map(toOffer), total, query);
  }

  async get(id: string, actor: Actor): Promise<Offer> {
    return toOffer(await this.find(id, offerReadScope(actor)));
  }

  /** US-OFFER-01: created as PENDING_APPROVAL for an application in the Offer stage. */
  async create(input: OfferCreateData, actor: Actor): Promise<Offer> {
    const application = await this.prisma.application.findFirst({
      where: {
        AND: [
          { id: input.applicationId, candidate: { deletedAt: null } },
          applicationWriteScope(actor),
        ],
      },
      select: { id: true, stage: true, job: { select: { hiringManagerId: true, title: true } } },
    });
    if (!application) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'APPLICATION_NOT_FOUND',
        'Application not found.',
      );
    }
    if (application.stage !== 'OFFER') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'APPLICATION_NOT_IN_OFFER',
        'Move the candidate to the Offer stage before creating an offer.',
        { stage: application.stage },
      );
    }
    if (input.startDate < todayInDubai()) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'START_DATE_IN_PAST',
        'The start date cannot be in the past.',
      );
    }
    const active = await this.prisma.offer.count({
      where: { applicationId: application.id, status: { in: [...ACTIVE_OFFER_STATUSES] } },
    });
    if (active > 0) throw offerExists();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const offer = await tx.offer.create({
          data: {
            applicationId: application.id,
            salaryFils: input.salaryFils,
            currency: input.currency,
            startDate: new Date(`${input.startDate}T00:00:00Z`),
            contractType: input.contractType,
            contractMonths: input.contractMonths ?? null,
            notes: input.notes ?? null,
            createdById: actor.id,
          },
          include,
        });
        await this.audit.record(
          { action: 'CREATE', entity: 'offer', entityId: offer.id, after: snapshot(offer) },
          tx,
        );
        const c = offer.application.candidate;
        await this.notifications.notify(
          [application.job.hiringManagerId],
          {
            type: 'offer.approval_needed',
            title: `Offer to approve: ${c.firstName} ${c.lastName}`,
            body: application.job.title,
            link: `/applications/${application.id}`,
          },
          tx,
        );
        return toOffer(offer);
      });
    } catch (error) {
      if (isActiveOfferConflict(error)) throw offerExists();
      throw error;
    }
  }

  /**
   * Every status change goes through here: the shared lifecycle decides what is allowed, the
   * version check stops two people acting on a stale offer, and the change is audited.
   */
  async act(
    id: string,
    action: OfferAction,
    input: { version: number; reason?: string },
    actor: Actor,
  ): Promise<Offer> {
    const approval = action === 'approve' || action === 'reject';
    const current = await this.find(id, approval ? offerReadScope(actor) : offerWriteScope(actor));
    if (approval && !canApproveOffer(actor, current.application.job.hiringManagerId)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'NOT_OFFER_APPROVER',
        "Only the job's hiring manager or an HR Manager can approve offers.",
      );
    }
    const to = nextOfferStatus(current.status, action);
    if (!to) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_OFFER_TRANSITION',
        `An offer that is ${OFFER_STATUS_LABELS[current.status].toLowerCase()} cannot be ${PAST_TENSE[action]}.`,
        { status: current.status, action },
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.offer.updateMany({
        where: { id, version: input.version },
        data: {
          status: to,
          version: { increment: 1 },
          ...(action === 'approve' ? { approvedById: actor.id, approvedAt: now } : {}),
          ...(action === 'send' ? { sentAt: now } : {}),
          ...(action === 'accept' || action === 'decline' ? { respondedAt: now } : {}),
        },
      });
      if (count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'STALE_VERSION',
          'This offer was changed by someone else. Reload and try again.',
          { currentVersion: current.version },
        );
      }
      await this.audit.record(
        {
          action: `OFFER_${action.toUpperCase()}`,
          entity: 'offer',
          entityId: id,
          before: { status: current.status },
          after: { status: to, reason: input.reason },
        },
        tx,
      );
      const c = current.application.candidate;
      const recruiters = current.application.job.recruiters.map((r) => r.userId);
      const message: Record<string, string | undefined> = {
        approve: 'approved — ready to send',
        reject: 'rejected by the approver',
        accept: 'accepted — ready to hire',
        decline: 'declined by the candidate',
      };
      if (message[action]) {
        await this.notifications.notify(
          recruiters,
          {
            type: `offer.${action}`,
            title: `Offer ${message[action]}: ${c.firstName} ${c.lastName}`,
            body: input.reason,
            link: `/applications/${current.application.id}`,
          },
          tx,
        );
      }
      return toOffer(await tx.offer.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  private async find(id: string, scope: Prisma.OfferWhereInput): Promise<Row> {
    const row = await this.prisma.offer.findFirst({
      where: { AND: [{ id, application: { candidate: { deletedAt: null } } }, scope] },
      include,
    });
    if (!row) throw notFound();
    return row;
  }
}

function snapshot(o: Row) {
  return {
    applicationId: o.application.id,
    salaryFils: o.salaryFils,
    currency: o.currency,
    startDate: isoDay(o.startDate),
    contractType: o.contractType,
    contractMonths: o.contractMonths,
    status: o.status,
  };
}
