import { SHORTLIST_STAGES } from '@staffos/shared';
import type { Prisma } from '../../generated/prisma/client';
import { type Actor, hasRole } from '../auth/actor';

// Recruitment data scoping (docs/security.md §4), applied inside queries so out-of-scope
// records are simply not found (404).

const NOTHING = { id: { in: [] as string[] } };
const assignedTo = (actor: Actor): Prisma.JobWhereInput => ({
  recruiters: { some: { userId: actor.id } },
});
const shortlisted = { in: [...SHORTLIST_STAGES] };

export const isRecruitmentAdmin = (actor: Actor) => hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER');

export function jobReadScope(actor: Actor): Prisma.JobWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  const or: Prisma.JobWhereInput[] = [];
  if (hasRole(actor, 'RECRUITER')) or.push(assignedTo(actor));
  if (hasRole(actor, 'HIRING_MANAGER')) or.push({ hiringManagerId: actor.id });
  if (hasRole(actor, 'ACCOUNT_MANAGER')) or.push({ client: { accountManagerId: actor.id } });
  return or.length ? { OR: or } : NOTHING;
}

/** Jobs whose pipeline the actor may change (applications:transition). */
export function jobPipelineWriteScope(actor: Actor): Prisma.JobWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  return hasRole(actor, 'RECRUITER') ? assignedTo(actor) : NOTHING;
}

export function applicationReadScope(actor: Actor): Prisma.ApplicationWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  const or: Prisma.ApplicationWhereInput[] = [];
  if (hasRole(actor, 'RECRUITER')) or.push({ job: assignedTo(actor) });
  // Hiring managers and clients only see candidates once they are shortlisted.
  if (hasRole(actor, 'HIRING_MANAGER'))
    or.push({ job: { hiringManagerId: actor.id }, stage: shortlisted });
  if (hasRole(actor, 'CLIENT_USER') && actor.clientId) {
    or.push({ job: { clientId: actor.clientId }, stage: shortlisted });
  }
  return or.length ? { OR: or } : NOTHING;
}

export function applicationWriteScope(actor: Actor): Prisma.ApplicationWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  return hasRole(actor, 'RECRUITER') ? { job: assignedTo(actor) } : NOTHING;
}

export function candidateReadScope(actor: Actor): Prisma.CandidateWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  const or: Prisma.CandidateWhereInput[] = [];
  if (hasRole(actor, 'RECRUITER')) {
    or.push({ createdById: actor.id }, { applications: { some: { job: assignedTo(actor) } } });
  }
  if (hasRole(actor, 'HIRING_MANAGER')) {
    or.push({ applications: { some: { job: { hiringManagerId: actor.id }, stage: shortlisted } } });
  }
  if (hasRole(actor, 'CLIENT_USER') && actor.clientId) {
    or.push({ applications: { some: { job: { clientId: actor.clientId }, stage: shortlisted } } });
  }
  return or.length ? { OR: or } : NOTHING;
}

export function candidateWriteScope(actor: Actor): Prisma.CandidateWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  if (!hasRole(actor, 'RECRUITER')) return NOTHING;
  return {
    OR: [{ createdById: actor.id }, { applications: { some: { job: assignedTo(actor) } } }],
  };
}

/** Client-portal users see shortlisted CVs without contact details (docs/security.md §3.1). */
export function masksCandidateContact(actor: Actor): boolean {
  return hasRole(actor, 'CLIENT_USER') && !isRecruitmentAdmin(actor);
}

// ── Interviews and offers ──

/**
 * Interviews: admins; recruiters on the job; the job's hiring manager; and anyone on the panel
 * (they need it to give feedback). Client users don't see interviews or feedback.
 */
export function interviewReadScope(actor: Actor): Prisma.InterviewWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  const or: Prisma.InterviewWhereInput[] = [{ interviewers: { some: { userId: actor.id } } }];
  if (hasRole(actor, 'RECRUITER')) or.push({ application: { job: assignedTo(actor) } });
  if (hasRole(actor, 'HIRING_MANAGER'))
    or.push({ application: { job: { hiringManagerId: actor.id } } });
  return { OR: or };
}

/** Scheduling, rescheduling and cancelling: admins and the job's recruiters. */
export function interviewWriteScope(actor: Actor): Prisma.InterviewWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  return hasRole(actor, 'RECRUITER') ? { application: { job: assignedTo(actor) } } : NOTHING;
}

export function offerReadScope(actor: Actor): Prisma.OfferWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  const or: Prisma.OfferWhereInput[] = [];
  if (hasRole(actor, 'RECRUITER')) or.push({ application: { job: assignedTo(actor) } });
  if (hasRole(actor, 'HIRING_MANAGER'))
    or.push({ application: { job: { hiringManagerId: actor.id } } });
  return or.length ? { OR: or } : NOTHING;
}

/** Create, send, record the answer, withdraw: admins and the job's recruiters. */
export function offerWriteScope(actor: Actor): Prisma.OfferWhereInput {
  if (isRecruitmentAdmin(actor)) return {};
  return hasRole(actor, 'RECRUITER') ? { application: { job: assignedTo(actor) } } : NOTHING;
}

/** US-OFFER-01: the job's hiring manager or an HR Manager approves. */
export function canApproveOffer(actor: Actor, hiringManagerId: string): boolean {
  return isRecruitmentAdmin(actor) || actor.id === hiringManagerId;
}
