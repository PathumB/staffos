import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  OnboardingPlan,
  OnboardingTask,
  OnboardingTemplate,
  Paginated,
  PlanListQuery,
  TaskComplete,
  TaskUpdate,
  TemplateInputData,
} from '@staffos/shared';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import {
  isUniqueViolation,
  personName,
  todayInDubai,
  userNameSelect,
} from '../../common/errors/prisma-errors';
import { paginated, toOrderBy, toSkipTake } from '../../common/pagination/pagination';
import { isHrAdmin, onboardingPlanScope } from '../../common/scoping/hr-scope';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { canCompleteTask, countOverdue, isPlanComplete } from './onboarding.rules';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dubaiToday = () => new Date(`${todayInDubai()}T00:00:00Z`);

// ── Templates ──

const templateInclude = {
  tasks: { orderBy: { sortOrder: 'asc' } },
  _count: { select: { plans: true } },
} satisfies Prisma.OnboardingTemplateInclude;
type TemplateRow = Prisma.OnboardingTemplateGetPayload<{ include: typeof templateInclude }>;

function toTemplate(t: TemplateRow): OnboardingTemplate {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    active: t.active,
    tasks: t.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      assigneeRole: task.assigneeRole,
      dueOffsetDays: task.dueOffsetDays,
      required: task.required,
    })),
    planCount: t._count.plans,
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ── Plans ──

const taskInclude = {
  assignee: userNameSelect,
  completedBy: userNameSelect,
} satisfies Prisma.OnboardingTaskInclude;
type TaskRow = Prisma.OnboardingTaskGetPayload<{ include: typeof taskInclude }>;

const planInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
  template: { select: { id: true, name: true } },
  tasks: { orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }], include: taskInclude },
} satisfies Prisma.OnboardingPlanInclude;
type PlanRow = Prisma.OnboardingPlanGetPayload<{ include: typeof planInclude }>;

function toTask(t: TaskRow, actor: Actor, employeeId: string, planActive: boolean): OnboardingTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    assigneeRole: t.assigneeRole,
    assignee: personName(t.assignee),
    dueDate: isoDay(t.dueDate),
    required: t.required,
    status: t.status,
    completedAt: t.completedAt?.toISOString() ?? null,
    completedBy: personName(t.completedBy),
    note: t.note,
    canComplete: planActive && canCompleteTask(actor, t, employeeId),
  };
}

