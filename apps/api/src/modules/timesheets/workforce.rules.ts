import { HttpStatus } from '@nestjs/common';
import { type DeploymentStatus, mondayOf, type TimesheetStatus, weekDates } from '@staffos/shared';
import { AppException } from '../../common/errors/app.exception';

const bad = (code: string, message: string) =>
  new AppException(HttpStatus.BAD_REQUEST, code, message);

/** A new deployment is PLANNED until its start date, then ACTIVE. */
export function initialDeploymentStatus(startDate: string, today: string): DeploymentStatus {
  return startDate > today ? 'PLANNED' : 'ACTIVE';
}

/**
 * Nightly status sync: PLANNED → ACTIVE on the start date, ACTIVE → ENDED after the end date.
 * Returns null when nothing changes.
 */
export function deploymentStatusOn(
  d: { status: DeploymentStatus; startDate: string; endDate: string | null },
  today: string,
): DeploymentStatus | null {
  if (d.status === 'PLANNED' && d.startDate <= today) {
    return d.endDate && d.endDate < today ? 'ENDED' : 'ACTIVE';
  }
  if (d.status === 'ACTIVE' && d.endDate && d.endDate < today) return 'ENDED';
  return null;
}

/**
 * US-TS-01: the week starts on a Monday and overlaps the deployment; every entry falls inside
 * both the week and the deployment. (Hours 0–16 are checked by the shared schema.)
 */
export function assertTimesheetDates(
  weekStart: string,
  entries: readonly { date: string }[],
  deployment: { startDate: string; endDate: string | null },
): void {
  if (mondayOf(weekStart) !== weekStart) {
    throw bad('INVALID_WEEK', 'A timesheet week starts on a Monday.');
  }
  const days = weekDates(weekStart);
  const inDeployment = (d: string) =>
    d >= deployment.startDate && (!deployment.endDate || d <= deployment.endDate);
  if (!days.some(inDeployment)) {
    throw bad('WEEK_OUTSIDE_DEPLOYMENT', 'This week is outside the deployment dates.');
  }
  for (const e of entries) {
    if (!days.includes(e.date) || !inDeployment(e.date)) {
      throw bad('INVALID_ENTRY_DATE', `${e.date} is outside this week or the deployment dates.`);
    }
  }
}

type TimesheetAction = 'submit' | 'approve' | 'reject';
const FROM: Record<TimesheetAction, readonly TimesheetStatus[]> = {
  submit: ['DRAFT', 'REJECTED'],
  approve: ['SUBMITTED'],
  reject: ['SUBMITTED'],
};
const TO: Record<TimesheetAction, TimesheetStatus> = {
  submit: 'SUBMITTED',
  approve: 'APPROVED',
  reject: 'REJECTED',
};
const PAST: Record<TimesheetAction, string> = {
  submit: 'submitted',
  approve: 'approved',
  reject: 'rejected',
};

/** DRAFT/REJECTED → SUBMITTED → APPROVED | REJECTED (REJECTED is editable again). */
export function nextTimesheetStatus(
  status: TimesheetStatus,
  action: TimesheetAction,
): TimesheetStatus {
  if (!FROM[action].includes(status)) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'INVALID_TIMESHEET_TRANSITION',
      `A ${status.toLowerCase()} timesheet cannot be ${PAST[action]}.`,
      { status, action },
    );
  }
  return TO[action];
}

export const isEditable = (status: TimesheetStatus) => status === 'DRAFT' || status === 'REJECTED';
