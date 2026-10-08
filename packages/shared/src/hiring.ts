import { z } from 'zod';
import { isoDate } from './crm.js';
import {
  ContractType,
  InterviewMode,
  InterviewStatus,
  OfferStatus,
  Recommendation,
} from './enums.js';
import { pageQuery, sortSchema } from './pagination.js';

// Interviews and offers (docs/api-contract.md §2.9–2.10), shared by API and web.

const enumOf = <T extends Record<string, string>>(e: T) =>
  z.enum(Object.values(e) as [T[keyof T], ...T[keyof T][]]);

export const interviewModeSchema = enumOf(InterviewMode);
export const interviewStatusSchema = enumOf(InterviewStatus);
export const recommendationSchema = enumOf(Recommendation);
export const offerStatusSchema = enumOf(OfferStatus);
export const contractTypeSchema = enumOf(ContractType);

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
const uniqueIds = z
  .array(z.uuid())
  .min(1, 'Add at least one interviewer.')
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, 'Interviewers must be unique.');

// ── Interviews ──

const interviewFields = {
  scheduledAt: z.iso.datetime({ offset: true, error: 'Choose a date and time.' }),
  durationMin: z.number().int().min(15).max(480),
  mode: interviewModeSchema,
  location: optionalText(200),
  meetingUrl: z
    .url({ protocol: /^https?$/, error: 'Use an http(s) link.' })
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  interviewerIds: uniqueIds,
};

const onsiteNeedsLocation = (v: { mode?: InterviewMode; location?: string }) =>
  v.mode !== 'ONSITE' || Boolean(v.location);
const locationIssue = { message: 'On-site interviews need a location.', path: ['location'] };

export const interviewCreateSchema = z
  .strictObject({ applicationId: z.uuid(), ...interviewFields })
  .refine(onsiteNeedsLocation, locationIssue);
export type InterviewCreate = z.input<typeof interviewCreateSchema>;
export type InterviewCreateData = z.output<typeof interviewCreateSchema>;

/** Reschedule: send the full schedule again (keeps the ".ics" update simple and complete). */
export const interviewUpdateSchema = z
  .strictObject(interviewFields)
  .refine(onsiteNeedsLocation, locationIssue);
export type InterviewUpdate = z.input<typeof interviewUpdateSchema>;
export type InterviewUpdateData = z.output<typeof interviewUpdateSchema>;

export const interviewCancelSchema = z.strictObject({ reason: text(500) });
export type InterviewCancel = z.input<typeof interviewCancelSchema>;

export const interviewSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  scheduledAt: z.string(),
  durationMin: z.number().int(),
  mode: interviewModeSchema,
  location: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  status: interviewStatusSchema,
  candidate: person,
  job: z.object({ id: z.uuid(), title: z.string() }),
  interviewers: z.array(person.extend({ submitted: z.boolean() })),
  createdAt: z.string(),
});
export type Interview = z.infer<typeof interviewSchema>;

/** People who can sit on a panel (id + name only; recruiters can't list users). */
export const panelOptionSchema = person.extend({ role: z.string() });
export type PanelOption = z.infer<typeof panelOptionSchema>;

export const interviewListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['scheduledAt', 'createdAt'], 'scheduledAt'),
  filter: z
    .strictObject({
      applicationId: z.uuid().optional(),
      interviewerId: z.uuid().optional(),
      status: interviewStatusSchema.optional(),
    })
    .optional(),
});
export type InterviewListQuery = z.infer<typeof interviewListQuerySchema>;

/** Starting rubric for the feedback form; interviewers can rename or add criteria. */
export const DEFAULT_RUBRIC = [
  'Technical skills',
  'Relevant experience',
  'Communication',
  'Safety and compliance awareness',
  'Team fit',
] as const;

export const feedbackInputSchema = z.strictObject({
  scores: z
    .array(z.strictObject({ criterion: text(100), score: z.number().int().min(1).max(5) }))
    .min(1, 'Score at least one criterion.')
    .max(20)
    .refine(
      (s) => new Set(s.map((x) => x.criterion.toLowerCase())).size === s.length,
      'Criteria must be unique.',
    ),
  recommendation: recommendationSchema,
  notes: optionalText(5_000),
});
export type FeedbackInput = z.input<typeof feedbackInputSchema>;
export type FeedbackInputData = z.output<typeof feedbackInputSchema>;

