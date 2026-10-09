import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Paginated,
  Timesheet,
  TimesheetCreateData,
  TimesheetListQuery,
} from '@staffos/shared';
import { formatMinutes } from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { isUniqueViolation, personName, userNameSelect } from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import {
  deploymentTimesheetScope,
  timesheetApproveScope,
  timesheetReadScope,
  timesheetWriteScope,
} from '../../common/scoping/workforce-scope';
import type { Prisma } from '../../generated/prisma/client';
import { DomainEventsService } from '../../infra/events/domain-events.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertTimesheetDates, isEditable, nextTimesheetStatus } from './workforce.rules';

type Entry = { date: string; minutes: number; note?: string };

const include = {
  employee: {
    select: { id: true, firstName: true, lastName: true, employeeNumber: true, userId: true },
  },
  client: { select: { id: true, name: true } },
  deployment: {
    select: { startDate: true, endDate: true, project: { select: { name: true } } },
  },
  decidedBy: userNameSelect,
  entries: { orderBy: { date: 'asc' } },
} satisfies Prisma.TimesheetInclude;
type Row = Prisma.TimesheetGetPayload<{ include: typeof include }>;

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

function toTimesheet(t: Row, withEntries: boolean): Timesheet {
  const e = t.employee;
  return {
    id: t.id,
    deploymentId: t.deploymentId,
    employee: { id: e.id, name: `${e.firstName} ${e.lastName}`, employeeNumber: e.employeeNumber },
    client: t.client,
    project: t.deployment.project.name,
    weekStart: isoDay(t.weekStart)!,
    status: t.status,
    totalMinutes: t.totalMinutes,
    entries: withEntries
      ? t.entries.map((x) => ({ date: isoDay(x.date)!, minutes: x.minutes, note: x.note }))
      : undefined,
    deploymentStart: isoDay(t.deployment.startDate)!,
    deploymentEnd: isoDay(t.deployment.endDate),
    submittedAt: t.submittedAt?.toISOString() ?? null,
    decidedAt: t.decidedAt?.toISOString() ?? null,
    decidedBy: personName(t.decidedBy),
    rejectComment: t.rejectComment,
    version: t.version,
  };
}

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'TIMESHEET_NOT_FOUND', 'Timesheet not found.');
const stale = (current: number) =>
  new AppException(
    HttpStatus.CONFLICT,
    'STALE_VERSION',
    'This timesheet was changed by someone else. Reload and try again.',
    { currentVersion: current },
  );