function toPlan(p: PlanRow, actor: Actor, withTasks: boolean): OnboardingPlan {
  const e = p.employee;
  return {
    id: p.id,
    status: p.status,
    startDate: isoDay(p.startDate),
    completedAt: p.completedAt?.toISOString() ?? null,
    employee: { id: e.id, name: `${e.firstName} ${e.lastName}`, employeeNumber: e.employeeNumber },
    template: p.template,
    progress: {
      done: p.tasks.filter((t) => t.status !== 'PENDING').length,
      total: p.tasks.length,
      overdue: countOverdue(p.tasks, dubaiToday()),
    },
    tasks: withTasks
      ? p.tasks.map((t) => toTask(t, actor, e.id, p.status === 'IN_PROGRESS'))
      : undefined,
    createdAt: p.createdAt.toISOString(),
  };
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Templates (US-ONB-01) ──

  async listTemplates(): Promise<OnboardingTemplate[]> {
    const rows = await this.prisma.onboardingTemplate.findMany({
      include: templateInclude,
      orderBy: [{ category: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    });
    return rows.map(toTemplate);
  }

  async getTemplate(id: string): Promise<OnboardingTemplate> {
    return toTemplate(await this.findTemplate(id));
  }

  /** Plans copy their tasks at hire time, so saving a template never changes existing plans. */
  async saveTemplate(
    input: TemplateInputData,
    actor: Actor,
    id?: string,
  ): Promise<OnboardingTemplate> {
    const before = id ? toTemplate(await this.findTemplate(id)) : null;
    const tasks = input.tasks.map((t, sortOrder) => ({
      title: t.title,
      description: t.description ?? null,
      type: t.type,
      assigneeRole: t.assigneeRole,
      dueOffsetDays: t.dueOffsetDays,
      required: t.required,
      sortOrder,
    }));
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (id) await tx.onboardingTemplateTask.deleteMany({ where: { templateId: id } });
        const data = { name: input.name, category: input.category, active: input.active };
        const row = id
          ? await tx.onboardingTemplate.update({
              where: { id },
              data: { ...data, tasks: { create: tasks } },
              include: templateInclude,
            })
          : await tx.onboardingTemplate.create({
              data: { ...data, createdById: actor.id, tasks: { create: tasks } },
              include: templateInclude,
            });
        const after = toTemplate(row);
        await this.audit.record(
          {
            action: id ? 'UPDATE' : 'CREATE',
            entity: 'onboarding_template',
            entityId: row.id,
            before: before ? templateSnapshot(before) : undefined,
            after: templateSnapshot(after),
          },
          tx,
        );
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'TEMPLATE_CATEGORY_EXISTS',
          input.category
            ? 'There is already a template for this job category.'
            : 'There is already a default template.',
        );
      }
      throw error;
    }
  }

  /** Templates used by plans are kept for history; deactivate those instead. */
  async deleteTemplate(id: string): Promise<void> {
    const template = await this.findTemplate(id);
    if (template._count.plans > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TEMPLATE_IN_USE',
        'This template has been used for onboarding plans. Deactivate it instead.',
        { plans: template._count.plans },
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingTemplate.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'DELETE',
          entity: 'onboarding_template',
          entityId: id,
          before: templateSnapshot(toTemplate(template)),
        },
        tx,
      );
    });
  }

  // ── Plans ──

  async listPlans(query: PlanListQuery, actor: Actor): Promise<Paginated<OnboardingPlan>> {
    const f = query.filter ?? {};
    const search = query.search?.trim();
    const where: Prisma.OnboardingPlanWhereInput = {
      AND: [
        onboardingPlanScope(actor),
        { status: f.status, employeeId: f.employeeId },
        search
          ? {
              employee: {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { employeeNumber: { contains: search, mode: 'insensitive' } },
                ],
              },
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.onboardingPlan.findMany({
        where,
        include: planInclude,
        orderBy: toOrderBy(query.sort),
        ...toSkipTake(query),
      }),
      this.prisma.onboardingPlan.count({ where }),
    ]);
    return paginated(
      rows.map((p) => toPlan(p, actor, false)),
      total,
      query,
    );
  }

  async getPlan(id: string, actor: Actor): Promise<OnboardingPlan> {
    const plan = await this.prisma.onboardingPlan.findFirst({
      where: { AND: [{ id }, onboardingPlanScope(actor)] },
      include: planInclude,
    });
    if (!plan) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'ONBOARDING_PLAN_NOT_FOUND',
        'Onboarding plan not found.',
      );
    }
    return toPlan(plan, actor, true);
  }

  // ── Tasks (US-ONB-02) ──

  /**
   * Completes a task the caller is responsible for. When the last required task is done, the
   * plan is COMPLETED, the employee becomes ACTIVE and HR Managers are notified, all in one
   * transaction.
   */
  async completeTask(taskId: string, input: TaskComplete, actor: Actor): Promise<OnboardingPlan> {
    const task = await this.findTask(taskId, actor);
    const plan = task.plan;
    this.assertPlanActive(plan.status);
    if (task.status !== 'PENDING') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TASK_ALREADY_DONE',
        'This task is already done.',
      );
    }
    if (!canCompleteTask(actor, task, plan.employeeId)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'TASK_NOT_ASSIGNED_TO_YOU',
        'This task is assigned to someone else.',
      );
    }
    if (input.documentId) {
      const ok = await this.prisma.document.count({
        where: { id: input.documentId, employeeId: plan.employeeId, deletedAt: null },
      });
      if (!ok) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVALID_DOCUMENT',
          "That document doesn't belong to this employee.",
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Conditional update: two people completing the same task at once can't both succeed.
      const { count } = await tx.onboardingTask.updateMany({
        where: { id: taskId, status: 'PENDING' },
        data: {
          status: 'DONE',
          completedAt: now,
          completedById: actor.id,
          note: input.note ?? null,
          documentId: input.documentId ?? null,
        },
      });
      if (count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'TASK_ALREADY_DONE',
          'This task is already done.',
        );
      }
      await this.audit.record(
        {
          action: 'COMPLETE',
          entity: 'onboarding_task',
          entityId: taskId,
          after: { planId: plan.id, title: task.title, note: input.note },
        },
        tx,
      );

      const tasks = await tx.onboardingTask.findMany({
        where: { planId: plan.id },
        select: { status: true, required: true },
      });
      if (!isPlanComplete(tasks)) return;
      await tx.onboardingPlan.update({
        where: { id: plan.id },
        data: { status: 'COMPLETED', completedAt: now },
      });
      const activated = await tx.employee.updateMany({
        where: { id: plan.employeeId, status: 'ONBOARDING' },
        data: { status: 'ACTIVE', version: { increment: 1 } },
      });
      await this.audit.record(
        {
          action: 'COMPLETE',
          entity: 'onboarding_plan',
          entityId: plan.id,
          after: { employeeId: plan.employeeId, employeeActivated: activated.count > 0 },
        },
        tx,
      );
      const hr = await tx.user.findMany({
        where: { status: 'ACTIVE', roles: { some: { role: { code: 'HR_MANAGER' } } } },
        select: { id: true },
      });
      const e = plan.employee;
      await this.notifications.notify(
        hr.map((u) => u.id),
        {
          type: 'onboarding.completed',
          title: `Onboarding complete: ${e.firstName} ${e.lastName}`,
          body: `${e.employeeNumber} has finished every required onboarding task.`,
          link: `/employees/${plan.employeeId}`,
        },
        tx,
      );
    });
    return this.getPlan(plan.id, actor);
  }

  /** HR Managers can reopen a task done by mistake; a completed plan goes back to in progress. */
  async reopenTask(taskId: string, actor: Actor): Promise<OnboardingPlan> {
    this.assertHr(actor);
    const task = await this.findTask(taskId, actor);
    this.assertPlanActive(task.plan.status, true);
    if (task.status === 'PENDING') {
      throw new AppException(HttpStatus.CONFLICT, 'TASK_NOT_DONE', 'This task is still open.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingTask.update({
        where: { id: taskId },
        data: { status: 'PENDING', completedAt: null, completedById: null },
      });
      if (task.plan.status === 'COMPLETED') {
        await tx.onboardingPlan.update({
          where: { id: task.plan.id },
          data: { status: 'IN_PROGRESS', completedAt: null },
        });
      }
      await this.audit.record(
        {
          action: 'REOPEN',
          entity: 'onboarding_task',
          entityId: taskId,
          before: { status: task.status },
          after: { status: 'PENDING' },
        },
        tx,
      );
    });
    return this.getPlan(task.plan.id, actor);
  }

  /** HR: reassign to a specific person, or move the due date. */
  async updateTask(taskId: string, input: TaskUpdate, actor: Actor): Promise<OnboardingPlan> {
    this.assertHr(actor);
    const task = await this.findTask(taskId, actor);
    this.assertPlanActive(task.plan.status);
    if (input.assigneeId) {
      const ok = await this.prisma.user.count({
        where: { id: input.assigneeId, status: 'ACTIVE', clientId: null },
      });
      if (!ok) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVALID_ASSIGNEE',
          'Assign the task to an active StaffOS user.',
        );
      }
    }
    const data = {
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.dueDate ? { dueDate: new Date(`${input.dueDate}T00:00:00Z`) } : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingTask.update({ where: { id: taskId }, data });
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'onboarding_task',
          entityId: taskId,
          before: { assigneeId: task.assigneeId, dueDate: isoDay(task.dueDate) },
          after: input,
        },
        tx,
      );
      if (input.assigneeId) {
        await this.notifications.notify(
          [input.assigneeId],
          {
            type: 'onboarding.task_assigned',
            title: `Onboarding task: ${task.title}`,
            body: `For ${task.plan.employee.firstName} ${task.plan.employee.lastName}.`,
            link: `/onboarding/${task.plan.id}`,
          },
          tx,
        );
      }
    });
    return this.getPlan(task.plan.id, actor);
  }

  private async findTemplate(id: string): Promise<TemplateRow> {
    const row = await this.prisma.onboardingTemplate.findUnique({
      where: { id },
      include: templateInclude,
    });
    if (!row) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'ONBOARDING_TEMPLATE_NOT_FOUND',
        'Onboarding template not found.',
      );
    }
    return row;
  }

  private async findTask(id: string, actor: Actor) {
    const task = await this.prisma.onboardingTask.findFirst({
      where: { id, plan: onboardingPlanScope(actor) },
      include: {
        plan: {
          select: {
            id: true,
            status: true,
            employeeId: true,
            employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          },
        },
      },
    });
    if (!task) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'ONBOARDING_TASK_NOT_FOUND',
        'Onboarding task not found.',
      );
    }
    return task;
  }

  private assertPlanActive(status: string, allowCompleted = false) {
    if (status === 'IN_PROGRESS' || (allowCompleted && status === 'COMPLETED')) return;
    throw new AppException(
      HttpStatus.CONFLICT,
      'PLAN_NOT_ACTIVE',
      `This onboarding plan is ${status.toLowerCase().replace('_', ' ')}.`,
      { status },
    );
  }

  // Employees hold onboarding:write for their own tasks; these actions are HR's.
  private assertHr(actor: Actor) {
    if (!isHrAdmin(actor)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Only HR Managers can change onboarding tasks.',
      );
    }
  }
}

function templateSnapshot(t: OnboardingTemplate) {
  return {
    name: t.name,
    category: t.category,
    active: t.active,
    tasks: t.tasks.map((x) => `${x.title} (${x.assigneeRole}, ${x.dueOffsetDays}d)`),
  };
}