export const feedbackSchema = z.object({
  id: z.uuid(),
  interviewer: person,
  scores: z.array(z.object({ criterion: z.string(), score: z.number().int() })),
  recommendation: recommendationSchema,
  notes: z.string().nullable(),
  submittedAt: z.string(),
  updatedAt: z.string(),
  /** The author may edit until this time (US-INT-03: 24 hours after submitting). */
  editableUntil: z.string(),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const FEEDBACK_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// ── Offers ──

export const offerCreateSchema = z
  .strictObject({
    applicationId: z.uuid(),
    salaryFils: z.number().int().min(1, 'Enter a salary.').max(1_000_000_000),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('AED'),
    startDate: isoDate,
    contractType: contractTypeSchema,
    contractMonths: z.number().int().min(1).max(120).optional(),
    notes: optionalText(2_000),
  })
  .refine((v) => (v.contractType === 'PERMANENT') === (v.contractMonths === undefined), {
    message: 'Fixed-term and project contracts need a length in months; permanent ones do not.',
    path: ['contractMonths'],
  });
export type OfferCreate = z.input<typeof offerCreateSchema>;
export type OfferCreateData = z.output<typeof offerCreateSchema>;

export const offerActionSchema = z.strictObject({ version, reason: optionalText(500) });
export type OfferActionInput = z.input<typeof offerActionSchema>;

export const offerSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  salaryFils: z.number().int(),
  currency: z.string(),
  startDate: z.string(),
  contractType: contractTypeSchema,
  contractMonths: z.number().int().nullable(),
  notes: z.string().nullable(),
  status: offerStatusSchema,
  version: z.number().int(),
  candidate: person,
  job: z.object({ id: z.uuid(), title: z.string() }),
  approvedBy: person.nullable(),
  approvedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  respondedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Offer = z.infer<typeof offerSchema>;

export const offerListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt'], '-createdAt'),
  filter: z
    .strictObject({ applicationId: z.uuid().optional(), status: offerStatusSchema.optional() })
    .optional(),
});
export type OfferListQuery = z.infer<typeof offerListQuerySchema>;

/**
 * Offer lifecycle (api-contract §2.10): PENDING_APPROVAL → APPROVED → SENT → ACCEPTED | DECLINED;
 * REJECTED from PENDING_APPROVAL; WITHDRAWN from any non-terminal state.
 */
export const OFFER_ACTIONS = {
  approve: { from: ['PENDING_APPROVAL'], to: 'APPROVED' },
  reject: { from: ['PENDING_APPROVAL'], to: 'REJECTED' },
  send: { from: ['APPROVED'], to: 'SENT' },
  accept: { from: ['SENT'], to: 'ACCEPTED' },
  decline: { from: ['SENT'], to: 'DECLINED' },
  withdraw: { from: ['PENDING_APPROVAL', 'APPROVED', 'SENT'], to: 'WITHDRAWN' },
} as const satisfies Record<string, { from: readonly OfferStatus[]; to: OfferStatus }>;
export type OfferAction = keyof typeof OFFER_ACTIONS;

/** The status an action leads to, or null when the action isn't allowed from `status`. */
export function nextOfferStatus(status: OfferStatus, action: OfferAction): OfferStatus | null {
  const rule = OFFER_ACTIONS[action];
  return (rule.from as readonly OfferStatus[]).includes(status) ? rule.to : null;
}

/** Statuses that block a second offer on the same application. */
export const ACTIVE_OFFER_STATUSES: readonly OfferStatus[] = [
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'ACCEPTED',
];

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  ONSITE: 'On site',
  VIDEO: 'Video call',
  PHONE: 'Phone',
};
export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  STRONG_YES: 'Strong yes',
  YES: 'Yes',
  NO: 'No',
  STRONG_NO: 'Strong no',
};
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
};
export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  PERMANENT: 'Permanent',
  FIXED_TERM: 'Fixed term',
  PROJECT: 'Project',
};
