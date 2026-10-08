import { HttpStatus } from '@nestjs/common';
import type { OnboardingTaskStatus, RoleCode } from '@staffos/shared';
import { AppException } from '../../common/errors/app.exception';

export type TaskForRules = {
  status: OnboardingTaskStatus;
  assigneeRole: RoleCode;
  assigneeId: string | null;
  required: boolean;
  dueDate: Date;
};

export type ActorForRules = {
  id: string;
  roles: readonly RoleCode[];
  employeeId: string | null;
};

const isHrAdmin = (a: ActorForRules) =>
  a.roles.includes('SUPER_ADMIN') || a.roles.includes('HR_MANAGER');

/**
 * US-ONB-02: who may complete a task. HR Managers always; otherwise the named assignee, or, for
 * unassigned tasks, the employee themselves (EMPLOYEE tasks) or someone with the task's role.
 */
export function canCompleteTask(
  actor: ActorForRules,
  task: Pick<TaskForRules, 'status' | 'assigneeRole' | 'assigneeId'>,
  planEmployeeId: string,
): boolean {
  if (task.status !== 'PENDING') return false;
  if (isHrAdmin(actor)) return true;
  if (task.assigneeId) return task.assigneeId === actor.id;
  if (task.assigneeRole === 'EMPLOYEE') return actor.employeeId === planEmployeeId;
  return actor.roles.includes(task.assigneeRole);
}

/** A plan is complete when every required task is done (optional tasks don't block it). */
export function isPlanComplete(
  tasks: readonly Pick<TaskForRules, 'status' | 'required'>[],
): boolean {
  return tasks.every((t) => !t.required || t.status === 'DONE' || t.status === 'SKIPPED');
}

export function countOverdue(
  tasks: readonly Pick<TaskForRules, 'status' | 'dueDate'>[],
  today: Date,
): number {
  return tasks.filter((t) => t.status === 'PENDING' && t.dueDate < today).length;
}

export function assertEmployeeEditable(status: string): void {
  if (status === 'TERMINATED') {
    throw new AppException(
      HttpStatus.CONFLICT,
      'EMPLOYEE_TERMINATED',
      'Terminated employee records are read-only.',
    );
  }
}
