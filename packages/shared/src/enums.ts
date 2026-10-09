/**
 * Domain enums shared by web and api. Values mirror the Prisma enums in prisma/schema.prisma;
 * apps/api/src/common/enums-drift.spec.ts fails if the two ever diverge.
 * Same shape as Prisma's generated enums: a const object plus a union type of its values.
 */

export const RoleCode = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HR_MANAGER: 'HR_MANAGER',
  RECRUITER: 'RECRUITER',
  ACCOUNT_MANAGER: 'ACCOUNT_MANAGER',
  HIRING_MANAGER: 'HIRING_MANAGER',
  FINANCE: 'FINANCE',
  EMPLOYEE: 'EMPLOYEE',
  CLIENT_USER: 'CLIENT_USER',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const UserStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'DEACTIVATED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AuthTokenType = {
  PASSWORD_RESET: 'PASSWORD_RESET',
  INVITATION: 'INVITATION',
} as const;

export type AuthTokenType = (typeof AuthTokenType)[keyof typeof AuthTokenType];

export const Industry = {
  CONSTRUCTION: 'CONSTRUCTION',
  LOGISTICS: 'LOGISTICS',
  FACILITIES: 'FACILITIES',
  HEALTHCARE: 'HEALTHCARE',
  HOSPITALITY: 'HOSPITALITY',
  TECHNOLOGY: 'TECHNOLOGY',
  OTHER: 'OTHER',
} as const;

export type Industry = (typeof Industry)[keyof typeof Industry];

export const Emirate = {
  ABU_DHABI: 'ABU_DHABI',
  DUBAI: 'DUBAI',
  SHARJAH: 'SHARJAH',
  AJMAN: 'AJMAN',
  UMM_AL_QUWAIN: 'UMM_AL_QUWAIN',
  RAS_AL_KHAIMAH: 'RAS_AL_KHAIMAH',
  FUJAIRAH: 'FUJAIRAH',
} as const;

export type Emirate = (typeof Emirate)[keyof typeof Emirate];

export const ClientStatus = {
  PROSPECT: 'PROSPECT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type ClientStatus = (typeof ClientStatus)[keyof typeof ClientStatus];

export const ActivityType = {
  CALL: 'CALL',
  MEETING: 'MEETING',
  EMAIL: 'EMAIL',
  NOTE: 'NOTE',
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const ManpowerRequestStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
} as const;

export type ManpowerRequestStatus =
  (typeof ManpowerRequestStatus)[keyof typeof ManpowerRequestStatus];

export const JobCategory = {
  DRIVER: 'DRIVER',
  CONSTRUCTION: 'CONSTRUCTION',
  ENGINEERING: 'ENGINEERING',
  ELECTRICAL: 'ELECTRICAL',
  HEALTHCARE: 'HEALTHCARE',
  FACILITIES: 'FACILITIES',
  HOSPITALITY: 'HOSPITALITY',
  FINANCE: 'FINANCE',
  IT: 'IT',
  OTHER: 'OTHER',
} as const;

export type JobCategory = (typeof JobCategory)[keyof typeof JobCategory];

export const JobStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  ON_HOLD: 'ON_HOLD',
  CLOSED: 'CLOSED',
  FILLED: 'FILLED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const SkillWeight = {
  MUST: 'MUST',
  NICE: 'NICE',
} as const;

export type SkillWeight = (typeof SkillWeight)[keyof typeof SkillWeight];

export const CandidateSource = {
  CAREERS_PORTAL: 'CAREERS_PORTAL',
  CV_UPLOAD: 'CV_UPLOAD',
  MANUAL: 'MANUAL',
  REFERRAL: 'REFERRAL',
  IMPORT: 'IMPORT',
} as const;

export type CandidateSource = (typeof CandidateSource)[keyof typeof CandidateSource];

export const ApplicationStage = {
  APPLIED: 'APPLIED',
  SCREENING: 'SCREENING',
  SHORTLISTED: 'SHORTLISTED',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  HIRED: 'HIRED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type ApplicationStage = (typeof ApplicationStage)[keyof typeof ApplicationStage];

export const InterviewMode = {
  ONSITE: 'ONSITE',
  VIDEO: 'VIDEO',
  PHONE: 'PHONE',
} as const;

export type InterviewMode = (typeof InterviewMode)[keyof typeof InterviewMode];

export const InterviewStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type InterviewStatus = (typeof InterviewStatus)[keyof typeof InterviewStatus];

export const Recommendation = {
  STRONG_YES: 'STRONG_YES',
  YES: 'YES',
  NO: 'NO',
  STRONG_NO: 'STRONG_NO',
} as const;

export type Recommendation = (typeof Recommendation)[keyof typeof Recommendation];

export const OfferStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const ContractType = {
  PERMANENT: 'PERMANENT',
  FIXED_TERM: 'FIXED_TERM',
  PROJECT: 'PROJECT',
} as const;

export type ContractType = (typeof ContractType)[keyof typeof ContractType];

export const EmployeeStatus = {
  ONBOARDING: 'ONBOARDING',
  ACTIVE: 'ACTIVE',
  ON_LEAVE: 'ON_LEAVE',
  TERMINATED: 'TERMINATED',
} as const;

export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];

