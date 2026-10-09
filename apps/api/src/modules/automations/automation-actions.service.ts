import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTOMATION_EMAIL_TEMPLATES,
  type AutomationAction,
  type AutomationEvent,
  fillTemplate,
  RECIPIENTS,
} from '@staffos/shared';
import type { Env } from '../../common/config/env';
import { todayInDubai, toDate } from '../../common/errors/prisma-errors';
import { MailService } from '../../infra/mail/mail.service';
import { notificationEmail } from '../../infra/mail/templates';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { ApprovalsService } from '../workflows/approvals.service';

export type RunContext = {
  runId: string;
  event: AutomationEvent;
  ruleName: string;
  payload: Record<string, unknown>;
  /** Tasks created earlier in this run (assign_user assigns them). */
  taskIds: string[];
};

/** The record an event is about: tasks link to it, notifications open it. */
const SUBJECT: Record<
  AutomationEvent,
  { entityType: string; key: string; link: (id: string) => string }
> = {
  APPLICATION_STAGE_CHANGED: {
    entityType: 'application',
    key: 'applicationId',
    link: (id) => `/applications/${id}`,
  },
  EMPLOYEE_HIRED: { entityType: 'employee', key: 'employeeId', link: (id) => `/employees/${id}` },
  DOCUMENT_EXPIRING: {
    entityType: 'document',
    key: 'documentId',
    link: () => '/documents/expiring',
  },
  TIMESHEET_SUBMITTED: {
    entityType: 'timesheet',
    key: 'timesheetId',
    link: (id) => `/timesheets/${id}`,
  },
  MANPOWER_REQUEST_CREATED: {
    entityType: 'manpower_request',
    key: 'manpowerRequestId',
    link: (id) => `/requests/${id}`,
  },
};

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * Performs one automation action. Throwing fails the run (the error is stored and the run can be
 * retried); "nobody to send to" is a skipped result, not a failure.
 */
