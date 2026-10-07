import { ApplicationStage, DocumentType, type RoleCode } from './enums.js';

/** Forward pipeline order (docs/01-PRD.md §6). REJECTED/WITHDRAWN are exits, not steps. */
export const APPLICATION_PIPELINE: readonly ApplicationStage[] = [
  ApplicationStage.APPLIED,
  ApplicationStage.SCREENING,
  ApplicationStage.SHORTLISTED,
  ApplicationStage.INTERVIEW,
  ApplicationStage.OFFER,
  ApplicationStage.HIRED,
];

export const TERMINAL_APPLICATION_STAGES: readonly ApplicationStage[] = [
  ApplicationStage.HIRED,
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
];

/**
 * Stages an application may move to next: one step forward, or an exit (REJECTED/WITHDRAWN)
 * from any non-terminal stage. The API enforces this; the UI uses it to hide illegal moves.
 */
export function allowedNextStages(from: ApplicationStage): ApplicationStage[] {
  if (TERMINAL_APPLICATION_STAGES.includes(from)) {
    return [];
  }
  const next = APPLICATION_PIPELINE[APPLICATION_PIPELINE.indexOf(from) + 1];
  return [...(next ? [next] : []), ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN];
}

/** Identity documents: HR roles and the owning employee only; never sent to an LLM. */
export const IDENTITY_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.PASSPORT,
  DocumentType.VISA,
  DocumentType.EMIRATES_ID,
  DocumentType.LABOUR_CARD,
];

export function isIdentityDocument(type: DocumentType): boolean {
  return IDENTITY_DOCUMENT_TYPES.includes(type);
}

/** Roles that are internal staff (everything except the client portal). */
export const INTERNAL_ROLES: readonly RoleCode[] = [
  'SUPER_ADMIN',
  'HR_MANAGER',
  'RECRUITER',
  'ACCOUNT_MANAGER',
  'HIRING_MANAGER',
  'FINANCE',
  'EMPLOYEE',
];

export const DEFAULT_CURRENCY = 'AED';