const total = (entries: readonly Entry[]) => entries.reduce((sum, e) => sum + e.minutes, 0);

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly events: DomainEventsService,
  ) {}

  async list(query: TimesheetListQuery, actor: Actor): Promise<Paginated<Timesheet>> {
    const f = query.filter ?? {};
    const search = query.search?.trim();
    const where: Prisma.TimesheetWhereInput = {
      AND: [
        timesheetReadScope(actor),
        {
          status: f.status,
          clientId: f.clientId,
          employeeId: f.employeeId,
          ...(f.weekStart ? { weekStart: toDate(f.weekStart) } : {}),
        },
        search
          ? {
              OR: [
                { employee: { firstName: { contains: search, mode: 'insensitive' } } },
                { employee: { lastName: { contains: search, mode: 'insensitive' } } },
                { client: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [rows, count] = await this.prisma.$transaction([
      this.prisma.timesheet.findMany({
        where,
        include,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.timesheet.count({ where }),
    ]);
    return paginated(
      rows.map((t) => toTimesheet(t, false)),
      count,
      query,
    );
  }

  async get(id: string, actor: Actor): Promise<Timesheet> {
    return toTimesheet(await this.find(id, timesheetReadScope(actor)), true);
  }

  /** US-TS-01: a DRAFT for one deployment week (the employee, or HR on their behalf). */
  async create(input: TimesheetCreateData, actor: Actor): Promise<Timesheet> {
    const deployment = await this.prisma.deployment.findFirst({
      where: {
        AND: [
          { id: input.deploymentId, status: { in: ['PLANNED', 'ACTIVE', 'ENDED'] } },
          deploymentTimesheetScope(actor),
        ],
      },
      select: { id: true, employeeId: true, clientId: true, startDate: true, endDate: true },
    });
    if (!deployment) {
      throw new AppException(HttpStatus.NOT_FOUND, 'DEPLOYMENT_NOT_FOUND', 'Deployment not found.');
    }
    assertTimesheetDates(input.weekStart, input.entries, {
      startDate: isoDay(deployment.startDate)!,
      endDate: isoDay(deployment.endDate),
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.timesheet.create({
          data: {
            deploymentId: deployment.id,
            employeeId: deployment.employeeId,
            clientId: deployment.clientId,
            weekStart: toDate(input.weekStart),
            totalMinutes: total(input.entries),
            createdById: actor.id,
            entries: {
              create: input.entries.map((e) => ({
                date: toDate(e.date),
                minutes: e.minutes,
                note: e.note ?? null,
              })),
            },
          },
          include,
        });
        await this.audit.record(
          {
            action: 'CREATE',
            entity: 'timesheet',
            entityId: row.id,
            after: {
              deploymentId: deployment.id,
              weekStart: input.weekStart,
              totalMinutes: row.totalMinutes,
            },
          },
          tx,
        );
        return toTimesheet(row, true);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'TIMESHEET_EXISTS',
          'There is already a timesheet for this week.',
        );
      }
      throw error;
    }
  }

  /** Replaces the entries; only while DRAFT or REJECTED. */
  async update(
    id: string,
    input: { version: number; entries: Entry[] },
    actor: Actor,
  ): Promise<Timesheet> {
    const before = await this.find(id, timesheetWriteScope(actor));
    if (!isEditable(before.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TIMESHEET_LOCKED',
        'Only draft or rejected timesheets can be changed.',
        { status: before.status },
      );
    }
    assertTimesheetDates(isoDay(before.weekStart)!, input.entries, {
      startDate: isoDay(before.deployment.startDate)!,
      endDate: isoDay(before.deployment.endDate),
    });
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.timesheet.updateMany({
        where: { id, version: input.version },
        data: { totalMinutes: total(input.entries), version: { increment: 1 } },
      });
      if (count === 0) throw stale(before.version);
      await tx.timesheetEntry.deleteMany({ where: { timesheetId: id } });
      await tx.timesheetEntry.createMany({
        data: input.entries.map((e) => ({
          timesheetId: id,
          date: toDate(e.date),
          minutes: e.minutes,
          note: e.note ?? null,
        })),
      });
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'timesheet',
          entityId: id,
          before: { totalMinutes: before.totalMinutes },
          after: { totalMinutes: total(input.entries) },
        },
        tx,
      );
      return toTimesheet(await tx.timesheet.findUniqueOrThrow({ where: { id }, include }), true);
    });
  }

  /** Submits for approval; the client's portal users and Finance are notified (US-TS-01). */
  async submit(id: string, version: number, actor: Actor): Promise<Timesheet> {
    const before = await this.find(id, timesheetWriteScope(actor));
    const to = nextTimesheetStatus(before.status, 'submit');
    if (before.totalMinutes === 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TIMESHEET_EMPTY',
        'Enter the hours worked before submitting.',
      );
    }
    const approvers = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { clientId: before.clientId, roles: { some: { role: { code: 'CLIENT_USER' } } } },
          { roles: { some: { role: { code: 'FINANCE' } } } },
        ],
      },
      select: { id: true },
    });
    const e = before.employee;
    const submitted = await this.transition(
      before,
      version,
      to,
      'SUBMIT',
      actor,
      { submittedAt: new Date(), rejectComment: null },
      async (tx) => {
        await this.notifications.notify(
          approvers.map((u) => u.id),
          {
            type: 'timesheet.submitted',
            title: `Timesheet to approve: ${e.firstName} ${e.lastName}`,
            body: `Week of ${isoDay(before.weekStart)} · ${formatMinutes(before.totalMinutes)} · ${before.client.name}`,
            link: `/timesheets/${before.id}`,
          },
          tx,
        );
      },
    );
    await this.events.emit('TIMESHEET_SUBMITTED', {
      timesheetId: before.id,
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`,
      clientId: before.clientId,
      clientName: before.client.name,
      periodStart: isoDay(before.weekStart),
      totalMinutes: before.totalMinutes,
    });
    return submitted;
  }

  /** US-TS-02: the client (or Finance) approves; name and time are recorded. */
  async approve(id: string, version: number, actor: Actor): Promise<Timesheet> {
    const before = await this.find(id, this.approverScope(actor));
    const to = nextTimesheetStatus(before.status, 'approve');
    return this.transition(before, version, to, 'APPROVE', actor, {
      decidedAt: new Date(),
      decidedById: actor.id,
    });
  }

  /** Rejection needs a comment; the timesheet goes back to the employee to fix and resubmit. */
  async reject(
    id: string,
    input: { version: number; comment: string },
    actor: Actor,
  ): Promise<Timesheet> {
    const before = await this.find(id, this.approverScope(actor));
    const to = nextTimesheetStatus(before.status, 'reject');
    const e = before.employee;
    return this.transition(
      before,
      input.version,
      to,
      'REJECT',
      actor,
      { decidedAt: new Date(), decidedById: actor.id, rejectComment: input.comment },
      async (tx) => {
        await this.notifications.notify(
          [e.userId],
          {
            type: 'timesheet.rejected',
            title: `Timesheet returned: week of ${isoDay(before.weekStart)}`,
            body: input.comment,
            link: `/timesheets/${before.id}`,
          },
          tx,
        );
      },
    );
  }

  /** Approves each submitted timesheet the caller may approve; reports per-id results. */
  async bulkApprove(ids: string[], actor: Actor) {
    const results: { id: string; ok: boolean; code?: string }[] = [];
    for (const id of [...new Set(ids)]) {
      try {
        const row = await this.find(id, this.approverScope(actor));
        await this.approve(id, row.version, actor);
        results.push({ id, ok: true });
      } catch (error) {
        results.push({
          id,
          ok: false,
          code: error instanceof AppException ? error.code : 'ERROR',
        });
      }
    }
    return results;
  }

  /** Approvers only act on what was submitted to them, never on drafts. */
  private approverScope(actor: Actor): Prisma.TimesheetWhereInput {
    return { AND: [timesheetApproveScope(actor), timesheetReadScope(actor)] };
  }

  private async transition(
    before: Row,
    version: number,
    to: Row['status'],
    action: string,
    actor: Actor,
    data: Prisma.TimesheetUncheckedUpdateManyInput,
    after?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<Timesheet> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.timesheet.updateMany({
        where: { id: before.id, version, status: before.status },
        data: { ...data, status: to, version: { increment: 1 } },
      });
      if (count === 0) throw stale(before.version);
      await this.audit.record(
        {
          action,
          entity: 'timesheet',
          entityId: before.id,
          before: { status: before.status },
          after: { status: to, ...(data.rejectComment ? { comment: data.rejectComment } : {}) },
        },
        tx,
      );
      await after?.(tx);
      return toTimesheet(
        await tx.timesheet.findUniqueOrThrow({ where: { id: before.id }, include }),
        true,
      );
    });
  }

  private async find(id: string, scope: Prisma.TimesheetWhereInput): Promise<Row> {
    const row = await this.prisma.timesheet.findFirst({ where: { AND: [{ id }, scope] }, include });
    if (!row) throw notFound();
    return row;
  }
}
