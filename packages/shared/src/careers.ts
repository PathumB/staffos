import { z } from 'zod';
import { emirateSchema, jobCategorySchema } from './crm.js';
import type { ApplicationStage } from './enums.js';
import { pageQuery } from './pagination.js';

// Public careers portal (docs/api-contract.md §2.11). Only public fields ever leave the API.

export const publicJobSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string(),
  emirate: emirateSchema,
  category: jobCategorySchema,
  headcount: z.number().int(),
  salaryMinFils: z.number().int().nullable(),
  salaryMaxFils: z.number().int().nullable(),
  currency: z.string(),
  /** Null unless the job is marked to show the client's name. */
  clientName: z.string().nullable(),
  skills: z.array(z.object({ name: z.string(), required: z.boolean() })),
  publishedAt: z.string().nullable(),
});
export type PublicJob = z.infer<typeof publicJobSchema>;

export const publicJobQuerySchema = z.strictObject({
  ...pageQuery(),
  emirate: emirateSchema.optional(),
  category: jobCategorySchema.optional(),
});
export type PublicJobQuery = z.infer<typeof publicJobQuerySchema>;

/** Text fields of the multipart apply form (the CV comes as `file`). */
export const applySchema = z.strictObject({
  firstName: z.string().trim().min(1, 'Required.').max(100),
  lastName: z.string().trim().min(1, 'Required.').max(100),
  email: z.email('Enter a valid email.').max(254),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number.'),
  coverNote: z
    .string()
    .trim()
    .max(2_000)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  /** Multipart sends strings; the consent box must be ticked (security.md §10). */
  consent: z.literal('true', { error: 'Please confirm you agree to how we use your data.' }),
  turnstileToken: z.string().max(2_048).optional(),
});
export type ApplyInput = z.input<typeof applySchema>;
export type ApplyData = z.output<typeof applySchema>;

export const applyResponseSchema = z.object({ message: z.string(), trackingUrl: z.string() });
export type ApplyResponse = z.infer<typeof applyResponseSchema>;

export const PUBLIC_STATUSES = ['RECEIVED', 'IN_REVIEW', 'INTERVIEW', 'OFFER', 'CLOSED'] as const;
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export const trackingSchema = z.object({
  jobTitle: z.string(),
  appliedAt: z.string(),
  publicStatus: z.enum(PUBLIC_STATUSES),
});
export type Tracking = z.infer<typeof trackingSchema>;

export const dataRequestSchema = z.strictObject({ type: z.enum(['EXPORT', 'DELETE']) });
export type DataRequestInput = z.infer<typeof dataRequestSchema>;

export const PUBLIC_STATUS_LABELS: Record<PublicStatus, string> = {
  RECEIVED: 'Received',
  IN_REVIEW: 'In review',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  CLOSED: 'Closed',
};

/**
 * US-CAREERS-03: what a candidate may see. Internal stages and reasons never leave the API; a
 * closed or filled job closes applications that hadn't reached an offer.
 */
export function publicStatus(stage: ApplicationStage, jobOpen: boolean): PublicStatus {
  switch (stage) {
    case 'APPLIED':
      return jobOpen ? 'RECEIVED' : 'CLOSED';
    case 'SCREENING':
    case 'SHORTLISTED':
      return jobOpen ? 'IN_REVIEW' : 'CLOSED';
    case 'INTERVIEW':
      return jobOpen ? 'INTERVIEW' : 'CLOSED';
    case 'OFFER':
    case 'HIRED':
      return 'OFFER';
    default:
      return 'CLOSED';
  }
}

/** Shown next to the consent checkbox (purpose + retention, security.md §10). */
export const CONSENT_TEXT =
  'I agree that StaffOS may use my details and CV to assess me for this and other suitable roles, and keep them for up to 24 months, after which they are deleted. I can ask for a copy or deletion at any time from my tracking link.';
