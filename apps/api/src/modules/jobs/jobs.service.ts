import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  APPLICATION_PIPELINE,
  type Job,
  type JobCreateData,
  type JobListQuery,
  type JobUpdate,
  type Paginated,
  type Pipeline,
  type RoleCode,
  SHORTLIST_STAGES,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { personName, userNameSelect } from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  applicationReadScope,
  isRecruitmentAdmin,
  jobReadScope,
} from '../../common/scoping/recruitment-scope';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  assertJobEditable,
  daysBetween,
  type JobAction,
  jobSlug,
  nextJobStatus,
} from '../applications/application.rules';

const include = {
  client: { select: { id: true, name: true } },
  hiringManager: userNameSelect,
  recruiters: { include: { user: userNameSelect }, orderBy: { createdAt: 'asc' } },
  skills: { orderBy: [{ weight: 'asc' }, { name: 'asc' }] },
  _count: { select: { applications: true } },
} satisfies Prisma.JobInclude;
type Row = Prisma.JobGetPayload<{ include: typeof include }>;

function toJob(j: Row): Job {
  return {
    id: j.id,
    slug: j.slug,
    title: j.title,
    description: j.description,
    category: j.category,
    location: j.location,
    emirate: j.emirate,
    headcount: j.headcount,
    salaryMinFils: j.salaryMinFils,
    salaryMaxFils: j.salaryMaxFils,
    currency: j.currency,
    showClientName: j.showClientName,
    status: j.status,
    version: j.version,
    client: j.client,
    manpowerRequestId: j.manpowerRequestId,
    hiringManager: personName(j.hiringManager)!,
    recruiters: j.recruiters.map((r) => personName(r.user)!),
    skills: j.skills.map((s) => ({ name: s.name, weight: s.weight, minYears: s.minYears })),
    applicationCount: j._count.applications,
    publishedAt: j.publishedAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
  };
}

