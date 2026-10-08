import type { Prisma } from '../../generated/prisma/client';
import { type Actor, hasRole } from '../auth/actor';

// Deployment and timesheet scoping (docs/security.md §4), applied inside queries (404 outside).

const NOTHING = { id: { in: [] as string[] } };
const hrOrFinance = (a: Actor) => hasRole(a, 'SUPER_ADMIN', 'HR_MANAGER', 'FINANCE');

export function deploymentReadScope(actor: Actor): Prisma.DeploymentWhereInput {
  if (hrOrFinance(actor)) return {};
  const or: Prisma.DeploymentWhereInput[] = [];
  if (hasRole(actor, 'ACCOUNT_MANAGER')) or.push({ client: { accountManagerId: actor.id } });
  if (hasRole(actor, 'CLIENT_USER') && actor.clientId) or.push({ clientId: actor.clientId });
  if (hasRole(actor, 'EMPLOYEE') && actor.employeeId) or.push({ employeeId: actor.employeeId });
  return or.length ? { OR: or } : NOTHING;
}

/** Creating and changing deployments: HR, or the client's account manager. */
export function deploymentWriteScope(actor: Actor): Prisma.DeploymentWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER')) return {};
  return hasRole(actor, 'ACCOUNT_MANAGER') ? { client: { accountManagerId: actor.id } } : NOTHING;
}

/** Projects an actor may deploy people to. */
export function projectWriteScope(actor: Actor): Prisma.ProjectWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER')) return { client: { deletedAt: null } };
  return hasRole(actor, 'ACCOUNT_MANAGER')
    ? { client: { deletedAt: null, accountManagerId: actor.id } }
    : NOTHING;
}

/** Clients never see draft timesheets: only what was submitted to them. */
export function timesheetReadScope(actor: Actor): Prisma.TimesheetWhereInput {
  if (hrOrFinance(actor)) return {};
  const or: Prisma.TimesheetWhereInput[] = [];
  if (hasRole(actor, 'ACCOUNT_MANAGER')) or.push({ client: { accountManagerId: actor.id } });
  if (hasRole(actor, 'CLIENT_USER') && actor.clientId) {
    or.push({ clientId: actor.clientId, status: { not: 'DRAFT' } });
  }
  if (hasRole(actor, 'EMPLOYEE') && actor.employeeId) or.push({ employeeId: actor.employeeId });
  return or.length ? { OR: or } : NOTHING;
}

/** Entering hours: the employee themselves, or HR on their behalf. */
export function timesheetWriteScope(actor: Actor): Prisma.TimesheetWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER')) return {};
  return hasRole(actor, 'EMPLOYEE') && actor.employeeId
    ? { employeeId: actor.employeeId }
    : NOTHING;
}

/** Deployments someone may log hours against (same rule as timesheetWriteScope). */
export function deploymentTimesheetScope(actor: Actor): Prisma.DeploymentWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER')) return {};
  return hasRole(actor, 'EMPLOYEE') && actor.employeeId
    ? { employeeId: actor.employeeId }
    : NOTHING;
}

/** Approving: the client's portal users, or Finance (e.g. for clients without portal access). */
export function timesheetApproveScope(actor: Actor): Prisma.TimesheetWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'FINANCE')) return {};
  return hasRole(actor, 'CLIENT_USER') && actor.clientId ? { clientId: actor.clientId } : NOTHING;
}

/** Bill rates are commercial data: hidden from employees. */
export const canSeeBilling = (actor: Actor) =>
  hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER', 'FINANCE', 'ACCOUNT_MANAGER', 'CLIENT_USER');

/** Invoices: Finance all; account managers their clients'; clients only issued/paid ones. */
export function invoiceReadScope(actor: Actor): Prisma.InvoiceWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'FINANCE')) return {};
  const or: Prisma.InvoiceWhereInput[] = [];
  if (hasRole(actor, 'ACCOUNT_MANAGER')) or.push({ client: { accountManagerId: actor.id } });
  if (hasRole(actor, 'CLIENT_USER') && actor.clientId) {
    or.push({ clientId: actor.clientId, status: { in: ['ISSUED', 'PAID'] } });
  }
  return or.length ? { OR: or } : NOTHING;
}
