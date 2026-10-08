import type { Prisma } from '../../generated/prisma/client';
import { type Actor, hasRole } from '../auth/actor';

// HR data scoping (docs/security.md §4), applied inside queries so out-of-scope records are
// simply not found (404).

const NOTHING = { id: { in: [] as string[] } };

export const isHrAdmin = (actor: Actor) => hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER');

/**
 * Employees: HR unscoped; Finance read-only for payroll and billing; account managers see people
 * deployed to, or hired for, their clients; employees see only themselves.
 */
export function employeeReadScope(actor: Actor): Prisma.EmployeeWhereInput {
  if (isHrAdmin(actor) || hasRole(actor, 'FINANCE')) return { deletedAt: null };
  const or: Prisma.EmployeeWhereInput[] = [];
  if (hasRole(actor, 'ACCOUNT_MANAGER')) {
    const mine = { accountManagerId: actor.id };
    or.push(
      { deployments: { some: { client: mine } } },
      { application: { job: { client: mine } } },
    );
  }
  if (hasRole(actor, 'EMPLOYEE') && actor.employeeId) or.push({ id: actor.employeeId });
  return or.length ? { deletedAt: null, OR: or } : NOTHING;
}

/** Writes: HR any record; an employee their own (contact fields only, enforced in the service). */
export function employeeWriteScope(actor: Actor): Prisma.EmployeeWhereInput {
  if (isHrAdmin(actor)) return { deletedAt: null };
  if (hasRole(actor, 'EMPLOYEE') && actor.employeeId) {
    return { deletedAt: null, id: actor.employeeId };
  }
  return NOTHING;
}

/** Pay is visible to HR, Finance and the employee themselves; account managers don't see it. */
export function canSeePay(actor: Actor, employeeId: string): boolean {
  return isHrAdmin(actor) || hasRole(actor, 'FINANCE') || actor.employeeId === employeeId;
}

export function onboardingPlanScope(actor: Actor): Prisma.OnboardingPlanWhereInput {
  return { employee: employeeReadScope(actor) };
}
