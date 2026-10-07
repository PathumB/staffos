import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, loginResponseSchema } from '@staffos/shared';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { MailService } from '../src/infra/mail/mail.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login, refreshCookie, TEST_PASSWORD } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(60_000);

const ORIGIN = 'http://localhost:5173';

describeWithDb('Auth API', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const sentMail: { to: string; text: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    jest.spyOn(app.get(MailService), 'send').mockImplementation(async (m) => {
      sentMail.push(m);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const tokenFromMail = (to: string) => {
    const mail = [...sentMail].reverse().find((m) => m.to === to);
    return new URL(mail!.text.trim().split('\n').pop()!).searchParams.get('token')!;
  };

  describe('POST /auth/login', () => {
    it('returns an access token, the user, and an httpOnly SameSite=Strict refresh cookie', async () => {
      const user = await createUser(app, { roles: ['RECRUITER'] });

      const res = await http
        .post('/api/v1/auth/login')
        .send({ email: user.email.toUpperCase(), password: TEST_PASSWORD })
        .expect(200);

      const body = loginResponseSchema.parse(res.body);
      expect(body.user).toMatchObject({ id: user.id, roles: ['RECRUITER'] });
      expect(body.user.permissions).toContain('candidates:write');
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
      expect(cookie).toMatch(/sr_rt=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(await prisma.auditLog.count({ where: { action: 'LOGIN', entityId: user.id } })).toBe(
        1,
      );
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      const user = await createUser(app, { roles: ['RECRUITER'] });

      const wrong = await http
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'nope-nope-nope' })
        .expect(401);
      const unknown = await http
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@test.staffos', password: 'x' })
        .expect(401);

      expect(apiErrorSchema.parse(wrong.body).code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it.each(['INVITED', 'DEACTIVATED'] as const)('rejects %s users', async (status) => {
      const user = await createUser(app, { roles: ['RECRUITER'], status });
      await http
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(401);
    });

    it('locks the account after 5 failed attempts, even for the right password', async () => {
      const user = await createUser(app, { roles: ['FINANCE'] });
      for (let i = 0; i < 4; i++) {
        await http
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: 'wrong-password-1' })
          .expect(401);
      }
      const fifth = await http
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'wrong-password-1' })
        .expect(429);
      expect(fifth.body.code).toBe('ACCOUNT_LOCKED');

      const correct = await http
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(429);
      expect(correct.body.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(
        await prisma.auditLog.count({ where: { action: 'ACCOUNT_LOCKED', entityId: user.id } }),
      ).toBe(1);
    });

    it('rejects unknown fields', async () => {
      const res = await http
        .post('/api/v1/auth/login')
        .send({ email: 'a@b.co', password: 'x', role: 'SUPER_ADMIN' })
        .expect(400);
      expect(res.body.details.fields).toHaveProperty('role');
    });

    it('is rate limited per IP (10/min)', async () => {
      process.env.THROTTLE_IN_TESTS = 'true';
      try {
        const statuses: number[] = [];
        for (let i = 0; i < 11; i++) {
          statuses.push(
            (
              await http
                .post('/api/v1/auth/login')
                .send({ email: 'rate@test.staffos', password: 'x' })
            ).status,
          );
        }
        expect(statuses.at(-1)).toBe(429);
      } finally {
        delete process.env.THROTTLE_IN_TESTS;
      }
    });
  });

  describe('access tokens', () => {
    it('GET /auth/me works with a valid token and rejects missing, forged and expired ones', async () => {
      const user = await createUser(app, { roles: ['HR_MANAGER'] });
      const { accessToken } = await login(app, user.email);

      const me = await http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({ id: user.id, roles: ['HR_MANAGER'] });

      expect((await http.get('/api/v1/auth/me').expect(401)).body.code).toBe('UNAUTHENTICATED');
      const forged = new JwtService().sign(
        { roles: ['SUPER_ADMIN'], cid: null, eid: null },
        { secret: 'x'.repeat(40), subject: user.id },
      );
      await http.get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);

      const expired = new JwtService().sign(
        { roles: ['HR_MANAGER'], cid: null, eid: null },
        {
          secret: process.env.JWT_ACCESS_SECRET!,
          subject: user.id,
          expiresIn: -10,
          issuer: 'staffos',
          audience: 'staffos-api',
        },
      );
      const res = await http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token', async () => {
      const user = await createUser(app, { roles: ['RECRUITER'] });
      const { cookie } = await login(app, user.email);

      const res = await http
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(refreshCookie(res.headers)).not.toBe(cookie);
    });

    it('treats an immediate replay as a rotation race (no logout)', async () => {
      const user = await createUser(app, { roles: ['RECRUITER'] });
      const { cookie } = await login(app, user.email);
      const first = await http.post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);

      const replay = await http.post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      expect(replay.body.code).toBe('TOKEN_ROTATED');
      await http
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie(first.headers))
        .expect(200);
    });

    it('detects reuse of an old token and revokes the whole session family', async () => {
      const user = await createUser(app, { roles: ['RECRUITER'] });
      const { cookie } = await login(app, user.email);
      const rotated = refreshCookie(
        (await http.post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200)).headers,
      );
      // Move the revocation outside the race window, as if an attacker replays it later.
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: { not: null } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      const reuse = await http.post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      expect(reuse.body.code).toBe('TOKEN_REUSED');
      await http.post('/api/v1/auth/refresh').set('Cookie', rotated).expect(401);
      // Each replay of a revoked token is logged as a security event.
      expect(
        await prisma.auditLog.count({
          where: { action: 'REFRESH_TOKEN_REUSE', entityId: user.id },
        }),
      ).toBeGreaterThan(0);
    });

    it('rejects a missing cookie and a foreign Origin (CSRF)', async () => {
      await http.post('/api/v1/auth/refresh').expect(401);
      const user = await createUser(app, { roles: ['RECRUITER'] });
      const { cookie } = await login(app, user.email);
      await http
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(403);
    });

    it('stops working after logout', async () => {
      const user = await createUser(app, { roles: ['RECRUITER'] });
      const { cookie } = await login(app, user.email);

      await http.post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);

      await http.post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    });
  });

  describe('password reset', () => {
    it('always answers 202 and only emails existing users', async () => {
      const user = await createUser(app, { roles: ['RECRUITER'] });
      await http
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'ghost@test.staffos' })
        .expect(202);
      await http
        .post('/api/v1/auth/password-reset/request')
        .send({ email: user.email })
        .expect(202);

      expect(sentMail.some((m) => m.to === 'ghost@test.staffos')).toBe(false);
      expect(sentMail.some((m) => m.to === user.email)).toBe(true);
    });

    it('sets a new password once, rejects weak passwords and ends existing sessions', async () => {
      const user = await createUser(app, { roles: ['RECRUITER'] });
      const { cookie } = await login(app, user.email);
      await http
        .post('/api/v1/auth/password-reset/request')
        .send({ email: user.email })
        .expect(202);
      const token = tokenFromMail(user.email);

      const weak = await http
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'password1234' })
        .expect(400);
      expect(weak.body.details.fields).toHaveProperty('newPassword');

      await http
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'Fresh-Desert-Falcon-42' })
        .expect(204);
      await http
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'Fresh-Desert-Falcon-43' })
        .expect(400);
      await http.post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      await login(app, user.email, 'Fresh-Desert-Falcon-42');
    });
  });
});