@Injectable()
export class AutomationActionsService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly webhooks: WebhooksService,
    private readonly approvals: ApprovalsService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  async perform(action: AutomationAction, ctx: RunContext): Promise<Record<string, unknown>> {
    const subject = SUBJECT[ctx.event];
    const entityId = str(ctx.payload[subject.key]);
    switch (action.type) {
      case 'create_task': {
        const task = await this.prisma.task.create({
          data: {
            title: fillTemplate(action.title, ctx.payload).slice(0, 200),
            description: `Created by automation "${ctx.ruleName}".`,
            assigneeRole: action.assigneeRole ?? null,
            dueDate:
              action.dueInDays === undefined
                ? null
                : new Date(toDate(todayInDubai()).getTime() + action.dueInDays * 86_400_000),
            entityType: entityId ? subject.entityType : null,
            entityId: entityId ?? null,
          },
        });
        ctx.taskIds.push(task.id);
        await this.audit.record({
          actorId: null,
          action: 'CREATE',
          entity: 'task',
          entityId: task.id,
          after: { title: task.title, assigneeRole: task.assigneeRole, automationRunId: ctx.runId },
        });
        return { type: action.type, taskId: task.id };
      }

      case 'send_email': {
        const template = AUTOMATION_EMAIL_TEMPLATES[action.template];
        const people = (RECIPIENTS as readonly string[]).includes(action.to)
          ? await this.users(action.to as (typeof RECIPIENTS)[number], ctx.payload)
          : [{ email: action.to, firstName: 'there' }];
        const url = entityId ? `${this.appUrl}${subject.link(entityId)}` : undefined;
        for (const p of people) {
          await this.mail.send(
            notificationEmail(p.email, p.firstName, {
              title: fillTemplate(template.title, ctx.payload),
              body: fillTemplate(template.body, ctx.payload),
              url,
            }),
          );
        }
        return people.length
          ? { type: action.type, sent: people.length }
          : { type: action.type, skipped: 'No recipient for this event.' };
      }

      case 'notify': {
        const people = await this.users(action.to, ctx.payload);
        await this.notifications.notify(
          people.map((p) => p.id),
          {
            type: 'automation',
            title: fillTemplate(action.message, ctx.payload).slice(0, 300),
            body: `Automation: ${ctx.ruleName}`,
            link: entityId ? subject.link(entityId) : undefined,
            email: false,
          },
        );
        return people.length
          ? { type: action.type, notified: people.length }
          : { type: action.type, skipped: 'No recipient for this event.' };
      }

      case 'assign_user': {
        const user = await this.prisma.user.findFirst({
          where: { id: action.userId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!user) throw new Error('The user to assign is missing or inactive.');
        if (ctx.taskIds.length) {
          await this.prisma.task.updateMany({
            where: { id: { in: ctx.taskIds } },
            data: { assigneeId: user.id },
          });
          return { type: action.type, assignedTasks: ctx.taskIds.length };
        }
        const task = await this.prisma.task.create({
          data: {
            title: `Follow up: ${ctx.ruleName}`.slice(0, 200),
            description: `Assigned by automation "${ctx.ruleName}".`,
            assigneeId: user.id,
            entityType: entityId ? subject.entityType : null,
            entityId: entityId ?? null,
          },
        });
        ctx.taskIds.push(task.id);
        return { type: action.type, taskId: task.id };
      }

      case 'start_approval': {
        const workflow = await this.prisma.workflowDefinition.findUnique({
          where: { id: action.workflowId },
          select: { subject: true },
        });
        if (!workflow) throw new Error('The workflow no longer exists.');
        if (workflow.subject !== 'MANPOWER_REQUEST' || ctx.event !== 'MANPOWER_REQUEST_CREATED') {
          throw new Error('This workflow can’t start from this event.');
        }
        if (!entityId) throw new Error('The event has no manpower request.');
        const mr = await this.prisma.manpowerRequest.findUnique({
          where: { id: entityId },
          select: {
            id: true,
            status: true,
            roleTitle: true,
            headcount: true,
            client: { select: { name: true } },
          },
        });
        if (!mr) throw new Error('The manpower request no longer exists.');
        if (!['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL'].includes(mr.status)) {
          return { type: action.type, skipped: `Request is already ${mr.status.toLowerCase()}.` };
        }
        const started = await this.prisma.$transaction((tx) =>
          this.approvals.start(
            {
              subject: 'MANPOWER_REQUEST',
              entityId: mr.id,
              title: `${mr.roleTitle} ×${mr.headcount} for ${mr.client.name}`,
              link: `/requests/${mr.id}`,
            },
            tx,
            action.workflowId,
          ),
        );
        if (!started) throw new Error('The workflow is inactive or has no steps.');
        return { type: action.type, workflowId: action.workflowId };
      }

      case 'call_webhook': {
        const hook = await this.prisma.webhook.findFirst({
          where: { id: action.webhookId, deletedAt: null, active: true },
          select: { id: true },
        });
        if (!hook) throw new Error('The webhook is missing or disabled.');
        const deliveryId = await this.webhooks.enqueue(hook.id, ctx.event, ctx.payload);
        return { type: action.type, deliveryId };
      }
    }
  }

  /** Resolves a recipient keyword from the event payload to active users. */
  private async users(to: (typeof RECIPIENTS)[number], payload: Record<string, unknown>) {
    let where: { id: { in: string[] } } | { roles: { some: { role: { code: 'HR_MANAGER' } } } };
    if (to === 'hr') {
      where = { roles: { some: { role: { code: 'HR_MANAGER' } } } };
    } else if (to === 'recruiter') {
      const ids = Array.isArray(payload.recruiterIds)
        ? payload.recruiterIds.filter((v) => typeof v === 'string')
        : [];
      where = { id: { in: ids } };
    } else {
      let id = str(payload.accountManagerId);
      const clientId = str(payload.clientId);
      if (!id && clientId) {
        const client = await this.prisma.client.findUnique({
          where: { id: clientId },
          select: { accountManagerId: true },
        });
        id = client?.accountManagerId ?? undefined;
      }
      where = { id: { in: id ? [id] : [] } };
    }
    return this.prisma.user.findMany({
      where: { status: 'ACTIVE', ...where },
      select: { id: true, email: true, firstName: true },
    });
  }
}
