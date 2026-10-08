import { HttpStatus } from '@nestjs/common';
import { FEEDBACK_EDIT_WINDOW_MS, type InterviewStatus } from '@staffos/shared';
import { AppException } from '../../common/errors/app.exception';

/** US-INT-03: feedback is locked once 24 hours have passed since it was first submitted. */
export function feedbackEditableUntil(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + FEEDBACK_EDIT_WINDOW_MS);
}

export function assertFeedbackEditable(submittedAt: Date, now: Date): void {
  if (now > feedbackEditableUntil(submittedAt)) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'FEEDBACK_LOCKED',
      'Feedback can only be changed within 24 hours of submitting it.',
    );
  }
}

export function assertInterviewScheduled(status: InterviewStatus): void {
  if (status !== 'SCHEDULED') {
    throw new AppException(
      HttpStatus.CONFLICT,
      'INTERVIEW_NOT_SCHEDULED',
      `This interview is ${status.toLowerCase()} and can no longer be changed.`,
      { status },
    );
  }
}

/** Interviews are booked ahead; a small grace period allows "starting now". */
export function assertInFuture(scheduledAt: Date, now: Date): void {
  if (scheduledAt.getTime() < now.getTime() - 5 * 60_000) {
    throw new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INTERVIEW_IN_PAST',
      'Choose a time in the future.',
    );
  }
}

/** Calendar SEQUENCE: must grow with every change; seconds since creation always does. */
export function icsSequence(createdAt: Date, changedAt: Date): number {
  return Math.max(0, Math.floor((changedAt.getTime() - createdAt.getTime()) / 1000));
}
