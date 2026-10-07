import { z } from 'zod';
import {
  ActivityType,
  ClientStatus,
  Emirate,
  Industry,
  JobCategory,
  ManpowerRequestStatus,
  ProjectStatus,
} from './enums.js';
import { pageQuery, sortSchema } from './pagination.js';

// CRM schemas shared by the API (validation) and the web forms (docs/api-contract.md §2.4–2.5).

const enumOf = <T extends Record<string, string>>(e: T) =>
  z.enum(Object.values(e) as [T[keyof T], ...T[keyof T][]]);

export const industrySchema = enumOf(Industry);
export const emirateSchema = enumOf(Emirate);
export const clientStatusSchema = enumOf(ClientStatus);
export const activityTypeSchema = enumOf(ActivityType);
export const jobCategorySchema = enumOf(JobCategory);
export const manpowerRequestStatusSchema = enumOf(ManpowerRequestStatus);
export const projectStatusSchema = enumOf(ProjectStatus);

const text = (max: number) => z.string().trim().min(1, 'Required.').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));
/** YYYY-MM-DD (dates without time; api-contract.md §1.1). */
export const isoDate = z.iso.date('Use the format YYYY-MM-DD.');
const fils = z.number().int().min(0).max(1_000_000_000);

export const EMIRATE_LABELS: Record<Emirate, string> = {
  ABU_DHABI: 'Abu Dhabi',
  DUBAI: 'Dubai',
  SHARJAH: 'Sharjah',
  AJMAN: 'Ajman',
  UMM_AL_QUWAIN: 'Umm Al Quwain',
  RAS_AL_KHAIMAH: 'Ras Al Khaimah',
  FUJAIRAH: 'Fujairah',
};

export const INDUSTRY_LABELS: Record<Industry, string> = {
  CONSTRUCTION: 'Construction',
  LOGISTICS: 'Logistics',
  FACILITIES: 'Facilities management',
  HEALTHCARE: 'Healthcare',
  HOSPITALITY: 'Hospitality',
  TECHNOLOGY: 'Technology',
  OTHER: 'Other',
};

export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  DRIVER: 'Drivers',
  CONSTRUCTION: 'Construction',
  ENGINEERING: 'Engineering',
  ELECTRICAL: 'Electrical',
  HEALTHCARE: 'Healthcare',
  FACILITIES: 'Facilities',
  HOSPITALITY: 'Hospitality',
  FINANCE: 'Finance',
  IT: 'IT',
  OTHER: 'Other',
};

// ── Clients ──

// Base fields carry no defaults, so PATCH (partial) never resets values the caller didn't send.
const clientFields = {
  name: text(150),
  industry: industrySchema,
  trn: z
    .string()
    .trim()
    .regex(/^\d{15}$/, 'TRN must be 15 digits.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  vatRateBps: z.number().int().min(0).max(10_000),
  addressLine1: optionalText(200),
  city: text(80),
  emirate: emirateSchema,
  paymentTermsDays: z.number().int().min(0).max(365),
  status: clientStatusSchema,
  /** HR Manager / Super Admin only; defaults to the creator. */
  accountManagerId: z.uuid().optional(),
};

export const clientInputSchema = z.strictObject({
  ...clientFields,
  vatRateBps: clientFields.vatRateBps.default(500),
  paymentTermsDays: clientFields.paymentTermsDays.default(30),
  status: clientFields.status.default('ACTIVE'),
});
export type ClientInput = z.input<typeof clientInputSchema>;
export type ClientCreate = z.output<typeof clientInputSchema>;

export const clientUpdateSchema = z.strictObject(clientFields).partial();
export type ClientUpdate = z.input<typeof clientUpdateSchema>;

export const clientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  industry: industrySchema,
  trn: z.string().nullable(),
  vatRateBps: z.number().int(),
  addressLine1: z.string().nullable(),
  city: z.string(),
  emirate: emirateSchema,
  paymentTermsDays: z.number().int(),
  status: clientStatusSchema,
  accountManager: z.object({ id: z.uuid(), name: z.string() }),
  openRequests: z.number().int(),
  createdAt: z.string(),
});
export type Client = z.infer<typeof clientSchema>;

export const clientListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt', 'name'], 'name'),
  filter: z
    .strictObject({
      industry: industrySchema.optional(),
      status: clientStatusSchema.optional(),
      accountManagerId: z.uuid().optional(),
    })
    .optional(),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

// ── Contacts, activities, projects ──

