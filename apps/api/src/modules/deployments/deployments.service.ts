import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Deployment,
  DeploymentCreateData,
  DeploymentListQuery,
  Paginated,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { todayInDubai } from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import { isHrAdmin } from '../../common/scoping/hr-scope';
import {
  canSeeBilling,
  deploymentReadScope,
  deploymentWriteScope,
  projectWriteScope,
} from '../../common/scoping/workforce-scope';
import type { Prisma } from '../../generated/prisma/client';
import { JobsService } from '../../infra/jobs/jobs.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { deploymentStatusOn, initialDeploymentStatus } from '../timesheets/workforce.rules';

export const DEPLOYMENT_STATUS_JOB = 'deployments.status';

const include = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
  project: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
} satisfies Prisma.DeploymentInclude;
type Row = Prisma.DeploymentGetPayload<{ include: typeof include }>;

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

function toDeployment(d: Row, actor: Actor): Deployment {
  const e = d.employee;
  return {
    id: d.id,
    employee: { id: e.id, name: `${e.firstName} ${e.lastName}`, employeeNumber: e.employeeNumber },
    project: d.project,
    client: d.client,
    startDate: isoDay(d.startDate)!,
    endDate: isoDay(d.endDate),
    billRateFils: canSeeBilling(actor) ? d.billRateFils : null,
    currency: d.currency,
    status: d.status,
    overrideReason: d.overrideReason,
    endReason: d.endReason,
    version: d.version,
    createdAt: d.createdAt.toISOString(),
  };
}

const snapshot = (d: Row) => ({
  employeeId: d.employeeId,
  projectId: d.projectId,
  startDate: isoDay(d.startDate),
  endDate: isoDay(d.endDate),
  billRateFils: d.billRateFils,
  status: d.status,
});

const overlap = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'DEPLOYMENT_OVERLAP',
    'This employee already has a deployment in these dates.',
  );
