import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, RoleCode } from '@staffos/shared';
import type { PrismaClient } from '../generated/prisma/client';

const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Users, roles, settings, automation rules, audit log',
  HR_MANAGER: 'Everything in recruitment and HR, approvals, reports',
  RECRUITER: 'Jobs, candidates, pipeline and interviews for assigned jobs',
  ACCOUNT_MANAGER: 'Clients, contacts, manpower requests, deployments, invoices',
  HIRING_MANAGER: 'Review shortlisted candidates, interview feedback, approve offers',
  FINANCE: 'Timesheet approval, invoices, payment status',
  EMPLOYEE: 'Own profile, documents, onboarding tasks, timesheets',
  CLIENT_USER: 'Client portal: requests, shortlisted CVs, timesheet approval',
};

/**
 * Roles and permissions from packages/shared/src/permissions.ts (idempotent).
 * Role ↔ permission links are fully synchronised, so removing a permission in code removes it here.
 */
export async function seedRbac(prisma: PrismaClient): Promise<void> {
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((p) => [
      p.code,
      p.id,
    ]),
  );

  for (const code of Object.values(RoleCode)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_LABELS[code], description: ROLE_DESCRIPTIONS[code] },
      create: { code, name: ROLE_LABELS[code], description: ROLE_DESCRIPTIONS[code] },
    });
    const wanted = ROLE_PERMISSIONS[code]
      .map((p) => permissionIds.get(p))
      .filter((id): id is string => Boolean(id));
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wanted } },
      }),
      prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }
}
