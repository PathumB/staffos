import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  integrationStatusSchema,
  type RoleCode,
  settingsSchema,
  systemHealthSchema,
} from '@staffos/shared';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { ZohoCrmProvider } from '../src/modules/integrations/crm.providers';
import { IntegrationsService } from '../src/modules/integrations/integrations.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login, tokenFor } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(120_000);

describeWithDb('Settings, integrations and system admin', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let admin: string;
  const realFetch = global.fetch;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    const user = await createUser(app, { roles: ['SUPER_ADMIN'] });
    admin = (await login(app, user.email)).accessToken;
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('only Super Admins reach settings, integrations and system pages (403 per role)', async () => {
    const roles: RoleCode[] = [
      'HR_MANAGER',
      'RECRUITER',
      'ACCOUNT_MANAGER',
      'HIRING_MANAGER',
      'FINANCE',
      'EMPLOYEE',
      'CLIENT_USER',
    ];
    for (const role of roles) {
      const t = tokenFor(app, [role]);
      await http.get('/api/v1/settings').set(auth(t)).expect(403);
      await http
        .patch('/api/v1/settings')
        .set(auth(t))
        .send({ manpowerApprovalThreshold: 1 })
        .expect(403);
      await http.get('/api/v1/integrations').set(auth(t)).expect(403);
      await http.get('/api/v1/admin/system').set(auth(t)).expect(403);
      await http.post('/api/v1/admin/demo-reset').set(auth(t)).expect(403);
    }
  });

  it('reads settings with defaults, validates and audits updates', async () => {
    const { body } = await http.get('/api/v1/settings').set(auth(admin)).expect(200);
    const before = settingsSchema.parse(body);
    await http
      .patch('/api/v1/settings')
      .set(auth(admin))
      .send({ manpowerApprovalThreshold: 0 })
      .expect(400);
    await http.patch('/api/v1/settings').set(auth(admin)).send({ unknownKey: 1 }).expect(400);
    // ai.monthlyBudgetUsd: a high value can't affect other test files running in parallel.
    try {
      const { body: after } = await http
        .patch('/api/v1/settings')
        .set(auth(admin))
        .send({ 'ai.monthlyBudgetUsd': 5000 })
        .expect(200);
      expect(after).toMatchObject({
        'ai.monthlyBudgetUsd': 5000,
        manpowerApprovalThreshold: before.manpowerApprovalThreshold,
      });
      expect(
        await prisma.auditLog.count({ where: { entity: 'settings', action: 'UPDATE' } }),
      ).toBeGreaterThan(0);
      // The AI layer reads the saved budget (overriding AI_MONTHLY_BUDGET_USD).
      const { body: usage } = await http.get('/api/v1/ai/usage').set(auth(admin)).expect(200);
      expect(usage.budgetMicroUsd).toBe(5_000_000_000);
    } finally {
      await prisma.setting.deleteMany({ where: { key: 'ai.monthlyBudgetUsd' } });
    }
  });

  it('reports integration status and system health', async () => {
    const { body } = await http.get('/api/v1/integrations').set(auth(admin)).expect(200);
    const list = body.map((i: unknown) => integrationStatusSchema.parse(i));
    expect(list.map((i: { key: string }) => i.key).sort()).toEqual([
      'captcha',
      'llm',
      'mail',
      'storage',
      'zoho',
    ]);
    expect(list.find((i: { key: string }) => i.key === 'llm')).toMatchObject({
      status: 'dev_only',
    }); // mock in tests

    const health = systemHealthSchema.parse(
      (await http.get('/api/v1/admin/system').set(auth(admin)).expect(200)).body,
    );
    expect(health).toMatchObject({ db: 'ok', queue: { mode: 'inline' } });
  });

  it('refuses Zoho sync when not configured and demo reset outside demo mode', async () => {
    const zoho = await http.post('/api/v1/integrations/zoho/sync').set(auth(admin)).expect(422);
    expect(zoho.body.code).toBe('INTEGRATION_NOT_CONFIGURED');
    const reset = await http.post('/api/v1/admin/demo-reset').set(auth(admin)).expect(403);
    expect(reset.body.code).toBe('DEMO_MODE_OFF');
  });

  it('pushes clients and contacts to Zoho and stores their ids (fetch mocked)', async () => {
    const service = app.get(IntegrationsService);
    const am = await createUser(app, { roles: ['ACCOUNT_MANAGER'] });
    const client = await prisma.client.create({
      data: {
        name: `Zoho Co ${randomUUID().slice(0, 6)}`,
        industry: 'TECHNOLOGY',
        city: 'Abu Dhabi',
        emirate: 'ABU_DHABI',
        accountManagerId: am.id,
      },
    });
    await prisma.clientContact.create({
      data: {
        clientId: client.id,
        firstName: 'Mariam',
        lastName: 'Zoho',
        email: `mariam-${randomUUID()}@client.test`,
      },
    });
    let n = 0;
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes('/oauth/v2/token')) {
        return Response.json({ access_token: 'tok', expires_in: 3600 });
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe('Zoho-oauthtoken tok');
      const body = JSON.parse(String(init?.body)) as { data: unknown[] };
      return Response.json({
        data: body.data.map(() => ({
          status: 'success',
          details: { id: `z${++n}-${randomUUID()}` },
        })),
      });
    }) as typeof fetch;
    // Swap in a configured provider; the real one is off without env credentials.
    Object.assign(service, {
      crm: new ZohoCrmProvider({
        clientId: 'c',
        clientSecret: 's',
        refreshToken: 'r',
        accountsUrl: 'https://accounts.test',
        apiUrl: 'https://api.test',
      }),
    });
    const result = await service.syncZoho();
    expect(result.error).toBeNull();
    expect(result.accounts).toBeGreaterThan(0);
    expect(calls.filter((c) => c.endsWith('/crm/v8/Accounts/upsert')).length).toBeGreaterThan(0);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).zohoId).toMatch(
      /^z\d+-/,
    );

    // A Zoho error is recorded, not thrown.
    global.fetch = jest.fn(async () => new Response('nope', { status: 500 })) as typeof fetch;
    Object.assign(service, {
      crm: new ZohoCrmProvider({
        clientId: 'c',
        clientSecret: 's',
        refreshToken: 'r',
        accountsUrl: 'https://accounts.test',
        apiUrl: 'https://api.test',
      }),
    });
    const failed = await service.syncZoho();
    expect(failed.error).toMatch(/Zoho/);
    const stored = await prisma.setting.findUniqueOrThrow({ where: { key: 'zoho.lastSync' } });
    expect(stored.value).toMatchObject({ error: expect.stringMatching(/Zoho/) });
  });
});
