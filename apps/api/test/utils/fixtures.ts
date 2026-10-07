import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { RoleCode } from '@staffos/shared';
import * as argon2 from 'argon2';
import request from 'supertest';
import { TokenService } from '../../src/common/auth/token.service';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { ARGON2_OPTIONS } from '../../src/modules/auth/argon2.options';

export const TEST_PASSWORD = 'Correct-Horse-Battery-77';
let passwordHash: Promise<string> | undefined;

/** Creates a real user (unique email) in the test database. */
export async function createUser(
  app: NestExpressApplication,
  options: {
    roles: RoleCode[];
    status?: 'ACTIVE' | 'INVITED' | 'DEACTIVATED';
    clientId?: string;
  } = { roles: [] },
) {
  const prisma = app.get(PrismaService);
  passwordHash ??= argon2.hash(TEST_PASSWORD, ARGON2_OPTIONS);
  const roles = await prisma.role.findMany({ where: { code: { in: options.roles } } });
  return prisma.user.create({
    data: {
      email: `user-${randomUUID()}@test.staffos`,
      firstName: 'Test',
      lastName: 'User',
      status: options.status ?? 'ACTIVE',
      passwordHash: options.status === 'INVITED' ? null : await passwordHash,
      clientId: options.clientId ?? null,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
}

/** Logs in through the API and returns the access token and refresh cookie. */
export async function login(app: NestExpressApplication, email: string, password = TEST_PASSWORD) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return { accessToken: res.body.accessToken as string, cookie: refreshCookie(res.headers) };
}

/** Extracts `sr_rt=…` from Set-Cookie for replaying in a Cookie header. */
export function refreshCookie(headers: Record<string, unknown>): string {
  const setCookie = ([] as string[]).concat(
    (headers['set-cookie'] as string[] | string | undefined) ?? [],
  );
  const cookie = setCookie.find((c) => c.startsWith('sr_rt='));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0]!;
}

/** Signs an access token for any role without a DB user — for pure permission (403) checks. */
export function tokenFor(
  app: NestExpressApplication,
  roles: RoleCode[],
  clientId: string | null = null,
): string {
  return app
    .get(TokenService)
    .signAccessToken({ id: randomUUID(), roles, clientId, employeeId: null });
}

export const ALL_ROLES: RoleCode[] = [
  'SUPER_ADMIN',
  'HR_MANAGER',
  'RECRUITER',
  'ACCOUNT_MANAGER',
  'HIRING_MANAGER',
  'FINANCE',
  'EMPLOYEE',
  'CLIENT_USER',
];
