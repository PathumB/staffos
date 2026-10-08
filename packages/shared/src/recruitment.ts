import { z } from 'zod';
import { emirateSchema, jobCategorySchema } from './crm.js';
import { ApplicationStage, CandidateSource, JobStatus, SkillWeight } from './enums.js';
import { pageQuery, sortSchema } from './pagination.js';

// Recruitment (ATS) schemas shared by API and web (docs/api-contract.md §2.6–2.8).

const enumOf = <T extends Record<string, string>>(e: T) =>
  z.enum(Object.values(e) as [T[keyof T], ...T[keyof T][]]);

export const jobStatusSchema = enumOf(JobStatus);
export const applicationStageSchema = enumOf(ApplicationStage);
export const candidateSourceSchema = enumOf(CandidateSource);
export const skillWeightSchema = enumOf(SkillWeight);

const text = (max: number) => z.string().trim().min(1, 'Required.').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));
const fils = z.number().int().min(0).max(1_000_000_000);
const version = z.number().int().min(1);

// ── Jobs ──

export const jobSkillSchema = z.strictObject({
  name: text(60),
  weight: skillWeightSchema,
  minYears: z.number().int().min(0).max(50).optional(),
});
export type JobSkill = z.infer<typeof jobSkillSchema>;

const skillsField = z
  .array(jobSkillSchema)
  .max(30)
  .refine(
    (s) => new Set(s.map((x) => x.name.toLowerCase())).size === s.length,
    'Skills must be unique.',
  );

const jobFields = {
  title: text(150),
  description: optionalText(10_000),
  location: text(150),
  emirate: emirateSchema,
  headcount: z.number().int().min(1).max(10_000),
  salaryMinFils: fils.optional(),
  salaryMaxFils: fils.optional(),
  showClientName: z.boolean(),
  recruiterIds: z.array(z.uuid()).min(1, 'Assign at least one recruiter.').max(10),
  hiringManagerId: z.uuid('Choose a hiring manager.'),
  skills: skillsField,
};

const salaryOrder = (v: { salaryMinFils?: number; salaryMaxFils?: number }) =>
  v.salaryMinFils === undefined ||
  v.salaryMaxFils === undefined ||
  v.salaryMaxFils >= v.salaryMinFils;
const salaryIssue = {
  message: 'Maximum salary must be at least the minimum.',
  path: ['salaryMaxFils'],
};

/** Title/location/headcount default to the request's values when omitted. */
export const jobCreateSchema = z
  .strictObject({
    manpowerRequestId: z.uuid(),
    ...jobFields,
    title: jobFields.title.optional(),
    location: jobFields.location.optional(),
    emirate: jobFields.emirate.optional(),
    headcount: jobFields.headcount.optional(),
    showClientName: jobFields.showClientName.default(false),
    skills: skillsField.default([]),
  })
  .refine(salaryOrder, salaryIssue);
export type JobCreate = z.input<typeof jobCreateSchema>;
export type JobCreateData = z.output<typeof jobCreateSchema>;

export const jobUpdateSchema = z
  .strictObject(jobFields)
  .partial()
  .extend({ version })
  .refine(salaryOrder, salaryIssue);
export type JobUpdate = z.input<typeof jobUpdateSchema>;

export const jobActionSchema = z.strictObject({ version });

const person = z.object({ id: z.uuid(), name: z.string() });

