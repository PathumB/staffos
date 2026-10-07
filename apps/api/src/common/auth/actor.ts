import type { Permission, RoleCode } from '@staffos/shared';

/** The authenticated caller, built from a verified access token. */
export type Actor = {
  id: string;
  roles: RoleCode[];
  permissions: ReadonlySet<Permission>;
  /** CLIENT_USER only: the client company the user belongs to (never taken from the request). */
  clientId: string | null;
  /** Set when the user is also an employee (own-records scoping). */
  employeeId: string | null;
};

export function hasRole(actor: Actor, ...roles: RoleCode[]): boolean {
  return roles.some((role) => actor.roles.includes(role));
}
