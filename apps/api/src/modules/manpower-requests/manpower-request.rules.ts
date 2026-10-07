import { HttpStatus } from '@nestjs/common';
import type { ManpowerRequestStatus } from '@staffos/shared';
import { AppException } from '../../common/errors/app.exception';

/**
 * Manpower request state machine (docs/01-PRD.md §6), kept pure so it is unit-tested in isolation.
 *
 *   DRAFT ──submit──► APPROVED            (headcount ≤ threshold)
 *        └─submit──► PENDING_APPROVAL ──approve──► APPROVED
 *                                     └──reject───► REJECTED
 *   SUBMITTED (raised by a client in the portal) ── submit (account manager review) ──► as above
 *   DRAFT / SUBMITTED / PENDING_APPROVAL / APPROVED ──cancel──► CANCELLED
 *   APPROVED ──(jobs filled, jobs module)──► FULFILLED
 */
export type ManpowerRequestAction = 'edit' | 'submit' | 'approve' | 'reject' | 'cancel';

export const ALLOWED_FROM: Record<ManpowerRequestAction, readonly ManpowerRequestStatus[]> = {
  edit: ['DRAFT', 'SUBMITTED'],
  submit: ['DRAFT', 'SUBMITTED'],
  approve: ['PENDING_APPROVAL'],
  reject: ['PENDING_APPROVAL'],
  cancel: ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED'],
};

const PAST_TENSE: Record<ManpowerRequestAction, string> = {
  edit: 'edited',
  submit: 'submitted',
  approve: 'approved',
  reject: 'rejected',
  cancel: 'cancelled',
};

export function assertTransition(
  status: ManpowerRequestStatus,
  action: ManpowerRequestAction,
): void {
  if (!ALLOWED_FROM[action].includes(status)) {
    const label = status.toLowerCase().replace('_', ' ');
    const message = `A ${label} request cannot be ${PAST_TENSE[action]}.`;
    throw new AppException(HttpStatus.CONFLICT, 'INVALID_TRANSITION', message, {
      from: status,
      action,
      allowedFrom: ALLOWED_FROM[action],
    });
  }
}

/** The headcount rule: above the threshold needs HR Manager approval; otherwise auto-approved. */
export function statusAfterSubmit(
  headcount: number,
  threshold: number,
): 'APPROVED' | 'PENDING_APPROVAL' {
  return headcount > threshold ? 'PENDING_APPROVAL' : 'APPROVED';
}