export const jobSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: jobCategorySchema,
  location: z.string(),
  emirate: emirateSchema,
  headcount: z.number().int(),
  salaryMinFils: z.number().int().nullable(),
  salaryMaxFils: z.number().int().nullable(),
  currency: z.string(),
  showClientName: z.boolean(),
  status: jobStatusSchema,
  version: z.number().int(),
  client: z.object({ id: z.uuid(), name: z.string() }),
  manpowerRequestId: z.uuid(),
  hiringManager: person,
  recruiters: z.array(person),
  skills: z.array(
    z.object({
      name: z.string(),
      weight: skillWeightSchema,
      minYears: z.number().int().nullable(),
    }),
  ),
  applicationCount: z.number().int(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Job = z.infer<typeof jobSchema>;

export const jobListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt', 'title', 'publishedAt'], '-createdAt'),
  filter: z
    .strictObject({
      status: jobStatusSchema.optional(),
      clientId: z.uuid().optional(),
      category: jobCategorySchema.optional(),
      recruiterId: z.uuid().optional(),
    })
    .optional(),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;

// ── Candidates ──

export const candidateSkillSchema = z.strictObject({
  name: text(60),
  years: z.number().int().min(0).max(60).optional(),
});

const candidateFields = {
  firstName: text(100),
  lastName: text(100),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.').max(254)),
  phone: optionalText(30),
  location: optionalText(150),
  currentTitle: optionalText(150),
  totalExperienceMonths: z.number().int().min(0).max(720).optional(),
  summary: optionalText(5000),
  /** Optional; never used for matching (docs/security.md §7). */
  nationality: optionalText(60),
  languages: z.array(text(40)).max(15),
  skills: z
    .array(candidateSkillSchema)
    .max(50)
    .refine(
      (s) => new Set(s.map((x) => x.name.toLowerCase())).size === s.length,
      'Skills must be unique.',
    ),
};

export const candidateCreateSchema = z.strictObject({
  ...candidateFields,
  languages: candidateFields.languages.default([]),
  skills: candidateFields.skills.default([]),
  source: candidateSourceSchema.exclude(['CAREERS_PORTAL', 'CV_UPLOAD']).default('MANUAL'),
  /** From POST /ai/cv-parse: attaches the uploaded CV and links the AI suggestion (source becomes CV_UPLOAD). */
  cvToken: z.string().max(4_000).optional(),
});
export type CandidateCreate = z.input<typeof candidateCreateSchema>;
export type CandidateCreateData = z.output<typeof candidateCreateSchema>;

export const candidateUpdateSchema = z.strictObject(candidateFields).partial();
export type CandidateUpdate = z.input<typeof candidateUpdateSchema>;
export type CandidateUpdateData = z.output<typeof candidateUpdateSchema>;

export const candidateSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  /** Masked ("r•••@example.com") for client-portal users. */
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  currentTitle: z.string().nullable(),
  totalExperienceMonths: z.number().int().nullable(),
  summary: z.string().nullable(),
  nationality: z.string().nullable(),
  languages: z.array(z.string()),
  skills: z.array(z.object({ name: z.string(), years: z.number().int().nullable() })),
  source: candidateSourceSchema,
  applicationCount: z.number().int(),
  createdAt: z.string(),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const candidateListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt', 'lastName'], '-createdAt'),
  filter: z.strictObject({ source: candidateSourceSchema.optional() }).optional(),
});
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;

// ── Applications ──

export const applicationCreateSchema = z.strictObject({ candidateId: z.uuid(), jobId: z.uuid() });
export type ApplicationCreate = z.input<typeof applicationCreateSchema>;

export const transitionSchema = z
  .strictObject({
    to: applicationStageSchema.exclude(['APPLIED']),
    version,
    reason: optionalText(1000),
  })
  .refine((v) => !['REJECTED', 'WITHDRAWN'].includes(v.to) || Boolean(v.reason), {
    message: 'A reason is required.',
    path: ['reason'],
  });
export type TransitionInput = z.input<typeof transitionSchema>;

export const stageHistorySchema = z.object({
  fromStage: applicationStageSchema.nullable(),
  toStage: applicationStageSchema,
  reason: z.string().nullable(),
  changedBy: person.nullable(),
  changedAt: z.string(),
});

export const applicationSchema = z.object({
  id: z.uuid(),
  stage: applicationStageSchema,
  version: z.number().int(),
  rejectReason: z.string().nullable(),
  appliedAt: z.string(),
  stageChangedAt: z.string(),
  candidate: z.object({ id: z.uuid(), name: z.string(), currentTitle: z.string().nullable() }),
  job: z.object({
    id: z.uuid(),
    title: z.string(),
    client: z.object({ id: z.uuid(), name: z.string() }),
  }),
  history: z.array(stageHistorySchema).optional(),
});
export type Application = z.infer<typeof applicationSchema>;

export const applicationListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['appliedAt', 'stageChangedAt'], '-appliedAt'),
  filter: z
    .strictObject({
      jobId: z.uuid().optional(),
      candidateId: z.uuid().optional(),
      stage: applicationStageSchema.optional(),
    })
    .optional(),
});
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

export const pipelineSchema = z.object({
  job: z.object({ id: z.uuid(), title: z.string(), status: jobStatusSchema }),
  columns: z.array(
    z.object({
      stage: applicationStageSchema,
      count: z.number().int(),
      applications: z.array(
        z.object({
          id: z.uuid(),
          version: z.number().int(),
          stage: applicationStageSchema,
          candidate: z.object({
            id: z.uuid(),
            name: z.string(),
            currentTitle: z.string().nullable(),
          }),
          daysInStage: z.number().int(),
        }),
      ),
    }),
  ),
});
export type Pipeline = z.infer<typeof pipelineSchema>;

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

/** Stages a hiring manager or client may see (docs/security.md §4). */
export const SHORTLIST_STAGES: readonly ApplicationStage[] = [
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
];
