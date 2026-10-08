import { z } from 'zod';
import { isoDate, jobCategorySchema } from './crm.js';
import {
  EmployeeStatus,
  OnboardingPlanStatus,
  OnboardingTaskStatus,
  OnboardingTaskType,
  RoleCode,
} from './enums.js';
import { pageQuery, sortSchema } from './pagination.js';

// HR core, onboarding and notifications (docs/api-contract.md §2.12, §2.14, §2.21).

const enumOf = <T extends Record<string, string>>(e: T) =>
  z.enum(Object.values(e) as [T[keyof T], ...T[keyof T][]]);

export const employeeStatusSchema = enumOf(EmployeeStatus);
export const onboardingTaskTypeSchema = enumOf(OnboardingTaskType);
export const onboardingPlanStatusSchema = enumOf(OnboardingPlanStatus);
export const onboardingTaskStatusSchema = enumOf(OnboardingTaskStatus);
const roleCodeSchema = enumOf(RoleCode);

const text = (max: number) => z.string().trim().min(1, 'Required.').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));
const version = z.number().int().min(1);
const person = z.object({ id: z.uuid(), name: z.string() });
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number.');

// ── Departments and positions ──

export const departmentSchema = z.object({ id: z.uuid(), name: z.string() });
export type Department = z.infer<typeof departmentSchema>;
export const departmentInputSchema = z.strictObject({ name: text(100) });
export type DepartmentInput = z.input<typeof departmentInputSchema>;

export const positionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  department: departmentSchema.nullable(),
});
export type Position = z.infer<typeof positionSchema>;
export const positionInputSchema = z.strictObject({
  title: text(100),
  departmentId: z.uuid().nullable().optional(),
});
export type PositionInput = z.input<typeof positionInputSchema>;

// ── Employees ──

export const employeeSchema = z.object({
  id: z.uuid(),
  employeeNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: employeeStatusSchema,
  hireDate: z.string(),
  /** Null when the caller may not see pay (only HR, Finance and the employee themselves). */
  salaryFils: z.number().int().nullable(),
  currency: z.string(),
  version: z.number().int(),
  department: departmentSchema.nullable(),
  position: z.object({ id: z.uuid(), title: z.string() }).nullable(),
  /** The linked StaffOS login, if the employee has been invited. */
  account: z.object({ id: z.uuid(), status: z.string() }).nullable(),
  candidateId: z.uuid().nullable(),
  applicationId: z.uuid().nullable(),
  job: z.object({ id: z.uuid(), title: z.string(), client: z.string() }).nullable(),
  onboarding: z
    .object({
      planId: z.uuid(),
      status: onboardingPlanStatusSchema,
      done: z.number().int(),
      total: z.number().int(),
    })
    .nullable(),
  createdAt: z.string(),
});
export type Employee = z.infer<typeof employeeSchema>;

/** HR edits everything here; an employee editing their own record may only send `email`/`phone`. */
export const employeeUpdateSchema = z.strictObject({
  version,
  firstName: text(100).optional(),
  lastName: text(100).optional(),
  email: z.email('Enter a valid email.').max(254).optional(),
  phone: phone.nullable().optional(),
  departmentId: z.uuid().nullable().optional(),
  positionId: z.uuid().nullable().optional(),
  status: employeeStatusSchema.optional(),
  salaryFils: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
});
export type EmployeeUpdate = z.input<typeof employeeUpdateSchema>;
export type EmployeeUpdateData = z.output<typeof employeeUpdateSchema>;
export const EMPLOYEE_CONTACT_FIELDS = ['email', 'phone'] as const;

export const employeeListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt', 'lastName', 'employeeNumber', 'hireDate'], '-createdAt'),
  filter: z
    .strictObject({
      status: employeeStatusSchema.optional(),
      departmentId: z.uuid().optional(),
      clientId: z.uuid().optional(),
    })
    .optional(),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

// ── Onboarding templates ──

/** Roles a template task can be assigned to (people who do onboarding work). */
export const ONBOARDING_ASSIGNEE_ROLES = ['HR_MANAGER', 'EMPLOYEE'] as const;

