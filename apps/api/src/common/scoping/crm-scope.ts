import type { Prisma } from '../../generated/prisma/client';
import { type Actor, hasRole } from '../auth/actor';

// Data scoping (docs/security.md §4): applied inside every query, so out-of-scope records are
// simply not found (404) — no fetch-then-check, no existence leaks.

const NOTHING = { id: { in: [] as string[] } };

/** Clients the actor may read. */
export function clientReadScope(actor: Actor): Prisma.ClientWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER', 'FINANCE')) return {};
  const or: Prisma.ClientWhereInput[] = [];
  if (hasRole(actor, 'ACCOUNT_MANAGER')) or.push({ accountManagerId: actor.id });
  if (hasRole(actor, 'CLIENT_USER') && actor.clientId) or.push({ id: actor.clientId });
  return or.length ? { OR: or } : NOTHING;
}

/** Clients the actor may change (clients:write — Super Admin and owning Account Manager). */
export function clientWriteScope(actor: Actor): Prisma.ClientWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN')) return {};
  if (hasRole(actor, 'ACCOUNT_MANAGER')) return { accountManagerId: actor.id };
  return NOTHING;
}

/** Clients whose projects the actor may manage (deployments:write). */
export function projectWriteScope(actor: Actor): Prisma.ClientWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER')) return {};
  return clientWriteScope(actor);
}

/** Clients the actor may raise manpower requests for (internal users). */
export function requestClientScope(actor: Actor): Prisma.ClientWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER')) return {};
  return clientWriteScope(actor);
}

/** Manpower requests the actor may read. */
export function manpowerRequestReadScope(actor: Actor): Prisma.ManpowerRequestWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER')) return {};
  const or: Prisma.ManpowerRequestWhereInput[] = [];
  if (hasRole(actor, 'ACCOUNT_MANAGER')) or.push({ client: { accountManagerId: actor.id } });
  if (hasRole(actor, 'CLIENT_USER') && actor.clientId) or.push({ clientId: actor.clientId });
  // Recruiters see the requests behind the jobs they are assigned to.
  if (hasRole(actor, 'RECRUITER'))
    or.push({ jobs: { some: { recruiters: { some: { userId: actor.id } } } } });
  return or.length ? { OR: or } : NOTHING;
}

/** Manpower requests the actor may edit/submit/cancel (manpower-requests:write). */
export function manpowerRequestWriteScope(actor: Actor): Prisma.ManpowerRequestWhereInput {
  if (hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER')) return {};
  const or: Prisma.ManpowerRequestWhereInput[] = [];
  if (hasRole(actor, 'ACCOUNT_MANAGER')) or.push({ client: { accountManagerId: actor.id } });
  if (hasRole(actor, 'CLIENT_USER') && actor.clientId) or.push({ clientId: actor.clientId });
  return or.length ? { OR: or } : NOTHING;
}

/** Internal staff (not the client portal). */
export function isInternal(actor: Actor): boolean {
  return !hasRole(actor, 'CLIENT_USER');
}
