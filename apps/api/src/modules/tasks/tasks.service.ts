import { HttpStatus, Injectable } from '@nestjs/common';
import type { Paginated, Task, TaskListQuery } from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { fromDate, personName, userNameSelect } from '../../common/errors/prisma-errors';
import { paginated, toSkipTake } from '../../common/pagination/pagination';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const LINKS: Record<string, (id: string) => string> = {
  application: (id) => `/applications/${id}`,
  employee: (id) => `/employees/${id}`,
  document: () => '/documents/expiring',
  timesheet: (id) => `/timesheets/${id}`,
  manpower_request: (id) => `/requests/${id}`,
};

type Row = Prisma.TaskGetPayload<{ include: { assignee: typeof userNameSelect } }>;
function toTask(t: Row): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    assignee: personName(t.assignee),
    assigneeRole: t.assigneeRole,
    dueDate: fromDate(t.dueDate),
    link: t.entityType && t.entityId ? (LINKS[t.entityType]?.(t.entityId) ?? null) : null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Tasks assigned to me, or to one of my roles and not yet to a person. */
const mine = (actor: Actor): Prisma.TaskWhereInput => ({
  OR: [{ assigneeId: actor.id }, { assigneeId: null, assigneeRole: { in: actor.roles } }],
});

/** Task inbox: renewal tasks from expiry alerts and tasks created by automation rules. */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: TaskListQuery, actor: Actor): Promise<Paginated<Task>> {
    const where: Prisma.TaskWhereInput = { AND: [mine(actor), { status: query.status }] };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: { assignee: userNameSelect },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.task.count({ where }),
    ]);
    return paginated(rows.map(toTask), total, query);
  }

  /** Someone else's task is a 404 (not 403) so ids can't be probed. */
  async complete(id: string, actor: Actor): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.task.updateMany({
        where: { AND: [{ id, status: 'OPEN' }, mine(actor)] },
        data: { status: 'DONE', completedAt: new Date(), assigneeId: actor.id },
      });
      if (count === 0) {
        const visible = await tx.task.findFirst({ where: { AND: [{ id }, mine(actor)] } });
        if (!visible)
          throw new AppException(HttpStatus.NOT_FOUND, 'TASK_NOT_FOUND', 'Task not found.');
        throw new AppException(
          HttpStatus.CONFLICT,
          'TASK_ALREADY_DONE',
          'This task is already closed.',
        );
      }
      await this.audit.record(
        { action: 'COMPLETE', entity: 'task', entityId: id, after: { status: 'DONE' } },
        tx,
      );
      return toTask(
        await tx.task.findUniqueOrThrow({ where: { id }, include: { assignee: userNameSelect } }),
      );
    });
  }
}
