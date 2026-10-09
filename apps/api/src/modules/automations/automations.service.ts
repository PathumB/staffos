import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ACTION_LABELS,
  type AutomationAction,
  AutomationEvent,
  type AutomationRule,
  type AutomationRuleInput,
  type AutomationRuleUpdate,
  type AutomationRun,
  type AutomationRunListQuery,
  type AutomationTestResult,
  actionSchema,
  type Condition,
  conditionPasses,
  conditionSchema,
  conditionsMatch,
  fillTemplate,
  type Paginated,
} from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { paginated, toSkipTake } from '../../common/pagination/pagination';
import type { Prisma } from '../../generated/prisma/client';
import { DomainEventsService } from '../../infra/events/domain-events.service';
import { JobsService } from '../../infra/jobs/jobs.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AutomationActionsService } from './automation-actions.service';

export const AUTOMATION_RUN_JOB = 'automations.run';

const conditionsSchema = z.array(conditionSchema);
const actionsSchema = z.array(actionSchema);

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'AUTOMATION_RULE_NOT_FOUND', 'Automation rule not found.');

const ruleInclude = {
  runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, createdAt: true } },
} as const satisfies Prisma.AutomationRuleInclude;
type RuleRow = Prisma.AutomationRuleGetPayload<{ include: typeof ruleInclude }>;

/** Stored JSON is re-validated on read, so a bad row can't crash the list or the runner. */
const parsedConditions = (json: unknown): Condition[] => conditionsSchema.catch([]).parse(json);
const parsedActions = (json: unknown): AutomationAction[] => actionsSchema.catch([]).parse(json);

function toRule(r: RuleRow): AutomationRule {
  const last = r.runs[0];
  return {
    id: r.id,
    name: r.name,
    active: r.active,
    event: r.event,
    conditions: parsedConditions(r.conditions),
    actions: parsedActions(r.actions),
    lastRun: last ? { status: last.status, createdAt: last.createdAt.toISOString() } : null,
    createdAt: r.createdAt.toISOString(),
  };
}

