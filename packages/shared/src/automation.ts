import { z } from 'zod';
import {
  ApprovalStatus,
  AutomationEvent,
  DeliveryStatus,
  RoleCode,
  RunStatus,
  WebhookEvent,
  WorkflowSubject,
} from './enums.js';
import { pageQuery } from './pagination.js';

// Approval chains, automation rules and outgoing webhooks (docs/api-contract.md §2.18, §2.22).

const enumOf = <T extends Record<string, string>>(e: T) =>
  z.enum(Object.values(e) as [T[keyof T], ...T[keyof T][]]);

const roleCodeSchema = enumOf(RoleCode);
export const workflowSubjectSchema = enumOf(WorkflowSubject);
export const approvalStatusSchema = enumOf(ApprovalStatus);
export const automationEventSchema = enumOf(AutomationEvent);
export const runStatusSchema = enumOf(RunStatus);
export const deliveryStatusSchema = enumOf(DeliveryStatus);

const text = (max: number) => z.string().trim().min(1, 'Required.').max(max);
const person = z.object({ id: z.uuid(), name: z.string() });

// ── Approval chains (US-WF-01) ──

export const workflowStepInputSchema = z.strictObject({
  name: text(100),
  approverRole: roleCodeSchema,
});

export const workflowInputSchema = z.strictObject({
  name: text(150),
  subject: workflowSubjectSchema,
  active: z.boolean().default(true),
  steps: z.array(workflowStepInputSchema).min(1, 'Add at least one step.').max(10),
});
export type WorkflowInput = z.input<typeof workflowInputSchema>;

/** Steps are replaced as a whole; running approvals keep the steps they started with. */
export const workflowUpdateSchema = workflowInputSchema.partial().omit({ subject: true });
export type WorkflowUpdate = z.input<typeof workflowUpdateSchema>;

export const workflowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  subject: workflowSubjectSchema,
  active: z.boolean(),
  steps: z.array(
    z.object({ stepOrder: z.number().int(), name: z.string(), approverRole: roleCodeSchema }),
  ),
  pendingCount: z.number().int(),
  createdAt: z.string(),
});
export type Workflow = z.infer<typeof workflowSchema>;