export const contactInputSchema = z.strictObject({
  firstName: text(100),
  lastName: text(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Enter a valid email address.').max(254))
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone: optionalText(30),
  jobTitle: optionalText(100),
  isPrimary: z.boolean().default(false),
});
export type ContactInput = z.input<typeof contactInputSchema>;

export const contactSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  isPrimary: z.boolean(),
  portalUser: z.object({ id: z.uuid(), status: z.string() }).nullable(),
});
export type Contact = z.infer<typeof contactSchema>;

export const activityInputSchema = z.strictObject({
  type: activityTypeSchema,
  subject: text(200),
  body: optionalText(5000),
  contactId: z.uuid().optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});
export type ActivityInput = z.input<typeof activityInputSchema>;

export const activitySchema = z.object({
  id: z.uuid(),
  type: activityTypeSchema,
  subject: z.string(),
  body: z.string().nullable(),
  contact: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  author: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  occurredAt: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

export const projectInputSchema = z.strictObject({
  name: text(150),
  code: optionalText(30),
  location: optionalText(150),
  emirate: emirateSchema.optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  location: z.string().nullable(),
  emirate: emirateSchema.nullable(),
  status: projectStatusSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});
export type Project = z.infer<typeof projectSchema>;

// ── Manpower requests ──

const manpowerRequestFields = {
  projectId: z.uuid().optional(),
  roleTitle: text(150),
  category: jobCategorySchema,
  headcount: z.number().int().min(1, 'Headcount must be at least 1.').max(10_000),
  location: text(150),
  emirate: emirateSchema,
  startDate: isoDate,
  durationMonths: z.number().int().min(1).max(120).optional(),
  billRateMinFils: fils.optional(),
  billRateMaxFils: fils.optional(),
  requirements: optionalText(5000),
};

const billRateOrder = (v: { billRateMinFils?: number; billRateMaxFils?: number }) =>
  v.billRateMinFils === undefined ||
  v.billRateMaxFils === undefined ||
  v.billRateMaxFils >= v.billRateMinFils;
const billRateIssue = {
  message: 'Maximum rate must be at least the minimum.',
  path: ['billRateMaxFils'],
};

/** `clientId` is required for internal users; for client users it always comes from the token. */
export const manpowerRequestInputSchema = z
  .strictObject({ clientId: z.uuid().optional(), ...manpowerRequestFields })
  .refine(billRateOrder, billRateIssue);
export type ManpowerRequestInput = z.input<typeof manpowerRequestInputSchema>;

export const manpowerRequestUpdateSchema = z
  .strictObject(manpowerRequestFields)
  .partial()
  .extend({ version: z.number().int().min(1) })
  .refine(billRateOrder, billRateIssue);
export type ManpowerRequestUpdate = z.input<typeof manpowerRequestUpdateSchema>;

export const decisionSchema = z.strictObject({
  version: z.number().int().min(1),
  comment: optionalText(1000),
});
export const rejectionSchema = z.strictObject({
  version: z.number().int().min(1),
  comment: text(1000),
});
export const cancellationSchema = z.strictObject({
  version: z.number().int().min(1),
  reason: text(1000),
});

export const manpowerRequestSchema = z.object({
  id: z.uuid(),
  client: z.object({ id: z.uuid(), name: z.string() }),
  project: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  roleTitle: z.string(),
  category: jobCategorySchema,
  headcount: z.number().int(),
  location: z.string(),
  emirate: emirateSchema,
  startDate: z.string(),
  durationMonths: z.number().int().nullable(),
  billRateMinFils: z.number().int().nullable(),
  billRateMaxFils: z.number().int().nullable(),
  currency: z.string(),
  requirements: z.string().nullable(),
  status: manpowerRequestStatusSchema,
  version: z.number().int(),
  submittedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decidedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  decisionComment: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.string(),
});
export type ManpowerRequest = z.infer<typeof manpowerRequestSchema>;

export const manpowerRequestListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt', 'startDate', 'headcount'], '-createdAt'),
  filter: z
    .strictObject({
      status: manpowerRequestStatusSchema.optional(),
      clientId: z.uuid().optional(),
      category: jobCategorySchema.optional(),
    })
    .optional(),
});
export type ManpowerRequestListQuery = z.infer<typeof manpowerRequestListQuerySchema>;

/** Default for the `manpowerApprovalThreshold` setting (docs/01-PRD.md §6). */
export const DEFAULT_APPROVAL_THRESHOLD = 20;

/** "AED 1,234.50" from integer fils. */
export function formatFils(amount: number | null | undefined, currency = 'AED'): string {
  if (amount === null || amount === undefined) return '—';
  return `${currency} ${(amount / 100).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
