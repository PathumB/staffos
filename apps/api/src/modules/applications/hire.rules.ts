import type { OnboardingTaskType, RoleCode } from '@staffos/shared';

export type TemplateTask = {
  title: string;
  description: string | null;
  type: OnboardingTaskType;
  assigneeRole: RoleCode;
  dueOffsetDays: number;
  required: boolean;
  sortOrder: number;
};

/** EMP-001001: zero-padded so numbers sort as text too. */
export function employeeNumber(n: bigint | number): string {
  return `EMP-${String(n).padStart(6, '0')}`;
}

/** Adds days to a calendar date (DATE columns are UTC midnight). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * US-ONB-01: a plan copies its template's tasks, so later template edits never change existing
 * plans. Due date = start date + offset (negative offsets are pre-start tasks such as visa).
 */
export function planTasksFromTemplate(tasks: readonly TemplateTask[], startDate: Date) {
  return [...tasks]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t, index) => ({
      title: t.title,
      description: t.description,
      type: t.type,
      assigneeRole: t.assigneeRole,
      dueDate: addDays(startDate, t.dueOffsetDays),
      required: t.required,
      sortOrder: index,
    }));
}

/** A job is filled once hires reach its headcount. */
export function isJobFilled(hired: number, headcount: number): boolean {
  return hired >= headcount;
}