type RunRow = Prisma.AutomationRunGetPayload<{
  include: { rule: { select: { id: true; name: true } } };
}>;
function toRun(r: RunRow): AutomationRun {
  return {
    id: r.id,
    rule: r.rule,
    event: r.event,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    status: r.status,
    result: r.result ?? null,
    error: r.error,
    attempts: r.attempts,
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Human-readable plan for the dry run (nothing is executed). */
function describe(action: AutomationAction, payload: Record<string, unknown>): string {
  const label = ACTION_LABELS[action.type];
  switch (action.type) {
    case 'create_task':
      return `${label}: "${fillTemplate(action.title, payload)}"${action.assigneeRole ? ` for ${action.assigneeRole}` : ''}${action.dueInDays !== undefined ? `, due in ${action.dueInDays} days` : ''}`;
    case 'send_email':
      return `${label} "${action.template}" to ${action.to}`;
    case 'notify':
      return `${label} to ${action.to}: "${fillTemplate(action.message, payload)}"`;
    case 'assign_user':
      return `${label} ${action.userId}`;
    case 'start_approval':
      return `${label} with workflow ${action.workflowId}`;
    case 'call_webhook':
      return `${label} ${action.webhookId}`;
  }
}

/**
 * Automation rules (US-AUTO-01): When [event] If [conditions, AND] Then [actions]. Matching rules
 * run as background jobs; each run stores its input, result and error and can be retried.
 */
@Injectable()
export class AutomationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly events: DomainEventsService,
    private readonly actions: AutomationActionsService,
    @InjectPinoLogger(AutomationsService.name) private readonly logger: PinoLogger,
  ) {
    jobs.register<{ runId: string }>(AUTOMATION_RUN_JOB, ({ runId }) => this.execute(runId));
  }

  onModuleInit(): void {
    for (const event of Object.values(AutomationEvent)) {
      this.events.on(event, async (payload) => {
        await this.dispatch(event, payload);
      });
    }
  }

  // ── Rules ──

  async list(): Promise<AutomationRule[]> {
    const rows = await this.prisma.automationRule.findMany({
      where: { deletedAt: null },
      include: ruleInclude,
      orderBy: [{ event: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRule);
  }

  async get(id: string): Promise<AutomationRule> {
    return toRule(await this.find(id));
  }

  async create(input: AutomationRuleInput, actor: Actor): Promise<AutomationRule> {
    const actions = actionsSchema.parse(input.actions);
    await this.assertReferences(actions);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.automationRule.create({
        data: {
          name: input.name,
          active: input.active ?? true,
          event: input.event,
          conditions: (input.conditions ?? []) as Prisma.InputJsonValue,
          actions: actions as Prisma.InputJsonValue,
          createdById: actor.id,
        },
        include: ruleInclude,
      });
      const after = toRule(row);
      await this.audit.record(
        { action: 'CREATE', entity: 'automation_rule', entityId: row.id, after },
        tx,
      );
      return after;
    });
  }

  async update(id: string, input: AutomationRuleUpdate): Promise<AutomationRule> {
    const before = toRule(await this.find(id));
    if (input.actions) await this.assertReferences(actionsSchema.parse(input.actions));
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.automationRule.update({
        where: { id },
        data: {
          name: input.name,
          active: input.active,
          event: input.event,
          conditions: input.conditions as Prisma.InputJsonValue | undefined,
          actions: input.actions as Prisma.InputJsonValue | undefined,
        },
        include: ruleInclude,
      });
      const after = toRule(row);
      await this.audit.record(
        { action: 'UPDATE', entity: 'automation_rule', entityId: id, before, after },
        tx,
      );
      return after;
    });
  }

  /** Soft delete: past runs keep pointing at the rule. */
  async remove(id: string): Promise<void> {
    const before = toRule(await this.find(id));
    await this.prisma.$transaction(async (tx) => {
      await tx.automationRule.update({
        where: { id },
        data: { deletedAt: new Date(), active: false },
      });
      await this.audit.record(
        { action: 'DELETE', entity: 'automation_rule', entityId: id, before },
        tx,
      );
    });
  }

  /** Dry run with a sample payload: which conditions pass and what would happen. */
  async test(id: string, payload: Record<string, unknown>): Promise<AutomationTestResult> {
    const rule = toRule(await this.find(id));
    const conditions = rule.conditions.map((condition) => ({
      condition,
      passed: conditionPasses(condition, payload),
    }));
    const matched = conditions.every((c) => c.passed);
    return {
      matched,
      conditions,
      actions: matched ? rule.actions.map((a) => describe(a, payload)) : [],
    };
  }

  // ── Runs ──

  async runs(query: AutomationRunListQuery): Promise<Paginated<AutomationRun>> {
    const where: Prisma.AutomationRunWhereInput = { ruleId: query.ruleId, status: query.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.automationRun.findMany({
        where,
        include: { rule: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.automationRun.count({ where }),
    ]);
    return paginated(rows.map(toRun), total, query);
  }

  /** Runs a failed run again with the same input (US-AUTO-01). */
  async retry(runId: string): Promise<AutomationRun> {
    const { count } = await this.prisma.automationRun.updateMany({
      where: { id: runId, status: 'FAILED' },
      data: { status: 'PENDING', error: null },
    });
    if (count === 0) {
      const exists = await this.prisma.automationRun.count({ where: { id: runId } });
      if (!exists) {
        throw new AppException(HttpStatus.NOT_FOUND, 'AUTOMATION_RUN_NOT_FOUND', 'Run not found.');
      }
      throw new AppException(
        HttpStatus.CONFLICT,
        'RUN_NOT_FAILED',
        'Only failed runs can be retried.',
      );
    }
    await this.audit.record({ action: 'RETRY', entity: 'automation_run', entityId: runId });
    await this.jobs.send(AUTOMATION_RUN_JOB, { runId });
    return toRun(
      await this.prisma.automationRun.findUniqueOrThrow({
        where: { id: runId },
        include: { rule: { select: { id: true, name: true } } },
      }),
    );
  }

  /** Domain event → one logged run per matching active rule, executed as a background job. */
  async dispatch(event: AutomationEvent, payload: Record<string, unknown>): Promise<number> {
    const rules = await this.prisma.automationRule.findMany({
      where: { event, active: true, deletedAt: null },
      select: { id: true, conditions: true },
    });
    const matching = rules.filter((r) => conditionsMatch(parsedConditions(r.conditions), payload));
    for (const rule of matching) {
      const run = await this.prisma.automationRun.create({
        data: { ruleId: rule.id, event, payload: payload as Prisma.InputJsonValue },
      });
      await this.jobs.send(AUTOMATION_RUN_JOB, { runId: run.id });
    }
    return matching.length;
  }

  /** Executes a PENDING run once. Failures are recorded on the run, never thrown. */
  async execute(runId: string): Promise<void> {
    const { count } = await this.prisma.automationRun.updateMany({
      where: { id: runId, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (count === 0) return; // already taken by another worker
    const run = await this.prisma.automationRun.findUniqueOrThrow({
      where: { id: runId },
      include: { rule: true },
    });
    const payload = (run.payload ?? {}) as Record<string, unknown>;
    const results: unknown[] = [];
    let error: string | null = null;
    try {
      const actions = actionsSchema.parse(run.rule.actions);
      const context = { runId, event: run.event, ruleName: run.rule.name, payload, taskIds: [] };
      for (const action of actions) {
        results.push(await this.actions.perform(action, context));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.logger.warn({ err, runId, ruleId: run.ruleId }, 'Automation run failed');
    }
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: error ? 'FAILED' : 'SUCCEEDED',
        result: results as Prisma.InputJsonValue,
        error: error?.slice(0, 1_000) ?? null,
        finishedAt: new Date(),
      },
    });
  }

  // ── Helpers ──

  private async find(id: string): Promise<RuleRow> {
    const row = await this.prisma.automationRule.findFirst({
      where: { id, deletedAt: null },
      include: ruleInclude,
    });
    if (!row) throw notFound();
    return row;
  }

  /** Rules may only point at things that exist (checked again when they run). */
  private async assertReferences(actions: AutomationAction[]): Promise<void> {
    const missing: string[] = [];
    for (const [i, a] of actions.entries()) {
      const exists =
        a.type === 'assign_user'
          ? await this.prisma.user.count({ where: { id: a.userId, status: 'ACTIVE' } })
          : a.type === 'start_approval'
            ? await this.prisma.workflowDefinition.count({ where: { id: a.workflowId } })
            : a.type === 'call_webhook'
              ? await this.prisma.webhook.count({ where: { id: a.webhookId, deletedAt: null } })
              : 1;
      if (!exists) missing.push(`actions.${i}`);
    }
    if (missing.length) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_RULE_REFERENCE',
        'An action points to a user, workflow or webhook that does not exist.',
        { fields: missing },
      );
    }
  }
}