const isOverlapViolation = (error: unknown) =>
  error instanceof Error && error.message.includes('deployments_no_overlap');

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectPinoLogger(DeploymentsService.name) private readonly logger: PinoLogger,
    jobs: JobsService,
  ) {
    // 20:05 UTC = 00:05 in Dubai: statuses follow the UAE calendar day.
    jobs.schedule(DEPLOYMENT_STATUS_JOB, '5 20 * * *', async () => {
      await this.syncStatuses();
    });
  }

  async list(query: DeploymentListQuery, actor: Actor): Promise<Paginated<Deployment>> {
    const f = query.filter ?? {};
    const search = query.search?.trim();
    const where: Prisma.DeploymentWhereInput = {
      AND: [
        deploymentReadScope(actor),
        {
          clientId: f.clientId,
          projectId: f.projectId,
          employeeId: f.employeeId,
          status: f.status,
        },
        search
          ? {
              OR: [
                { employee: { firstName: { contains: search, mode: 'insensitive' } } },
                { employee: { lastName: { contains: search, mode: 'insensitive' } } },
                { project: { name: { contains: search, mode: 'insensitive' } } },
                { client: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.deployment.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.deployment.count({ where }),
    ]);
    return paginated(
      rows.map((d) => toDeployment(d, actor)),
      total,
      query,
    );
  }

  async get(id: string, actor: Actor): Promise<Deployment> {
    return toDeployment(await this.find(id, deploymentReadScope(actor)), actor);
  }

  /**
   * US-DEP-01: the project must be one the actor manages; the employee must have finished
   * onboarding unless an HR Manager overrides with a reason; overlaps are refused (409), also by
   * the database exclusion constraint.
   */
  async create(input: DeploymentCreateData, actor: Actor): Promise<Deployment> {
    const project = await this.prisma.project.findFirst({
      where: { AND: [{ id: input.projectId }, projectWriteScope(actor)] },
      select: { id: true, clientId: true, status: true },
    });
    if (!project) {
      throw new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    if (project.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PROJECT_NOT_ACTIVE',
        'People can only be deployed to active projects.',
      );
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, deletedAt: null },
      select: { id: true, status: true, onboardingPlan: { select: { status: true } } },
    });
    if (!employee) {
      throw new AppException(HttpStatus.NOT_FOUND, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
    }
    if (employee.status === 'TERMINATED') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EMPLOYEE_NOT_ACTIVE',
        'Terminated employees cannot be deployed.',
      );
    }
    const onboarded =
      employee.status === 'ACTIVE' ||
      employee.status === 'ON_LEAVE' ||
      employee.onboardingPlan?.status === 'COMPLETED';
    if (!onboarded && !(isHrAdmin(actor) && input.overrideReason)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ONBOARDING_INCOMPLETE',
        isHrAdmin(actor)
          ? 'Onboarding is not complete. Give a reason to deploy anyway.'
          : 'Onboarding is not complete. An HR Manager can deploy with a reason.',
      );
    }
    const clash = await this.prisma.deployment.count({
      where: {
        employeeId: employee.id,
        status: { in: ['PLANNED', 'ACTIVE'] },
        startDate: { lte: input.endDate ? toDate(input.endDate) : new Date('9999-12-31') },
        OR: [{ endDate: null }, { endDate: { gte: toDate(input.startDate) } }],
      },
    });
    if (clash) throw overlap();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.deployment.create({
          data: {
            employeeId: employee.id,
            projectId: project.id,
            clientId: project.clientId,
            startDate: toDate(input.startDate),
            endDate: input.endDate ? toDate(input.endDate) : null,
            billRateFils: input.billRateFils,
            currency: input.currency,
            status: initialDeploymentStatus(input.startDate, todayInDubai()),
            // Only recorded when it actually bypassed the onboarding rule.
            overrideReason: onboarded ? null : (input.overrideReason ?? null),
            createdById: actor.id,
          },
          include,
        });
        await this.audit.record(
          {
            action: onboarded ? 'CREATE' : 'CREATE_WITH_OVERRIDE',
            entity: 'deployment',
            entityId: row.id,
            after: { ...snapshot(row), overrideReason: row.overrideReason },
          },
          tx,
        );
        return toDeployment(row, actor);
      });
    } catch (error) {
      if (isOverlapViolation(error)) throw overlap();
      throw error;
    }
  }

  async update(
    id: string,
    input: { version: number; endDate?: string | null; billRateFils?: number },
    actor: Actor,
  ): Promise<Deployment> {
    const before = await this.find(id, deploymentWriteScope(actor));
    this.assertOpen(before.status);
    if (input.endDate && input.endDate < isoDay(before.startDate)!) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_DATES',
        'The end date must be on or after the start date.',
      );
    }
    return this.save(
      before,
      {
        ...(input.endDate !== undefined
          ? { endDate: input.endDate ? toDate(input.endDate) : null }
          : {}),
        ...(input.billRateFils !== undefined ? { billRateFils: input.billRateFils } : {}),
      },
      input.version,
      'UPDATE',
      actor,
    );
  }

  /** Ends early (or cancels a deployment that hasn't started). */
  async end(
    id: string,
    input: { version: number; endDate: string; reason: string },
    actor: Actor,
  ): Promise<Deployment> {
    const before = await this.find(id, deploymentWriteScope(actor));
    this.assertOpen(before.status);
    const start = isoDay(before.startDate)!;
    const cancelled = before.status === 'PLANNED' && input.endDate < start;
    if (!cancelled && input.endDate < start) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_DATES',
        'The end date must be on or after the start date.',
      );
    }
    const status = cancelled
      ? 'CANCELLED'
      : input.endDate < todayInDubai()
        ? 'ENDED'
        : before.status;
    return this.save(
      before,
      {
        endDate: cancelled ? before.endDate : toDate(input.endDate),
        endReason: input.reason,
        status,
      },
      input.version,
      cancelled ? 'CANCEL' : 'END',
      actor,
    );
  }

  /** Nightly: PLANNED → ACTIVE on the start date, ACTIVE → ENDED after the end date. */
  async syncStatuses(today = todayInDubai()): Promise<number> {
    const open = await this.prisma.deployment.findMany({
      where: { status: { in: ['PLANNED', 'ACTIVE'] } },
      select: { id: true, status: true, startDate: true, endDate: true },
    });
    let changed = 0;
    for (const d of open) {
      const next = deploymentStatusOn(
        { status: d.status, startDate: isoDay(d.startDate)!, endDate: isoDay(d.endDate) },
        today,
      );
      if (!next) continue;
      await this.prisma.deployment.updateMany({
        where: { id: d.id, status: d.status },
        data: { status: next, version: { increment: 1 } },
      });
      changed += 1;
    }
    if (changed) this.logger.info({ changed }, 'Deployment statuses updated');
    return changed;
  }

  private async save(
    before: Row,
    data: Prisma.DeploymentUpdateManyMutationInput,
    version: number,
    action: string,
    actor: Actor,
  ): Promise<Deployment> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.deployment.updateMany({
          where: { id: before.id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count === 0) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'STALE_VERSION',
            'This deployment was changed by someone else. Reload and try again.',
            { currentVersion: before.version },
          );
        }
        const after = await tx.deployment.findUniqueOrThrow({ where: { id: before.id }, include });
        await this.audit.record(
          {
            action,
            entity: 'deployment',
            entityId: before.id,
            before: snapshot(before),
            after: { ...snapshot(after), endReason: after.endReason },
          },
          tx,
        );
        return toDeployment(after, actor);
      });
    } catch (error) {
      if (isOverlapViolation(error)) throw overlap();
      throw error;
    }
  }

  private assertOpen(status: string) {
    if (status !== 'PLANNED' && status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'DEPLOYMENT_CLOSED',
        `This deployment is ${status.toLowerCase()} and can no longer be changed.`,
      );
    }
  }

  private async find(id: string, scope: Prisma.DeploymentWhereInput): Promise<Row> {
    const row = await this.prisma.deployment.findFirst({
      where: { AND: [{ id }, scope] },
      include,
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'DEPLOYMENT_NOT_FOUND', 'Deployment not found.');
    }
    return row;
  }
}