export const approvalSchema = z.object({
  id: z.uuid(),
  workflow: z.object({ id: z.uuid(), name: z.string() }),
  subject: workflowSubjectSchema,
  /** The manpower request or offer being approved; `link` opens it. */
  entityId: z.uuid(),
  title: z.string(),
  link: z.string(),
  status: approvalStatusSchema,
  currentStep: z.number().int(),
  totalSteps: z.number().int(),
  currentStepName: z.string().nullable(),
  currentRole: roleCodeSchema.nullable(),
  decisions: z.array(
    z.object({
      stepOrder: z.number().int(),
      decision: z.enum(['APPROVED', 'REJECTED']),
      comment: z.string().nullable(),
      decidedBy: person,
      decidedAt: z.string(),
    }),
  ),
  createdAt: z.string(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const approvalListQuerySchema = z.strictObject({
  page: pageQuery().page,
  pageSize: pageQuery().pageSize,
  /** `me` (default): pending approvals waiting on one of my roles. `all` needs workflows:manage. */
  assignedTo: z.enum(['me', 'all']).default('me'),
  status: approvalStatusSchema.optional(),
});
export type ApprovalListQuery = z.infer<typeof approvalListQuerySchema>;

export type ApprovalOutcome = 'ADVANCED' | 'APPROVED' | 'REJECTED';

/** Pure chain rule: rejection at any step ends it; approval moves on or completes the chain. */
export function nextApprovalState(
  currentStep: number,
  totalSteps: number,
  decision: 'APPROVED' | 'REJECTED',
): { outcome: ApprovalOutcome; currentStep: number } {
  if (decision === 'REJECTED') return { outcome: 'REJECTED', currentStep };
  if (currentStep >= totalSteps) return { outcome: 'APPROVED', currentStep };
  return { outcome: 'ADVANCED', currentStep: currentStep + 1 };
}

// ── Automation rules (US-AUTO-01) ──

export const CONDITION_OPS = ['eq', 'neq', 'gt', 'lt', 'in'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

const scalar = z.union([z.string().max(200), z.number(), z.boolean()]);

export const conditionSchema = z.strictObject({
  field: z
    .string()
    .trim()
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'Use a payload field name, e.g. headcount.'),
  op: z.enum(CONDITION_OPS),
  value: z.union([scalar, z.array(scalar).min(1).max(20)]),
});
export type Condition = z.infer<typeof conditionSchema>;

// ── Email templates for the send_email action ({{fields}} filled from the event payload) ──

export const AUTOMATION_EMAIL_TEMPLATES = {
  employee_hired: {
    label: 'New hire',
    title: 'New hire: {{candidateName}}',
    body: '{{candidateName}} ({{employeeNumber}}) was hired as {{jobTitle}} for {{clientName}}, starting {{startDate}}.',
  },
  document_expiring: {
    label: 'Document expiring',
    title: '{{documentType}} expiring for {{employeeName}}',
    body: '{{employeeNumber}}: the document expires on {{expiryDate}} ({{thresholdDays}}-day alert). Please arrange the renewal.',
  },
  stage_changed: {
    label: 'Application stage changed',
    title: '{{candidateName}} moved to {{to}}',
    body: '{{candidateName}} moved from {{from}} to {{to}} for {{jobTitle}} ({{clientName}}).',
  },
  timesheet_submitted: {
    label: 'Timesheet submitted',
    title: 'Timesheet submitted: {{employeeName}}',
    body: 'Week of {{periodStart}} for {{clientName}} is waiting for approval.',
  },
  manpower_request_created: {
    label: 'Manpower request created',
    title: 'New manpower request: {{roleTitle}} ×{{headcount}}',
    body: '{{clientName}} requested {{headcount}} × {{roleTitle}} in {{emirate}}.',
  },
} as const;
export type AutomationEmailTemplate = keyof typeof AUTOMATION_EMAIL_TEMPLATES;

/** Who an email or notification goes to; resolved from the event payload at run time. */
export const RECIPIENTS = ['account_manager', 'hr', 'recruiter'] as const;
const recipientSchema = z.enum(RECIPIENTS);

export const actionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('create_task'),
    title: text(200),
    assigneeRole: roleCodeSchema.optional(),
    dueInDays: z.number().int().min(0).max(365).optional(),
  }),
  z.strictObject({
    type: z.literal('send_email'),
    template: z.enum(
      Object.keys(AUTOMATION_EMAIL_TEMPLATES) as [
        AutomationEmailTemplate,
        ...AutomationEmailTemplate[],
      ],
      { error: 'Choose an email template.' },
    ),
    to: z.union([recipientSchema, z.email()]),
  }),
  z.strictObject({ type: z.literal('notify'), to: recipientSchema, message: text(300) }),
  z.strictObject({ type: z.literal('assign_user'), userId: z.uuid() }),
  z.strictObject({ type: z.literal('start_approval'), workflowId: z.uuid() }),
  z.strictObject({ type: z.literal('call_webhook'), webhookId: z.uuid() }),
]);
export type AutomationAction = z.infer<typeof actionSchema>;
export type AutomationActionType = AutomationAction['type'];

export const automationRuleInputSchema = z.strictObject({
  name: text(150),
  active: z.boolean().default(true),
  event: automationEventSchema,
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(actionSchema).min(1, 'Add at least one action.').max(10),
});
export type AutomationRuleInput = z.input<typeof automationRuleInputSchema>;
export const automationRuleUpdateSchema = automationRuleInputSchema.partial();
export type AutomationRuleUpdate = z.input<typeof automationRuleUpdateSchema>;

