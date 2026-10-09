import { z } from 'zod';
import { TaskStatus } from './enums.js';
import { pageQuery } from './pagination.js';

// Reports, dashboards, "Ask your data" and the task inbox (docs/api-contract.md §2.19–2.20).
// All numbers come from the reporting views (CLAUDE.md §9) and respect the caller's data scope.

const isoDate = z.iso.date();

export const reportFilterSchema = z.strictObject({
  from: isoDate.optional(),
  to: isoDate.optional(),
  clientId: z.uuid().optional(),
  jobId: z.uuid().optional(),
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const REPORT_NAMES = [
  'hiring-funnel',
  'time-to-hire',
  'client-revenue',
  'open-requests',
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];
export const REPORT_LABELS: Record<ReportName, string> = {
  'hiring-funnel': 'Hiring funnel',
  'time-to-hire': 'Time to hire',
  'client-revenue': 'Client revenue',
  'open-requests': 'Open manpower requests',
};

export const exportQuerySchema = reportFilterSchema.extend({
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;

/** Funnel order; a stage counts every application that ever reached it. */
export const FUNNEL_STAGES = [
  'APPLIED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
] as const;

export const hiringFunnelSchema = z.object({
  stages: z.array(z.object({ stage: z.enum(FUNNEL_STAGES), count: z.number().int() })),
  /** Hired ÷ applied, 0–1 (null when nobody applied). */
  conversion: z.number().nullable(),
});
export type HiringFunnel = z.infer<typeof hiringFunnelSchema>;

export const timeToHireSchema = z.object({
  hires: z.number().int(),
  averageDays: z.number().nullable(),
  medianDays: z.number().nullable(),
  byCategory: z.array(
    z.object({ category: z.string(), hires: z.number().int(), averageDays: z.number() }),
  ),
  byMonth: z.array(
    z.object({ month: z.string(), hires: z.number().int(), averageDays: z.number() }),
  ),
});
export type TimeToHire = z.infer<typeof timeToHireSchema>;

export const clientRevenueSchema = z.object({
  totalFils: z.number().int(),
  paidFils: z.number().int(),
  outstandingFils: z.number().int(),
  byClient: z.array(
    z.object({
      clientId: z.uuid(),
      clientName: z.string(),
      invoices: z.number().int(),
      totalFils: z.number().int(),
      paidFils: z.number().int(),
      outstandingFils: z.number().int(),
    }),
  ),
  byMonth: z.array(z.object({ month: z.string(), totalFils: z.number().int() })),
});
export type ClientRevenue = z.infer<typeof clientRevenueSchema>;

export const openRequestRowSchema = z.object({
  manpowerRequestId: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string(),
  roleTitle: z.string(),
  headcount: z.number().int(),
  hired: z.number().int(),
  status: z.string(),
  ageDays: z.number().int(),
  startDate: z.string(),
});
export const openRequestsSchema = z.object({
  total: z.number().int(),
  olderThan30Days: z.number().int(),
  rows: z.array(openRequestRowSchema),
});
export type OpenRequests = z.infer<typeof openRequestsSchema>;

// ── Dashboard ──

export const widgetSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  format: z.enum(['number', 'money', 'days', 'percent']),
  hint: z.string().nullable(),
  link: z.string().nullable(),
});
export type Widget = z.infer<typeof widgetSchema>;

export const dashboardSchema = z.object({
  widgets: z.array(widgetSchema),
  funnel: hiringFunnelSchema.nullable(),
  openRequests: z.array(openRequestRowSchema).nullable(),
  revenueByMonth: clientRevenueSchema.shape.byMonth.nullable(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

// ── Ask your data (US-AI-02) ──

export const ASK_DATA_VIEWS = [
  'v_hiring_funnel',
  'v_time_to_hire',
  'v_client_revenue',
  'v_open_requests',
] as const;
export const ASK_DATA_MAX_ROWS = 500;

export const askDataInputSchema = z.strictObject({
  question: z.string().trim().min(5, 'Ask a full question.').max(500),
});
export const askDataLlmSchema = z.object({
  sql: z.string().min(10).max(4_000),
  answer: z.string().max(1_000),
  chart: z
    .object({
      type: z.enum(['bar', 'line', 'none']),
      x: z.string().max(63).nullable().optional(),
      y: z.string().max(63).nullable().optional(),
    })
    .default({ type: 'none' }),
});
export const askDataResponseSchema = z.object({
  question: z.string(),
  answer: z.string(),
  sql: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  truncated: z.boolean(),
  chart: z.object({
    type: z.enum(['bar', 'line', 'none']),
    x: z.string().nullable(),
    y: z.string().nullable(),
  }),
});
export type AskDataResponse = z.infer<typeof askDataResponseSchema>;

// ── Task inbox ──

const taskStatusSchema = z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]);

export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  assignee: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  assigneeRole: z.string().nullable(),
  dueDate: z.string().nullable(),
  /** Where the task's record opens in the app, when it has one. */
  link: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskListQuerySchema = z.strictObject({
  page: pageQuery().page,
  pageSize: pageQuery().pageSize,
  status: taskStatusSchema.default('OPEN'),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
