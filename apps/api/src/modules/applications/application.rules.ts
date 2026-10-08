import { HttpStatus } from '@nestjs/common';
import { allowedNextStages, type ApplicationStage, type JobStatus } from '@staffos/shared';
import { AppException } from '../../common/errors/app.exception';

/**
 * Pipeline rule (docs/01-PRD.md §6): exactly one stage forward, or REJECTED/WITHDRAWN from any
 * non-terminal stage. Enforced here — the Kanban only mirrors it (US-APP-02).
 */
export function assertStageTransition(from: ApplicationStage, to: ApplicationStage): void {
  const allowed = allowedNextStages(from);
  if (!allowed.includes(to)) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'INVALID_TRANSITION',
      `Cannot move an application from ${from} to ${to}.`,
      { from, to, allowed },
    );
  }
}

export type JobAction = 'publish' | 'hold' | 'close';

const JOB_TRANSITIONS: Record<JobAction, { from: readonly JobStatus[]; to: JobStatus }> = {
  publish: { from: ['DRAFT', 'ON_HOLD'], to: 'OPEN' },
  hold: { from: ['OPEN'], to: 'ON_HOLD' },
  close: { from: ['DRAFT', 'OPEN', 'ON_HOLD'], to: 'CLOSED' },
};

/** Job lifecycle: DRAFT → OPEN ⇄ ON_HOLD → CLOSED (FILLED is set when the last hire lands). */
export function nextJobStatus(from: JobStatus, action: JobAction): JobStatus {
  const rule = JOB_TRANSITIONS[action];
  if (!rule.from.includes(from)) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'INVALID_TRANSITION',
      `Cannot ${action} a job that is ${from.toLowerCase()}.`,
      {
        from,
        action,
        allowedFrom: rule.from,
      },
    );
  }
  return rule.to;
}

export function assertJobEditable(status: JobStatus): void {
  if (status === 'CLOSED' || status === 'FILLED') {
    throw new AppException(
      HttpStatus.CONFLICT,
      'INVALID_TRANSITION',
      'A closed or filled job cannot be edited.',
      { from: status },
    );
  }
}

/** URL-safe slug for the careers portal, unique thanks to a random suffix. */
export function jobSlug(title: string, suffix: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'job'}-${suffix}`;
}

export const daysBetween = (from: Date, to = new Date()) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