export const templateTaskInputSchema = z.strictObject({
  title: text(200),
  description: optionalText(1_000),
  type: onboardingTaskTypeSchema,
  assigneeRole: z.enum(ONBOARDING_ASSIGNEE_ROLES),
  /** Days from the start date; negative = before the employee starts (visa, medical). */
  dueOffsetDays: z.number().int().min(-90).max(180),
  required: z.boolean().default(true),
});

export const templateInputSchema = z.strictObject({
  name: text(100),
  /** One template per category; null = the default template. */
  category: jobCategorySchema.nullable(),
  active: z.boolean().default(true),
  tasks: z.array(templateTaskInputSchema).min(1, 'Add at least one task.').max(50),
});
export type TemplateInput = z.input<typeof templateInputSchema>;
export type TemplateInputData = z.output<typeof templateInputSchema>;

export const templateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: jobCategorySchema.nullable(),
  active: z.boolean(),
  tasks: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      description: z.string().nullable(),
      type: onboardingTaskTypeSchema,
      assigneeRole: roleCodeSchema,
      dueOffsetDays: z.number().int(),
      required: z.boolean(),
    }),
  ),
  planCount: z.number().int(),
  updatedAt: z.string(),
});
export type OnboardingTemplate = z.infer<typeof templateSchema>;

// ── Onboarding plans and tasks ──

export const onboardingTaskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: onboardingTaskTypeSchema,
  assigneeRole: roleCodeSchema,
  assignee: person.nullable(),
  dueDate: z.string(),
  required: z.boolean(),
  status: onboardingTaskStatusSchema,
  completedAt: z.string().nullable(),
  completedBy: person.nullable(),
  note: z.string().nullable(),
  /** Whether the caller may complete it (same rule as the API). */
  canComplete: z.boolean(),
});
export type OnboardingTask = z.infer<typeof onboardingTaskSchema>;

export const onboardingPlanSchema = z.object({
  id: z.uuid(),
  status: onboardingPlanStatusSchema,
  startDate: z.string(),
  completedAt: z.string().nullable(),
  employee: z.object({ id: z.uuid(), name: z.string(), employeeNumber: z.string() }),
  template: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  progress: z.object({
    done: z.number().int(),
    total: z.number().int(),
    overdue: z.number().int(),
  }),
  tasks: z.array(onboardingTaskSchema).optional(),
  createdAt: z.string(),
});
export type OnboardingPlan = z.infer<typeof onboardingPlanSchema>;

export const planListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt', 'startDate'], 'startDate'),
  filter: z
    .strictObject({
      status: onboardingPlanStatusSchema.optional(),
      employeeId: z.uuid().optional(),
    })
    .optional(),
});
export type PlanListQuery = z.infer<typeof planListQuerySchema>;

export const taskCompleteSchema = z.strictObject({
  note: optionalText(1_000),
  documentId: z.uuid().optional(),
});
export type TaskComplete = z.input<typeof taskCompleteSchema>;

export const taskUpdateSchema = z
  .strictObject({
    assigneeId: z.uuid().nullable().optional(),
    dueDate: isoDate.optional(),
  })
  .refine((v) => v.assigneeId !== undefined || v.dueDate !== undefined, 'Nothing to change.');
export type TaskUpdate = z.input<typeof taskUpdateSchema>;

// ── Notifications ──

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = z.strictObject({
  page: pageQuery().page,
  pageSize: pageQuery().pageSize,
  unread: z.enum(['true', 'false']).optional(),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const unreadCountSchema = z.object({ count: z.number().int() });

// ── Labels ──

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ONBOARDING: 'Onboarding',
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  TERMINATED: 'Terminated',
};
export const ONBOARDING_TASK_TYPE_LABELS: Record<OnboardingTaskType, string> = {
  DOCUMENTS: 'Documents',
  MEDICAL: 'Medical',
  VISA: 'Visa',
  IT: 'IT',
  INDUCTION: 'Induction',
  OTHER: 'Other',
};
export const PLAN_STATUS_LABELS: Record<OnboardingPlanStatus, string> = {
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