export const automationRuleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  event: automationEventSchema,
  conditions: z.array(conditionSchema),
  actions: z.array(actionSchema),
  lastRun: z.object({ status: runStatusSchema, createdAt: z.string() }).nullable(),
  createdAt: z.string(),
});
export type AutomationRule = z.infer<typeof automationRuleSchema>;

export const automationRunSchema = z.object({
  id: z.uuid(),
  rule: z.object({ id: z.uuid(), name: z.string() }),
  event: automationEventSchema,
  payload: z.record(z.string(), z.unknown()),
  status: runStatusSchema,
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AutomationRun = z.infer<typeof automationRunSchema>;

export const automationRunListQuerySchema = z.strictObject({
  page: pageQuery().page,
  pageSize: pageQuery().pageSize,
  ruleId: z.uuid().optional(),
  status: runStatusSchema.optional(),
});
export type AutomationRunListQuery = z.infer<typeof automationRunListQuerySchema>;

export const automationTestInputSchema = z.strictObject({
  payload: z.record(z.string(), z.unknown()),
});
export const automationTestResultSchema = z.object({
  matched: z.boolean(),
  conditions: z.array(z.object({ condition: conditionSchema, passed: z.boolean() })),
  /** What would run, with {{placeholders}} filled in. Nothing is executed. */
  actions: z.array(z.string()),
});
export type AutomationTestResult = z.infer<typeof automationTestResultSchema>;

/** One condition against a flat event payload. Missing fields never match. */
export function conditionPasses(c: Condition, payload: Record<string, unknown>): boolean {
  const actual = payload[c.field];
  if (actual === undefined || actual === null) return false;
  const same = (v: unknown) => String(actual) === String(v);
  switch (c.op) {
    case 'eq':
      return Array.isArray(c.value) ? false : same(c.value);
    case 'neq':
      return Array.isArray(c.value) ? false : !same(c.value);
    case 'in':
      return (Array.isArray(c.value) ? c.value : [c.value]).some(same);
    case 'gt':
    case 'lt': {
      const a = Number(actual);
      const b = Number(c.value);
      if (Array.isArray(c.value) || Number.isNaN(a) || Number.isNaN(b)) return false;
      return c.op === 'gt' ? a > b : a < b;
    }
  }
}

/** All conditions must pass (AND); no conditions = always runs. */
export function conditionsMatch(
  conditions: Condition[],
  payload: Record<string, unknown>,
): boolean {
  return conditions.every((c) => conditionPasses(c, payload));
}

/**
 * Fills `{{field}}` placeholders from the payload. Plain lookup only (no expressions), so a rule
 * can never run code; unknown fields are left blank.
 */
export function fillTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, key: string) => {
    const v = payload[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

export const AUTOMATION_EVENT_LABELS: Record<AutomationEvent, string> = {
  APPLICATION_STAGE_CHANGED: 'Application stage changed',
  EMPLOYEE_HIRED: 'Employee hired',
  DOCUMENT_EXPIRING: 'Document expiring',
  TIMESHEET_SUBMITTED: 'Timesheet submitted',
  MANPOWER_REQUEST_CREATED: 'Manpower request created',
};

/** Payload fields each event carries: offered in the builder and usable in conditions/{{text}}. */
export const AUTOMATION_EVENT_FIELDS: Record<AutomationEvent, readonly string[]> = {
  APPLICATION_STAGE_CHANGED: [
    'applicationId',
    'from',
    'to',
    'candidateName',
    'jobTitle',
    'clientName',
    'clientId',
  ],
  EMPLOYEE_HIRED: [
    'employeeId',
    'employeeNumber',
    'candidateName',
    'jobTitle',
    'clientName',
    'clientId',
    'startDate',
  ],
  DOCUMENT_EXPIRING: [
    'documentId',
    'documentType',
    'thresholdDays',
    'expiryDate',
    'employeeName',
    'employeeNumber',
  ],
  TIMESHEET_SUBMITTED: ['timesheetId', 'employeeName', 'clientName', 'clientId', 'periodStart'],
  MANPOWER_REQUEST_CREATED: [
    'manpowerRequestId',
    'roleTitle',
    'headcount',
    'clientName',
    'clientId',
    'emirate',
  ],
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  create_task: 'Create task',
  send_email: 'Send email',
  notify: 'Send in-app notification',
  assign_user: 'Assign user',
  start_approval: 'Start approval',
  call_webhook: 'Call webhook',
};

export const RECIPIENT_LABELS: Record<(typeof RECIPIENTS)[number], string> = {
  account_manager: "Client's account manager",
  hr: 'HR managers',
  recruiter: 'Assigned recruiter',
};

export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  lt: '<',
  in: 'is one of',
};

// ── Outgoing webhooks (US-HOOK-01) ──

/** Events an endpoint can subscribe to; `call_webhook` actions may also send automation events. */
export const SUBSCRIBABLE_WEBHOOK_EVENTS = [
  'APPLICATION_STAGE_CHANGED',
  'EMPLOYEE_HIRED',
  'INVOICE_ISSUED',
] as const satisfies readonly WebhookEvent[];
export const webhookEventSchema = enumOf(WebhookEvent);

/** Wire names in the delivery body (`event` field and `X-StaffOS-Event` header). */
export const WEBHOOK_EVENT_NAMES: Record<WebhookEvent, string> = {
  APPLICATION_STAGE_CHANGED: 'application.stage_changed',
  EMPLOYEE_HIRED: 'employee.hired',
  INVOICE_ISSUED: 'invoice.issued',
  DOCUMENT_EXPIRING: 'document.expiring',
  TIMESHEET_SUBMITTED: 'timesheet.submitted',
  MANPOWER_REQUEST_CREATED: 'manpower_request.created',
};

const httpsUrl = z
  .url({ protocol: /^https$/, error: 'Use an https:// URL.' })
  .max(500, 'URL is too long.');

export const webhookInputSchema = z.strictObject({
  url: httpsUrl,
  events: z
    .array(z.enum(SUBSCRIBABLE_WEBHOOK_EVENTS))
    .min(1, 'Choose at least one event.')
    .max(SUBSCRIBABLE_WEBHOOK_EVENTS.length),
  active: z.boolean().default(true),
});
export type WebhookInput = z.input<typeof webhookInputSchema>;
export const webhookUpdateSchema = webhookInputSchema.partial();
export type WebhookUpdate = z.input<typeof webhookUpdateSchema>;

export const webhookSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  events: z.array(webhookEventSchema),
  active: z.boolean(),
  lastDelivery: z
    .object({
      status: deliveryStatusSchema,
      responseStatus: z.number().int().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
  createdAt: z.string(),
});
export type Webhook = z.infer<typeof webhookSchema>;

/** Returned on create and rotate only: the signing secret is never shown again. */
export const webhookWithSecretSchema = webhookSchema.extend({ secret: z.string() });
export type WebhookWithSecret = z.infer<typeof webhookWithSecretSchema>;

export const webhookDeliverySchema = z.object({
  id: z.uuid(),
  event: webhookEventSchema,
  status: deliveryStatusSchema,
  attempts: z.number().int(),
  responseStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const webhookDeliveryListQuerySchema = z.strictObject({
  page: pageQuery().page,
  pageSize: pageQuery().pageSize,
});
export type WebhookDeliveryListQuery = z.infer<typeof webhookDeliveryListQuerySchema>;

export const WEBHOOK_MAX_ATTEMPTS = 5;

/** Delay before retry n (1-based): 30 s, 1, 2, 4 min… (exponential backoff). */
export function webhookRetryDelayMs(attempt: number): number {
  return 30_000 * 2 ** Math.max(0, attempt - 1);
}