export const DocumentType = {
  CV: 'CV',
  PASSPORT: 'PASSPORT',
  VISA: 'VISA',
  EMIRATES_ID: 'EMIRATES_ID',
  LABOUR_CARD: 'LABOUR_CARD',
  MEDICAL: 'MEDICAL',
  CERTIFICATE: 'CERTIFICATE',
  CONTRACT: 'CONTRACT',
  OTHER: 'OTHER',
} as const;

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const OnboardingTaskType = {
  DOCUMENTS: 'DOCUMENTS',
  MEDICAL: 'MEDICAL',
  VISA: 'VISA',
  IT: 'IT',
  INDUCTION: 'INDUCTION',
  OTHER: 'OTHER',
} as const;

export type OnboardingTaskType = (typeof OnboardingTaskType)[keyof typeof OnboardingTaskType];

export const OnboardingPlanStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type OnboardingPlanStatus = (typeof OnboardingPlanStatus)[keyof typeof OnboardingPlanStatus];

export const OnboardingTaskStatus = {
  PENDING: 'PENDING',
  DONE: 'DONE',
  SKIPPED: 'SKIPPED',
} as const;

export type OnboardingTaskStatus = (typeof OnboardingTaskStatus)[keyof typeof OnboardingTaskStatus];

export const ProjectStatus = {
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
} as const;

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const DeploymentStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
} as const;

export type DeploymentStatus = (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

export const TimesheetStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  INVOICED: 'INVOICED',
} as const;

export type TimesheetStatus = (typeof TimesheetStatus)[keyof typeof TimesheetStatus];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PAID: 'PAID',
  VOID: 'VOID',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const WorkflowSubject = {
  MANPOWER_REQUEST: 'MANPOWER_REQUEST',
  OFFER: 'OFFER',
} as const;

export type WorkflowSubject = (typeof WorkflowSubject)[keyof typeof WorkflowSubject];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ApprovalDecisionType = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type ApprovalDecisionType = (typeof ApprovalDecisionType)[keyof typeof ApprovalDecisionType];

export const AutomationEvent = {
  APPLICATION_STAGE_CHANGED: 'APPLICATION_STAGE_CHANGED',
  EMPLOYEE_HIRED: 'EMPLOYEE_HIRED',
  DOCUMENT_EXPIRING: 'DOCUMENT_EXPIRING',
  TIMESHEET_SUBMITTED: 'TIMESHEET_SUBMITTED',
  MANPOWER_REQUEST_CREATED: 'MANPOWER_REQUEST_CREATED',
} as const;

export type AutomationEvent = (typeof AutomationEvent)[keyof typeof AutomationEvent];

export const RunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const TaskStatus = {
  OPEN: 'OPEN',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const AiFeature = {
  CV_PARSE: 'CV_PARSE',
  MATCH: 'MATCH',
  JD_DRAFT: 'JD_DRAFT',
  INTERVIEW_KIT: 'INTERVIEW_KIT',
  INTERVIEW_SUMMARY: 'INTERVIEW_SUMMARY',
  ASK_DATA: 'ASK_DATA',
} as const;

export type AiFeature = (typeof AiFeature)[keyof typeof AiFeature];

export const AiRequestStatus = {
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  INVALID_OUTPUT: 'INVALID_OUTPUT',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
} as const;

export type AiRequestStatus = (typeof AiRequestStatus)[keyof typeof AiRequestStatus];

export const WebhookEvent = {
  APPLICATION_STAGE_CHANGED: 'APPLICATION_STAGE_CHANGED',
  EMPLOYEE_HIRED: 'EMPLOYEE_HIRED',
  INVOICE_ISSUED: 'INVOICE_ISSUED',
  // Not subscribable on an endpoint; sent only by an automation's call_webhook action.
  DOCUMENT_EXPIRING: 'DOCUMENT_EXPIRING',
  TIMESHEET_SUBMITTED: 'TIMESHEET_SUBMITTED',
  MANPOWER_REQUEST_CREATED: 'MANPOWER_REQUEST_CREATED',
} as const;

export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];

export const DeliveryStatus = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const DataRequestType = {
  EXPORT: 'EXPORT',
  DELETE: 'DELETE',
} as const;

export type DataRequestType = (typeof DataRequestType)[keyof typeof DataRequestType];

export const DataRequestStatus = {
  OPEN: 'OPEN',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;

export type DataRequestStatus = (typeof DataRequestStatus)[keyof typeof DataRequestStatus];
