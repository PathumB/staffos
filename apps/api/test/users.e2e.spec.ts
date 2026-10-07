import type { NestExpressApplication } from '@nestjs/platform-express';
import { ROLE_PERMISSIONS, type RoleCode, userSchema } from '@staffos/shared';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service';
import { createTestApp } from './utils/create-test-app';
import { ALL_ROLES, createUser, login, tokenFor } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(60_000);

describeWithDb('Users, roles and audit API', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let admin: { id: string; token: string };
  const sentMail: { to: string; text: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    jest.spyOn(app.get(MailService), 'send').mockImplementation(async (m) => {
      sentMail.push(m);
    });
    const user = await createUser(app, { roles: ['SUPER_ADMIN'] });
    admin = { id: user.id, token: (await login(app, user.email)).accessToken };
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const newUser = (overrides: Record<string, unknown> = {}) => ({
    email: `invitee-${Date.now()}-${Math.random().toString(36).slice(2)}@test.staffos`,
    firstName: 'Noor',
    lastName: 'Saleh',
    roles: ['RECRUITER'],
    ...overrides,
  });

  it('creates a user, emails an invitation, and the invitee can activate and log in', async () => {
    const input = newUser();
    const res = await http.post('/api/v1/users').set(auth(admin.token)).send(input).expect(201);
    const user = userSchema.parse(res.body);
    expect(user).toMatchObject({ status: 'INVITED', roles: ['RECRUITER'] });

    const mail = sentMail.find((m) => m.to === input.email)!;
    const token = new URL(mail.text.trim().split('\n').pop()!).searchParams.get('token')!;
    await http
      .post('/api/v1/auth/invitations/accept')
      .send({ token, password: 'Blue-Dhow-Harbour-19' })
      .expect(204);
    await login(app, input.email, 'Blue-Dhow-Harbour-19');

    const audit = await http
      .get(`/api/v1/audit-logs?filter[entityId]=${user.id}&filter[action]=CREATE`)
      .set(auth(admin.token))
      .expect(200);
    expect(audit.body.data).toHaveLength(1);
    expect(audit.body.data[0].actor.id).toBe(admin.id);
  });

  it('rejects duplicate emails (409) and invalid input (400)', async () => {
    const input = newUser();
    await http.post('/api/v1/users').set(auth(admin.token)).send(input).expect(201);
    expect(
      (await http.post('/api/v1/users').set(auth(admin.token)).send(input).expect(409)).body.code,
    ).toBe('USER_EMAIL_EXISTS');

    const bad = await http
      .post('/api/v1/users')
      .set(auth(admin.token))
      .send(newUser({ roles: [], isAdmin: true }))
      .expect(400);
    expect(Object.keys(bad.body.details.fields).sort()).toEqual(['isAdmin', 'roles']);
  });

  it.each(ALL_ROLES.filter((r) => r !== 'SUPER_ADMIN'))(
    'blocks %s from creating users (403)',
    async (role) => {
      const res = await http
        .post('/api/v1/users')
        .set(auth(tokenFor(app, [role])))
        .send(newUser())
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    },
  );

  it.each(ALL_ROLES.filter((r) => !ROLE_PERMISSIONS[r].includes('users:read')))(
    'blocks %s from listing users (403)',
    async (role) => {
      await http
        .get('/api/v1/users')
        .set(auth(tokenFor(app, [role])))
        .expect(403);
    },
  );

  it.each(ALL_ROLES.filter((r) => r !== 'SUPER_ADMIN'))(
    'blocks %s from the audit log (403)',
    async (role) => {
      await http
        .get('/api/v1/audit-logs')
        .set(auth(tokenFor(app, [role])))
        .expect(403);
    },
  );

  it('lets HR read users with pagination, search and filters', async () => {
    const target = await createUser(app, { roles: ['FINANCE'] });
    const hr = tokenFor(app, ['HR_MANAGER']);

    const res = await http
      .get(
        `/api/v1/users?search=${encodeURIComponent(target.email)}&filter[role]=FINANCE&pageSize=5&sort=-createdAt`,
      )
      .set(auth(hr))
      .expect(200);

    expect(res.body.meta).toEqual({ page: 1, pageSize: 5, total: 1 });
    expect(res.body.data[0].id).toBe(target.id);
    await http.get('/api/v1/users?sort=passwordHash').set(auth(hr)).expect(400);
    await http.get('/api/v1/users?filter[role]=GOD').set(auth(hr)).expect(400);
  });

  it('deactivation ends sessions; admins cannot deactivate themselves', async () => {
    const target = await createUser(app, { roles: ['RECRUITER'] });
    const { cookie } = await login(app, target.email);

    await http.post(`/api/v1/users/${target.id}/deactivate`).set(auth(admin.token)).expect(200);
    await http.post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    await http.post(`/api/v1/users/${target.id}/deactivate`).set(auth(admin.token)).expect(409);
    expect(
      (await http.post(`/api/v1/users/${admin.id}/deactivate`).set(auth(admin.token)).expect(422))
        .body.code,
    ).toBe('CANNOT_DEACTIVATE_SELF');
    await http.post(`/api/v1/users/${target.id}/reactivate`).set(auth(admin.token)).expect(200);
  });

  it('updates roles, refuses removing your own Super Admin role, and 404s unknown users', async () => {
    const target = await createUser(app, { roles: ['RECRUITER'] });
    const res = await http
      .patch(`/api/v1/users/${target.id}`)
      .set(auth(admin.token))
      .send({ roles: ['RECRUITER', 'HIRING_MANAGER'] })
      .expect(200);
    expect(res.body.roles).toEqual(['HIRING_MANAGER', 'RECRUITER']);

    await http
      .patch(`/api/v1/users/${admin.id}`)
      .set(auth(admin.token))
      .send({ roles: ['HR_MANAGER'] })
      .expect(422);
    await http
      .get('/api/v1/users/0199a1b2-0000-7000-8000-000000000000')
      .set(auth(admin.token))
      .expect(404);
    await http.get('/api/v1/users/not-a-uuid').set(auth(admin.token)).expect(400);
  });

  it('serves the role matrix exactly as defined in packages/shared (no seed drift)', async () => {
    const res = await http.get('/api/v1/roles').set(auth(admin.token)).expect(200);
    const fromApi = Object.fromEntries(
      res.body.map((r: { code: RoleCode; permissions: string[] }) => [r.code, r.permissions]),
    );
    const expected = Object.fromEntries(ALL_ROLES.map((r) => [r, [...ROLE_PERMISSIONS[r]].sort()]));
    expect(fromApi).toEqual(expected);
  });
});
