import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  automationRuleSchema,
  automationRunSchema,
  type RoleCode,
  webhookDeliverySchema,
  webhookWithSecretSchema,
} from '@staffos/shared';
import request from 'supertest';
import { DomainEventsService } from '../src/infra/events/domain-events.service';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { signBody } from '../src/modules/webhooks/webhook.rules';
import { WebhooksService } from '../src/modules/webhooks/webhooks.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login, tokenFor } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(120_000);

type U = { id: string; token: string };

describeWithDb('Automations and webhooks', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let events: DomainEventsService;
  let http: ReturnType<typeof request>;
  let send: jest.SpyInstance;
  let admin: U, hr: U;
  const realFetch = global.fetch;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    events = app.get(DomainEventsService);
    http = request(app.getHttpServer());
    send = jest.spyOn(app.get(MailService), 'send').mockResolvedValue();
    const make = async (role: RoleCode): Promise<U> => {
      const user = await createUser(app, { roles: [role] });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    [admin, hr] = await Promise.all([make('SUPER_ADMIN'), make('HR_MANAGER')]);
  });

  afterAll(async () => {
    global.fetch = realFetch;
    // Leave nothing active that could react to other test files' events.
    await prisma.automationRule.updateMany({
      where: { createdById: admin.id },
      data: { active: false },
    });
    await prisma.webhook.updateMany({ where: { createdById: admin.id }, data: { active: false } });
    await app.close();
  });

  beforeEach(() => send.mockClear());

  const auth = (u: U | string) => ({
    Authorization: `Bearer ${typeof u === 'string' ? u : u.token}`,
  });

  it('only Super Admins manage workflows, rules, runs and webhooks (403 for other roles)', async () => {
    const roles: RoleCode[] = [
      'HR_MANAGER',
      'RECRUITER',
      'ACCOUNT_MANAGER',
      'FINANCE',
      'CLIENT_USER',
    ];
    for (const role of roles) {
      const token = tokenFor(app, [role]);
      for (const path of ['/workflows', '/automation-rules', '/automation-runs', '/webhooks']) {
        await http.get(`/api/v1${path}`).set(auth(token)).expect(403);
      }
    }
    await http
      .post('/api/v1/webhooks')
      .set(auth(hr))
      .send({ url: 'https://hooks.example.test/x', events: ['EMPLOYEE_HIRED'] })
      .expect(403);
    // The approvals inbox is open to everyone, but `all` needs workflows:manage.
    await http.get('/api/v1/approvals').set(auth(hr)).expect(200);
    await http.get('/api/v1/approvals?assignedTo=all').set(auth(hr)).expect(403);
    await http.get('/api/v1/approvals?assignedTo=all').set(auth(admin)).expect(200);
  });

  describe('rules', () => {
    const marker = () => `Auto ${randomUUID().slice(0, 8)}`;
    const hired = (candidateName: string, extra: Record<string, unknown> = {}) =>
      events.emit('EMPLOYEE_HIRED', {
        employeeId: randomUUID(),
        employeeNumber: 'EMP-T',
        candidateName,
        jobTitle: 'Forklift Operator',
        clientName: 'Test Client',
        startDate: '2027-01-01',
        ...extra,
      });

    it('validates rules: unknown action, bad condition, missing references', async () => {
      const base = { name: 'Bad', event: 'EMPLOYEE_HIRED' };
      await http
        .post('/api/v1/automation-rules')
        .set(auth(admin))
        .send({ ...base, actions: [{ type: 'run_sql', sql: 'DROP TABLE users' }] })
        .expect(400);
      await http
        .post('/api/v1/automation-rules')
        .set(auth(admin))
        .send({
          ...base,
          conditions: [{ field: 'a.b', op: 'like', value: 1 }],
          actions: [{ type: 'notify', to: 'hr', message: 'x' }],
        })
        .expect(400);
      const missing = await http
        .post('/api/v1/automation-rules')
        .set(auth(admin))
        .send({ ...base, actions: [{ type: 'call_webhook', webhookId: randomUUID() }] })
        .expect(422);
      expect(missing.body.code).toBe('INVALID_RULE_REFERENCE');
    });

    it('runs matching active rules as logged background jobs (When / If / Then)', async () => {
      const name = marker();
      const { body } = await http
        .post('/api/v1/automation-rules')
        .set(auth(admin))
        .send({
          name,
          event: 'EMPLOYEE_HIRED',
          conditions: [
            { field: 'candidateName', op: 'eq', value: name },
            { field: 'jobTitle', op: 'in', value: ['Forklift Operator', 'Driver'] },
          ],
          actions: [
            {
              type: 'create_task',
              title: 'Plan deployment for {{candidateName}}',
              assigneeRole: 'ACCOUNT_MANAGER',
              dueInDays: 3,
            },
            { type: 'send_email', template: 'employee_hired', to: 'hr' },
            { type: 'assign_user', userId: hr.id },
          ],
        })
        .expect(201);
      const rule = automationRuleSchema.parse(body);

      await hired(`${name} (other)`); // condition fails → no run
      await hired(name, { jobTitle: 'Chef' }); // second condition fails (AND) → no run
      expect(await prisma.automationRun.count({ where: { ruleId: rule.id } })).toBe(0);

      await hired(name);
      const { body: runs } = await http
        .get(`/api/v1/automation-runs?ruleId=${rule.id}`)
        .set(auth(admin))
        .expect(200);
      expect(runs.meta.total).toBe(1);
      const run = automationRunSchema.parse(runs.data[0]);
      expect(run).toMatchObject({ status: 'SUCCEEDED', attempts: 1, error: null });
      expect(run.payload).toMatchObject({ candidateName: name });
      const task = await prisma.task.findFirstOrThrow({
        where: { title: `Plan deployment for ${name}` },
      });
      expect(task).toMatchObject({ assigneeRole: 'ACCOUNT_MANAGER', assigneeId: hr.id });
      expect(send.mock.calls.some(([m]) => String(m.subject).includes(name))).toBe(true);

      // Inactive rules don't run.
      await http
        .patch(`/api/v1/automation-rules/${rule.id}`)
        .set(auth(admin))
        .send({ active: false })
        .expect(200);
      await hired(name);
      expect(await prisma.automationRun.count({ where: { ruleId: rule.id } })).toBe(1);
    });

    it('logs a failed run with its error, and retry runs it again with the same input', async () => {
      const name = marker();
      const helper = await createUser(app, { roles: ['RECRUITER'] });
      const { body: rule } = await http
        .post('/api/v1/automation-rules')
        .set(auth(admin))
        .send({
          name,
          event: 'EMPLOYEE_HIRED',
          conditions: [{ field: 'candidateName', op: 'eq', value: name }],
          actions: [{ type: 'assign_user', userId: helper.id }],
        })
        .expect(201);
      await prisma.user.update({ where: { id: helper.id }, data: { status: 'DEACTIVATED' } });

      await hired(name);
      const failed = await prisma.automationRun.findFirstOrThrow({ where: { ruleId: rule.id } });
      expect(failed.status).toBe('FAILED');
      expect(failed.error).toMatch(/missing or inactive/);

      await http.post(`/api/v1/automation-runs/${failed.id}/retry`).set(auth(hr)).expect(403);
      await prisma.user.update({ where: { id: helper.id }, data: { status: 'ACTIVE' } });
      const { body: retried } = await http
        .post(`/api/v1/automation-runs/${failed.id}/retry`)
        .set(auth(admin))
        .expect(200);
      expect(retried).toMatchObject({ id: failed.id, status: 'SUCCEEDED', attempts: 2 });
      expect(retried.payload).toEqual(failed.payload);

      const again = await http
        .post(`/api/v1/automation-runs/${failed.id}/retry`)
        .set(auth(admin))
        .expect(409);
      expect(again.body.code).toBe('RUN_NOT_FAILED');
    });

    it('dry-runs a rule with a sample payload without executing anything', async () => {
      const { body: rule } = await http
        .post('/api/v1/automation-rules')
        .set(auth(admin))
        .send({
          name: marker(),
          active: false,
          event: 'MANPOWER_REQUEST_CREATED',
          conditions: [{ field: 'headcount', op: 'gt', value: 20 }],
          actions: [{ type: 'create_task', title: 'Review {{roleTitle}}' }],
        })
        .expect(201);
      const { body: hit } = await http
        .post(`/api/v1/automation-rules/${rule.id}/test`)
        .set(auth(admin))
        .send({ payload: { headcount: 25, roleTitle: 'Welder' } })
        .expect(200);
      expect(hit).toMatchObject({ matched: true, actions: ['Create task: "Review Welder"'] });
      const { body: miss } = await http
        .post(`/api/v1/automation-rules/${rule.id}/test`)
        .set(auth(admin))
        .send({ payload: { headcount: 5 } })
        .expect(200);
      expect(miss).toMatchObject({ matched: false, actions: [] });
      expect(await prisma.task.count({ where: { title: 'Review Welder' } })).toBe(0);

      await http.delete(`/api/v1/automation-rules/${rule.id}`).set(auth(admin)).expect(204);
      await http.get(`/api/v1/automation-rules/${rule.id}`).set(auth(admin)).expect(404);
    });
  });

  describe('webhooks', () => {
    let calls: { url: string; headers: Record<string, string>; body: string }[];
    let status: number;
    beforeEach(() => {
      calls = [];
      status = 200;
      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          headers: init?.headers as Record<string, string>,
          body: String(init?.body),
        });
        return new Response('ok', { status });
      }) as typeof fetch;
    });
    afterEach(() => {
      global.fetch = realFetch;
    });

    const register = async (url = `https://hooks.example.test/${randomUUID()}`) => {
      const { body } = await http
        .post('/api/v1/webhooks')
        .set(auth(admin))
        .send({ url, events: ['EMPLOYEE_HIRED', 'INVOICE_ISSUED'] })
        .expect(201);
      return webhookWithSecretSchema.parse(body);
    };
    /** Deliveries for this endpoint only (other test files emit events too). */
    const mine = (url: string) => calls.filter((c) => c.url === url);

    it('accepts https only and shows the secret once', async () => {
      await http
        .post('/api/v1/webhooks')
        .set(auth(admin))
        .send({ url: 'http://hooks.example.test/x', events: ['EMPLOYEE_HIRED'] })
        .expect(400);
      const hook = await register();
      expect(hook.secret).toMatch(/^whsec_/);
      const { body: list } = await http.get('/api/v1/webhooks').set(auth(admin)).expect(200);
      const listed = list.find((w: { id: string }) => w.id === hook.id);
      expect(listed).toBeDefined();
      expect(listed.secret).toBeUndefined();
      const stored = await prisma.webhook.findUniqueOrThrow({ where: { id: hook.id } });
      expect(stored.secret).not.toContain(hook.secret);
    });

    it('signs each delivery with X-StaffOS-Signature and logs status + response code', async () => {
      const hook = await register();
      const marker = randomUUID();
      await events.emit('EMPLOYEE_HIRED', { employeeId: marker, accountManagerId: randomUUID() });
      const [call] = mine(hook.url);
      expect(call).toBeDefined();
      expect(call!.headers['X-StaffOS-Signature']).toBe(signBody(hook.secret, call!.body));
      expect(call!.headers['X-StaffOS-Event']).toBe('employee.hired');
      const body = JSON.parse(call!.body);
      expect(body).toMatchObject({ event: 'employee.hired', data: { employeeId: marker } });
      expect(body.data.accountManagerId).toBeUndefined(); // internal routing fields stripped

      const { body: log } = await http
        .get(`/api/v1/webhooks/${hook.id}/deliveries`)
        .set(auth(admin))
        .expect(200);
      // Other test files run in parallel and may add deliveries to this endpoint: find ours.
      const ours = await prisma.webhookDelivery.findFirstOrThrow({
        where: { webhookId: hook.id, payload: { path: ['employeeId'], equals: marker } },
      });
      const logged = log.data.find((d: { id: string }) => d.id === ours.id) ?? log.data[0];
      expect(webhookDeliverySchema.parse(logged)).toMatchObject({
        status: 'SUCCEEDED',
        attempts: 1,
        responseStatus: 200,
      });
      // Not subscribed to stage changes: nothing sent.
      await events.emit('APPLICATION_STAGE_CHANGED', { applicationId: marker });
      expect(mine(hook.url)).toHaveLength(1);
    });

    it('retries failures with backoff, gives up after 5 attempts, and can redeliver', async () => {
      const hook = await register();
      const service = app.get(WebhooksService);
      status = 500;
      const invoiceId = randomUUID();
      await events.emit('INVOICE_ISSUED', { invoiceId });
      let delivery = await prisma.webhookDelivery.findFirstOrThrow({
        where: { webhookId: hook.id, payload: { path: ['invoiceId'], equals: invoiceId } },
      });
      expect(delivery).toMatchObject({ status: 'PENDING', attempts: 1, responseStatus: 500 });
      expect(delivery.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 20_000);

      // Not due yet: the sweeper leaves it alone.
      await service.attempt(delivery.id);
      expect(mine(hook.url)).toHaveLength(1);
      for (let i = 2; i <= 5; i++) {
        await service.attempt(delivery.id, new Date(Date.now() + 60 * 60_000));
      }
      delivery = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(delivery).toMatchObject({ status: 'FAILED', attempts: 5, nextAttemptAt: null });
      expect(mine(hook.url)).toHaveLength(5);

      status = 202;
      const { body: copy } = await http
        .post(`/api/v1/webhooks/deliveries/${delivery.id}/redeliver`)
        .set(auth(admin))
        .expect(200);
      expect(copy).toMatchObject({ status: 'SUCCEEDED', attempts: 1, responseStatus: 202 });
      expect(mine(hook.url)).toHaveLength(6);
    });

    it('rotating the secret changes the signature; deleted endpoints receive nothing', async () => {
      const hook = await register();
      const { body: rotated } = await http
        .post(`/api/v1/webhooks/${hook.id}/rotate-secret`)
        .set(auth(admin))
        .expect(200);
      expect(rotated.secret).not.toBe(hook.secret);
      await events.emit('EMPLOYEE_HIRED', { employeeId: randomUUID() });
      const [call] = mine(hook.url);
      expect(call!.headers['X-StaffOS-Signature']).toBe(signBody(rotated.secret, call!.body));

      await http.delete(`/api/v1/webhooks/${hook.id}`).set(auth(admin)).expect(204);
      await events.emit('EMPLOYEE_HIRED', { employeeId: randomUUID() });
      expect(mine(hook.url)).toHaveLength(1);
      await http.get(`/api/v1/webhooks/${hook.id}/deliveries`).set(auth(admin)).expect(404);
    });

    it('a call_webhook action forwards any automation event to an endpoint', async () => {
      const hook = await register();
      const name = `Hook ${randomUUID().slice(0, 8)}`;
      await http
        .post('/api/v1/automation-rules')
        .set(auth(admin))
        .send({
          name,
          event: 'TIMESHEET_SUBMITTED',
          conditions: [{ field: 'employeeName', op: 'eq', value: name }],
          actions: [{ type: 'call_webhook', webhookId: hook.id }],
        })
        .expect(201);
      await events.emit('TIMESHEET_SUBMITTED', { timesheetId: randomUUID(), employeeName: name });
      const [call] = mine(hook.url);
      expect(call!.headers['X-StaffOS-Event']).toBe('timesheet.submitted');
    });
  });
});