const snapshot = (j: Job) => ({
  title: j.title,
  status: j.status,
  headcount: j.headcount,
  hiringManagerId: j.hiringManager.id,
  recruiterIds: j.recruiters.map((r) => r.id),
  skills: j.skills.map((s) => s.name),
  version: j.version,
});

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found.');
const stale = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'STALE_VERSION',
    'This job was changed by someone else. Reload and try again.',
  );

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: JobListQuery, actor: Actor): Promise<Paginated<Job>> {
    const f = query.filter ?? {};
    const where: Prisma.JobWhereInput = {
      AND: [
        jobReadScope(actor),
        {
          deletedAt: null,
          status: f.status,
          clientId: f.clientId,
          category: f.category,
          recruiters: f.recruiterId ? { some: { userId: f.recruiterId } } : undefined,
        },
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { location: { contains: query.search, mode: 'insensitive' } },
                { client: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.job.count({ where }),
    ]);
    return paginated(rows.map(toJob), total, query);
  }

  async get(id: string, actor: Actor): Promise<Job> {
    return toJob(await this.find(id, jobReadScope(actor)));
  }

  /** Opens a job from an APPROVED manpower request (US-JOBS-01); starts as DRAFT. */
  async create(input: JobCreateData, actor: Actor): Promise<Job> {
    const request = await this.prisma.manpowerRequest.findFirst({
      where: { id: input.manpowerRequestId, client: { deletedAt: null } },
    });
    if (!request) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'MANPOWER_REQUEST_NOT_FOUND',
        'Manpower request not found.',
      );
    }
    if (request.status !== 'APPROVED') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'REQUEST_NOT_APPROVED',
        'Only approved requests can be opened as jobs.',
        {
          status: request.status,
        },
      );
    }
    await this.assertUsers(input.recruiterIds, 'RECRUITER', 'INVALID_RECRUITER');
    await this.assertUsers([input.hiringManagerId], 'HIRING_MANAGER', 'INVALID_HIRING_MANAGER');
    const title = input.title ?? request.roleTitle;

    return this.prisma.$transaction(async (tx) => {
      const job = toJob(
        await tx.job.create({
          data: {
            manpowerRequestId: request.id,
            clientId: request.clientId,
            title,
            slug: jobSlug(title, randomBytes(3).toString('hex')),
            description: input.description,
            category: request.category,
            location: input.location ?? request.location,
            emirate: input.emirate ?? request.emirate,
            headcount: input.headcount ?? request.headcount,
            salaryMinFils: input.salaryMinFils,
            salaryMaxFils: input.salaryMaxFils,
            showClientName: input.showClientName,
            hiringManagerId: input.hiringManagerId,
            createdById: actor.id,
            recruiters: { create: [...new Set(input.recruiterIds)].map((userId) => ({ userId })) },
            skills: {
              create: input.skills.map((s) => ({
                name: s.name,
                weight: s.weight,
                minYears: s.minYears,
              })),
            },
          },
          include,
        }),
      );
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'job',
          entityId: job.id,
          after: { manpowerRequestId: request.id, ...snapshot(job) },
        },
        tx,
      );
      return job;
    });
  }

  async update(id: string, input: JobUpdate, actor: Actor): Promise<Job> {
    const before = toJob(await this.find(id, this.manageScope(actor)));
    assertJobEditable(before.status);
    if (input.recruiterIds)
      await this.assertUsers(input.recruiterIds, 'RECRUITER', 'INVALID_RECRUITER');
    if (input.hiringManagerId)
      await this.assertUsers([input.hiringManagerId], 'HIRING_MANAGER', 'INVALID_HIRING_MANAGER');
    const { version, recruiterIds, skills, salaryMinFils, salaryMaxFils, ...fields } = input;
    const min = salaryMinFils ?? before.salaryMinFils;
    const max = salaryMaxFils ?? before.salaryMaxFils;
    if (min !== null && max !== null && max < min) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed.',
        {
          fields: { salaryMaxFils: ['Maximum salary must be at least the minimum.'] },
        },
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.job.updateMany({
        where: { id, version },
        data: { ...fields, salaryMinFils, salaryMaxFils, version: { increment: 1 } },
      });
      if (count === 0) throw stale();
      if (recruiterIds) {
        await tx.jobRecruiter.deleteMany({ where: { jobId: id } });
        await tx.jobRecruiter.createMany({
          data: [...new Set(recruiterIds)].map((userId) => ({ jobId: id, userId })),
        });
      }
      if (skills) {
        await tx.jobSkill.deleteMany({ where: { jobId: id } });
        await tx.jobSkill.createMany({
          data: skills.map((s) => ({
            jobId: id,
            name: s.name,
            weight: s.weight,
            minYears: s.minYears,
          })),
        });
      }
      const after = toJob(await tx.job.findUniqueOrThrow({ where: { id }, include }));
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'job',
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
  }

  async changeStatus(id: string, action: JobAction, version: number, actor: Actor): Promise<Job> {
    const before = toJob(await this.find(id, this.manageScope(actor)));
    const status = nextJobStatus(before.status, action);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.job.updateMany({
        where: { id, version },
        data: {
          status,
          version: { increment: 1 },
          ...(action === 'publish' && !before.publishedAt ? { publishedAt: now } : {}),
          ...(action === 'close' ? { closedAt: now } : {}),
        },
      });
      if (count === 0) throw stale();
      const after = toJob(await tx.job.findUniqueOrThrow({ where: { id }, include }));
      await this.audit.record(
        {
          action: action.toUpperCase(),
          entity: 'job',
          entityId: id,
          before: { status: before.status },
          after: { status },
        },
        tx,
      );
      return after;
    });
  }

  /** Applications grouped by stage for the Kanban (US-APP-01), limited to what the actor may see. */
  async pipeline(id: string, actor: Actor): Promise<Pipeline> {
    const job = await this.find(id, jobReadScope(actor));
    const applications = await this.prisma.application.findMany({
      where: { AND: [{ jobId: id }, applicationReadScope(actor)] },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, currentTitle: true } },
      },
      orderBy: { stageChangedAt: 'asc' },
    });
    // Hiring managers and clients only ever see shortlisted stages, so only show those columns.
    const stages =
      isRecruitmentAdmin(actor) || actor.roles.includes('RECRUITER')
        ? [...APPLICATION_PIPELINE, 'REJECTED' as const, 'WITHDRAWN' as const]
        : [...SHORTLIST_STAGES];
    return {
      job: { id: job.id, title: job.title, status: job.status },
      columns: stages.map((stage) => {
        const items = applications.filter((a) => a.stage === stage);
        return {
          stage,
          count: items.length,
          applications: items.map((a) => ({
            id: a.id,
            version: a.version,
            stage: a.stage,
            candidate: {
              id: a.candidate.id,
              name: `${a.candidate.firstName} ${a.candidate.lastName}`,
              currentTitle: a.candidate.currentTitle,
            },
            daysInStage: daysBetween(a.stageChangedAt),
          })),
        };
      }),
    };
  }

  private manageScope(actor: Actor): Prisma.JobWhereInput {
    return isRecruitmentAdmin(actor) ? {} : { id: { in: [] } };
  }

  private async find(id: string, scope: Prisma.JobWhereInput): Promise<Row> {
    const job = await this.prisma.job.findFirst({
      where: { AND: [{ id, deletedAt: null }, scope] },
      include,
    });
    if (!job) throw notFound();
    return job;
  }

  /** Every id must be an active user holding the role (e.g. only recruiters can be assigned). */
  private async assertUsers(ids: string[], role: RoleCode, code: string): Promise<void> {
    const unique = [...new Set(ids)];
    const found = await this.prisma.user.count({
      where: { id: { in: unique }, status: 'ACTIVE', roles: { some: { role: { code: role } } } },
    });
    if (found !== unique.length) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        code,
        `Every selected user must be an active ${role.toLowerCase().replace('_', ' ')}.`,
      );
    }
  }
}
