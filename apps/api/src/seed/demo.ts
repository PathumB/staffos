import type { RoleCode } from '@staffos/shared';
import * as argon2 from 'argon2';
import type { PrismaClient } from '../generated/prisma/client';
import { ARGON2_OPTIONS } from '../modules/auth/argon2.options';

/** Shared password for every demo account (shown on the README / demo card). Demo data only. */
export const DEMO_PASSWORD = 'StaffOS-Demo-2026!';

// Fictional people and companies only (CLAUDE.md §9).
export const DEMO_USERS: { email: string; firstName: string; lastName: string; role: RoleCode }[] =
  [
    { email: 'admin@staffos.demo', firstName: 'Layla', lastName: 'Haddad', role: 'SUPER_ADMIN' },
    { email: 'hr@staffos.demo', firstName: 'Omar', lastName: 'Farouk', role: 'HR_MANAGER' },
    { email: 'recruiter@staffos.demo', firstName: 'Priya', lastName: 'Nair', role: 'RECRUITER' },
    { email: 'am@staffos.demo', firstName: 'Daniel', lastName: 'Mensah', role: 'ACCOUNT_MANAGER' },
    { email: 'hm@staffos.demo', firstName: 'Fatima', lastName: 'Al Zaabi', role: 'HIRING_MANAGER' },
    { email: 'finance@staffos.demo', firstName: 'Arjun', lastName: 'Mehta', role: 'FINANCE' },
    { email: 'employee@staffos.demo', firstName: 'Joseph', lastName: 'Mwangi', role: 'EMPLOYEE' },
    { email: 'client@staffos.demo', firstName: 'Khalid', lastName: 'Rahman', role: 'CLIENT_USER' },
  ];

const DEMO_CLIENT_TRN = '100000000000001';

/** Demo accounts per role (idempotent). Requires seedRbac first. */
export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, ARGON2_OPTIONS);
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const ids = new Map<RoleCode, string>();

  for (const u of DEMO_USERS.filter((d) => d.role !== 'CLIENT_USER')) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        passwordHash,
        status: 'ACTIVE',
        passwordChangedAt: new Date(),
        roles: { create: [{ roleId: roles.get(u.role)! }] },
      },
    });
    ids.set(u.role, user.id);
  }

  const client = await prisma.client.upsert({
    where: { trn: DEMO_CLIENT_TRN },
    update: {},
    create: {
      name: 'Gulf Build Contracting LLC',
      industry: 'CONSTRUCTION',
      trn: DEMO_CLIENT_TRN,
      city: 'Dubai',
      emirate: 'DUBAI',
      addressLine1: 'Office 1204, Al Quoz Business Tower',
      accountManagerId: ids.get('ACCOUNT_MANAGER')!,
      createdById: ids.get('SUPER_ADMIN')!,
    },
  });

  const clientUser = DEMO_USERS.find((d) => d.role === 'CLIENT_USER')!;
  await prisma.user.upsert({
    where: { email: clientUser.email },
    update: {},
    create: {
      email: clientUser.email,
      firstName: clientUser.firstName,
      lastName: clientUser.lastName,
      passwordHash,
      status: 'ACTIVE',
      passwordChangedAt: new Date(),
      clientId: client.id,
      roles: { create: [{ roleId: roles.get('CLIENT_USER')! }] },
    },
  });

  const employeeUserId = ids.get('EMPLOYEE')!;
  const employeeUser = DEMO_USERS.find((d) => d.role === 'EMPLOYEE')!;
  await prisma.employee.upsert({
    where: { userId: employeeUserId },
    update: {},
    create: {
      employeeNumber: 'EMP-000001',
      userId: employeeUserId,
      firstName: employeeUser.firstName,
      lastName: employeeUser.lastName,
      email: employeeUser.email,
      status: 'ACTIVE',
      hireDate: new Date('2026-01-15'),
      createdById: ids.get('SUPER_ADMIN')!,
    },
  });
}
