import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Application,
  ApplicationCreate,
  ApplicationListQuery,
  Paginated,
  TransitionInput,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { isUniqueViolation, personName, userNameSelect } from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  applicationReadScope,
  applicationWriteScope,
  candidateReadScope,
  jobPipelineWriteScope,
} from '../../common/scoping/recruitment-scope';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertStageTransition } from './application.rules';
import { HireService } from './hire.service';

const include = {
  candidate: { select: { id: true, firstName: true, lastName: true, currentTitle: true } },
  job: { select: { id: true, title: true, client: { select: { id: true, name: true } } } },
} satisfies Prisma.ApplicationInclude;
type Row = Prisma.ApplicationGetPayload<{ include: typeof include }>;

const historyInclude = {
  stageHistory: { orderBy: { changedAt: 'asc' }, include: { changedBy: userNameSelect } },
} satisfies Prisma.ApplicationInclude;

function toApplication(
  a: Row,
  history?: Prisma.ApplicationGetPayload<{ include: typeof historyInclude }>['stageHistory'],
): Application {
  return {
    id: a.id,
    stage: a.stage,
    version: a.version,
    rejectReason: a.rejectReason,
    appliedAt: a.appliedAt.toISOString(),
    stageChangedAt: a.stageChangedAt.toISOString(),
    candidate: {
      id: a.candidate.id,
      name: `${a.candidate.firstName} ${a.candidate.lastName}`,
      currentTitle: a.candidate.currentTitle,
    },
    job: a.job,
    history: history?.map((h) => ({
      fromStage: h.fromStage,
      toStage: h.toStage,
      reason: h.reason,
      changedBy: personName(h.changedBy),
      changedAt: h.changedAt.toISOString(),
    })),
  };
}

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'APPLICATION_NOT_FOUND', 'Application not found.');

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly hiring: HireService,
  ) {}

  async list(query: ApplicationListQuery, actor: Actor): Promise<Paginated<Application>> {
    const f = query.filter ?? {};
    const where: Prisma.ApplicationWhereInput = {
      AND: [
        applicationReadScope(actor),
        {
          jobId: f.jobId,
          candidateId: f.candidateId,
          stage: f.stage,
          candidate: { deletedAt: null },
        },
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.application.count({ where }),
    ]);
    return paginated(
      rows.map((a) => toApplication(a)),
      total,
      query,
    );
  }

  async get(id: string, actor: Actor): Promise<Application> {
    const row = await this.prisma.application.findFirst({
      where: { AND: [{ id }, applicationReadScope(actor)] },
      include: { ...include, ...historyInclude },
    });
    if (!row) throw notFound();
    return toApplication(row, row.stageHistory);
  }

  /** Adds a candidate to an OPEN job the actor works on; records the first history entry. */
  async create(input: ApplicationCreate, actor: Actor): Promise<Application> {
    const job = await this.prisma.job.findFirst({
      where: { AND: [{ id: input.jobId, deletedAt: null }, jobPipelineWriteScope(actor)] },
      select: { id: true, status: true },
    });
    if (!job) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found.');
    if (job.status !== 'OPEN') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'JOB_NOT_OPEN',
        'Candidates can only be added to open jobs.',
        { status: job.status },
      );
    }
    const candidate = await this.prisma.candidate.findFirst({
      where: { AND: [{ id: input.candidateId, deletedAt: null }, candidateReadScope(actor)] },
      select: { id: true },
    });
    if (!candidate)
      throw new AppException(HttpStatus.NOT_FOUND, 'CANDIDATE_NOT_FOUND', 'Candidate not found.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.application.create({
          data: {
            candidateId: candidate.id,
            jobId: job.id,
            createdById: actor.id,
            stageHistory: { create: { toStage: 'APPLIED', changedById: actor.id } },
          },
          include,
        });
        await this.audit.record(
          {
            action: 'CREATE',
            entity: 'application',
            entityId: created.id,
            after: { candidateId: candidate.id, jobId: job.id, stage: 'APPLIED' },
          },
          tx,
        );
        return toApplication(created);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_APPLIED',
          'This candidate is already in the pipeline for this job.',
        );
      }
      throw error;
    }
  }

  /**
   * The only way to change a stage (US-APP-02). Rules: one step forward or an exit, optimistic
   * locking on `version`, and an append-only history row in the same transaction. HIRED also
   * creates the employee and onboarding plan (US-OFFER-02).
   */
  async transition(id: string, input: TransitionInput, actor: Actor): Promise<Application> {
    const current = await this.prisma.application.findFirst({
      where: { AND: [{ id }, applicationWriteScope(actor), { candidate: { deletedAt: null } }] },
      include,
    });
    if (!current) throw notFound();
    assertStageTransition(current.stage, input.to);

    if (input.to === 'HIRED') {
      const accepted = await this.prisma.offer.count({
        where: { applicationId: id, status: 'ACCEPTED' },
      });
      if (accepted === 0) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'OFFER_NOT_ACCEPTED',
          'A candidate can only be hired after accepting an offer.',
        );
      }
    }

    const now = new Date();
    const exit = input.to === 'REJECTED' || input.to === 'WITHDRAWN';
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.application.updateMany({
        where: { id, version: input.version },
        data: {
          stage: input.to,
          stageChangedAt: now,
          version: { increment: 1 },
          ...(exit ? { rejectReason: input.reason } : {}),
          ...(input.to === 'HIRED' ? { hiredAt: now } : {}),
        },
      });
      if (count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'STALE_VERSION',
          'This application was moved by someone else. Reload and try again.',
          {
            currentVersion: current.version,
          },
        );
      }
      await tx.applicationStageHistory.create({
        data: {
          applicationId: id,
          fromStage: current.stage,
          toStage: input.to,
          reason: input.reason,
          changedById: actor.id,
          changedAt: now,
        },
      });
      // Same transaction: employee + onboarding plan exist only if the stage change commits.
      if (input.to === 'HIRED') await this.hiring.hire(tx, id, actor);
      await this.audit.record(
        {
          action: 'TRANSITION',
          entity: 'application',
          entityId: id,
          before: { stage: current.stage },
          after: { stage: input.to, reason: input.reason },
        },
        tx,
      );
      const after = await tx.application.findUniqueOrThrow({
        where: { id },
        include: { ...include, ...historyInclude },
      });
      return toApplication(after, after.stageHistory);
    });
  }
}
