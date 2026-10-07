import { describe, expect, it } from 'vitest';
import { createUserSchema, loginSchema } from './auth.js';
import { RoleCode } from './enums.js';
import { PERMISSIONS, permissionsForRoles, ROLE_PERMISSIONS } from './permissions.js';

describe('ROLE_PERMISSIONS', () => {
  it('defines every role and only known permissions', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(Object.values(RoleCode).sort());
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const p of permissions) {
        expect(PERMISSIONS).toContain(p);
      }
    }
  });

  it('keeps sensitive permissions with the right roles (security.md §3)', () => {
    const holders = (p: (typeof PERMISSIONS)[number]) =>
      Object.entries(ROLE_PERMISSIONS)
        .filter(([, perms]) => perms.includes(p))
        .map(([role]) => role)
        .sort();

    expect(holders('users:manage')).toEqual(['SUPER_ADMIN']);
    expect(holders('audit:read')).toEqual(['SUPER_ADMIN']);
    expect(holders('documents:read-identity')).toEqual(['EMPLOYEE', 'HR_MANAGER', 'SUPER_ADMIN']);
    expect(holders('invoices:write')).toEqual(['FINANCE', 'SUPER_ADMIN']);
    expect(holders('candidates:read')).not.toContain('FINANCE');
  });

  it('merges permissions across roles without duplicates', () => {
    const merged = permissionsForRoles(['RECRUITER', 'HIRING_MANAGER']);
    expect(new Set(merged).size).toBe(merged.length);
    expect(merged).toContain('offers:approve');
    expect(merged).toContain('candidates:write');
  });
});

describe('auth schemas', () => {
  it('normalises login email and rejects unknown fields', () => {
    expect(loginSchema.parse({ email: ' Admin@StaffOS.demo ', password: 'x' }).email).toBe(
      'admin@staffos.demo',
    );
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x', admin: true }).success).toBe(
      false,
    );
  });

  it('requires a client exactly for client users, and no mixed roles', () => {
    const base = { email: 'c@client.test', firstName: 'C', lastName: 'U' };
    const clientId = '0199a1b2-0000-7000-8000-000000000001';
    expect(createUserSchema.safeParse({ ...base, roles: ['CLIENT_USER'] }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, roles: ['CLIENT_USER'], clientId }).success).toBe(
      true,
    );
    expect(
      createUserSchema.safeParse({ ...base, roles: ['CLIENT_USER', 'FINANCE'], clientId }).success,
    ).toBe(false);
    expect(createUserSchema.safeParse({ ...base, roles: ['FINANCE'], clientId }).success).toBe(
      false,
    );
  });
});
