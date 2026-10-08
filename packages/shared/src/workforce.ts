import { z } from 'zod';
import { isoDate } from './crm.js';
import { DeploymentStatus, TimesheetStatus } from './enums.js';
import { pageQuery, sortSchema } from './pagination.js';

// Deployments and timesheets (docs/api-contract.md §2.15–2.16).

const enumOf = <T extends Record<string, string>>(e: T) =>
  z.enum(Object.values(e) as [T[keyof T], ...T[keyof T][]]);

export const deploymentStatusSchema = enumOf(DeploymentStatus);
export const timesheetStatusSchema = enumOf(TimesheetStatus);

const version = z.number().int().min(1);
const person = z.object({ id: z.uuid(), name: z.string() });
const reason = (max: number) => z.string().trim().min(1, 'Required.').max(max);

// ── Deployments ──

export const deploymentCreateSchema = z
  .strictObject({
    employeeId: z.uuid('Choose an employee.'),
    projectId: z.uuid('Choose a project.'),
    startDate: isoDate,
    endDate: isoDate.optional(),
    /** Bill rate per hour, in fils. */
    billRateFils: z.number().int().min(1, 'Enter a bill rate.').max(100_000_000),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('AED'),
    /** HR Manager only: deploy before onboarding is complete (US-DEP-01). */
    overrideReason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: 'The end date must be on or after the start date.',
    path: ['endDate'],
  });
export type DeploymentCreate = z.input<typeof deploymentCreateSchema>;
export type DeploymentCreateData = z.output<typeof deploymentCreateSchema>;

export const deploymentUpdateSchema = z
  .strictObject({
    version,
    endDate: isoDate.nullable().optional(),
    billRateFils: z.number().int().min(1).max(100_000_000).optional(),
  })
  .refine((v) => v.endDate !== undefined || v.billRateFils !== undefined, 'Nothing to change.');
export type DeploymentUpdate = z.input<typeof deploymentUpdateSchema>;

export const deploymentEndSchema = z.strictObject({
  version,
  endDate: isoDate,
  reason: reason(500),
});
export type DeploymentEnd = z.input<typeof deploymentEndSchema>;

export const deploymentSchema = z.object({
  id: z.uuid(),
  employee: person.extend({ employeeNumber: z.string() }),
  project: z.object({ id: z.uuid(), name: z.string() }),
  client: z.object({ id: z.uuid(), name: z.string() }),
  startDate: z.string(),
  endDate: z.string().nullable(),
  /** Null for roles that may not see billing (employees). */
  billRateFils: z.number().int().nullable(),
  currency: z.string(),
  status: deploymentStatusSchema,
  overrideReason: z.string().nullable(),
  endReason: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
});
export type Deployment = z.infer<typeof deploymentSchema>;

export const deploymentListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['startDate', 'createdAt'], '-startDate'),
  filter: z
    .strictObject({
      clientId: z.uuid().optional(),
      projectId: z.uuid().optional(),
      employeeId: z.uuid().optional(),
      status: deploymentStatusSchema.optional(),
    })
    .optional(),
});
export type DeploymentListQuery = z.infer<typeof deploymentListQuerySchema>;

// ── Timesheets ──

/** Up to 16 hours a day, in minutes (no decimals on the wire). */
export const MAX_DAILY_MINUTES = 960;

export const timesheetEntrySchema = z.strictObject({
  date: isoDate,
  minutes: z
    .number()
    .int()
    .min(0, 'Hours cannot be negative.')
    .max(MAX_DAILY_MINUTES, 'At most 16 hours a day.'),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

const entries = z
  .array(timesheetEntrySchema)
  .max(7)
  .refine((e) => new Set(e.map((x) => x.date)).size === e.length, 'Each day can appear once.');

export const timesheetCreateSchema = z.strictObject({
  deploymentId: z.uuid(),
  weekStart: isoDate,
  entries: entries.default([]),
});
export type TimesheetCreate = z.input<typeof timesheetCreateSchema>;
export type TimesheetCreateData = z.output<typeof timesheetCreateSchema>;

export const timesheetUpdateSchema = z.strictObject({ version, entries });
export type TimesheetUpdate = z.input<typeof timesheetUpdateSchema>;
export type TimesheetUpdateData = z.output<typeof timesheetUpdateSchema>;

export const timesheetActionSchema = z.strictObject({ version });
export const timesheetRejectSchema = z.strictObject({ version, comment: reason(1_000) });
export const bulkApproveSchema = z.strictObject({ ids: z.array(z.uuid()).min(1).max(100) });
export const bulkResultSchema = z.array(
  z.object({ id: z.uuid(), ok: z.boolean(), code: z.string().optional() }),
);

export const timesheetSchema = z.object({
  id: z.uuid(),
  deploymentId: z.uuid(),
  employee: person.extend({ employeeNumber: z.string() }),
  client: z.object({ id: z.uuid(), name: z.string() }),
  project: z.string(),
  weekStart: z.string(),
  status: timesheetStatusSchema,
  totalMinutes: z.number().int(),
  entries: z
    .array(z.object({ date: z.string(), minutes: z.number().int(), note: z.string().nullable() }))
    .optional(),
  /** The deployment's dates, so the editor can disable days outside it. */
  deploymentStart: z.string(),
  deploymentEnd: z.string().nullable(),
  submittedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decidedBy: person.nullable(),
  rejectComment: z.string().nullable(),
  version: z.number().int(),
});
export type Timesheet = z.infer<typeof timesheetSchema>;

export const timesheetListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['weekStart', 'submittedAt'], '-weekStart'),
  filter: z
    .strictObject({
      status: timesheetStatusSchema.optional(),
      clientId: z.uuid().optional(),
      employeeId: z.uuid().optional(),
      weekStart: isoDate.optional(),
    })
    .optional(),
});
export type TimesheetListQuery = z.infer<typeof timesheetListQuerySchema>;

export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  ENDED: 'Ended',
  CANCELLED: 'Cancelled',
};
export const TIMESHEET_STATUS_LABELS: Record<TimesheetStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  INVOICED: 'Invoiced',
};

// ── Week helpers (dates are YYYY-MM-DD, UAE calendar) ──

const DAY = 86_400_000;
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDaysIso(date: string, days: number): string {
  return fmt(toUtc(date) + days * DAY);
}

/** Monday of the ISO week containing `date`. */
export function mondayOf(date: string): string {
  const dow = new Date(toUtc(date)).getUTCDay(); // 0 = Sunday
  return addDaysIso(date, dow === 0 ? -6 : 1 - dow);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}

export const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
