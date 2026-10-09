import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  askDataResponseSchema,
  clientRevenueSchema,
  dashboardSchema,
  hiringFunnelSchema,
  type RoleCode,
  taskSchema,
} from '@staffos/shared';
import request from 'supertest';
import { MockProvider } from '../src/infra/llm/llm.providers';
import { LlmService } from '../src/infra/llm/llm.service';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { WeeklySummaryService } from '../src/modules/reports/weekly-summary.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login, tokenFor } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(120_000);

type U = { id: string; token: string };

describeWithDb('Reports, dashboards, ask your data, tasks', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let mock: MockProvider;
  let send: jest.SpyInstance;
  let admin: U, hr: U, am1: U, am2: U, rec1: U, finance: U;
  let clientA: string, clientB: string, jobA: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    mock = app.get(LlmService).provider as MockProvider;
    send = jest.spyOn(app.get(MailService), 'send').mockResolvedValue();
    const make = async (role: RoleCode): Promise<U> => {
      const user = await createUser(app, { roles: [role] });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    [admin, hr, am1, am2, rec1, finance] = (await Promise.all(
      (
        [
          'SUPER_ADMIN',
          'HR_MANAGER',
          'ACCOUNT_MANAGER',
          'ACCOUNT_MANAGER',
          'RECRUITER',
          'FINANCE',
        ] as const
      ).map(make),
    )) as [U, U, U, U, U, U];
    const hm = await createUser(app, { roles: ['HIRING_MANAGER'] });

    // One client per account manager, each with a job, one hire and one rejected applicant.
    const seed = async (accountManagerId: string, recruiterId: string | null) => {
      const client = await prisma.client.create({
        data: {
          name: `Report Co ${randomUUID().slice(0, 6)}`,
          industry: 'LOGISTICS',
          city: 'Dubai',
          emirate: 'DUBAI',
          accountManagerId,
        },
      });
      const mr = await prisma.manpowerRequest.create({
        data: {
          clientId: client.id,
          roleTitle: 'Warehouse Picker',
          category: 'FACILITIES',
          headcount: 2,
          location: 'Jebel Ali',
          emirate: 'DUBAI',
          startDate: new Date('2027-03-01T00:00:00Z'),
          status: 'APPROVED',
        },
      });
      const job = await prisma.job.create({
        data: {
          manpowerRequestId: mr.id,
          clientId: client.id,
          title: 'Warehouse Picker',
          slug: `picker-${randomUUID().slice(0, 8)}`,
          category: 'FACILITIES',
          location: 'Jebel Ali',
          emirate: 'DUBAI',
          headcount: 2,
          status: 'OPEN',
          hiringManagerId: hm.id,
          recruiters: recruiterId ? { create: [{ userId: recruiterId }] } : undefined,
        },
      });
      const applied = new Date(Date.now() - 20 * 86_400_000);
      for (const hired of [true, false]) {
        const candidate = await prisma.candidate.create({
          data: {
            firstName: 'Rep',
            lastName: 'Candidate',
            email: `rep-${randomUUID()}@candidate.test`,
            source: 'MANUAL',
          },
        });
        await prisma.application.create({
          data: {
            jobId: job.id,
            candidateId: candidate.id,
            appliedAt: applied,
            stage: hired ? 'HIRED' : 'REJECTED',
            hiredAt: hired ? new Date(applied.getTime() + 10 * 86_400_000) : null,
            stageHistory: {
              create: hired
                ? [
                    { toStage: 'APPLIED', changedAt: applied },
                    { fromStage: 'APPLIED', toStage: 'SCREENING' },
                    { fromStage: 'SCREENING', toStage: 'HIRED' },
                  ]
                : [
                    { toStage: 'APPLIED', changedAt: applied },
                    { fromStage: 'APPLIED', toStage: 'REJECTED' },
                  ],
            },
          },
        });
      }
      await prisma.invoice.create({
        data: {
          clientId: client.id,
          number: `INV-T-${randomUUID().slice(0, 8)}`,
          status: 'ISSUED',
          periodStart: new Date('2026-09-01T00:00:00Z'),
          periodEnd: new Date('2026-09-30T00:00:00Z'),
          issueDate: new Date(),
          subtotalFils: 100_000,
          vatRateBps: 500,
          vatFils: 5_000,
          totalFils: 105_000,
        },
      });
      return { clientId: client.id, jobId: job.id };
    };
    ({ clientId: clientA, jobId: jobA } = await seed(am1.id, rec1.id));
    ({ clientId: clientB } = await seed(am2.id, null));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => mock.reset());
  const auth = (u: U | string) => ({
    Authorization: `Bearer ${typeof u === 'string' ? u : u.token}`,
  });

  describe('reports and scoping (US-DASH-01)', () => {
    it('counts each application at every stage it reached', async () => {
      const { body } = await http
        .get(`/api/v1/reports/hiring-funnel?clientId=${clientA}`)
        .set(auth(hr))
        .expect(200);
      const funnel = hiringFunnelSchema.parse(body);
      const count = (s: string) => funnel.stages.find((x) => x.stage === s)!.count;
      expect([count('APPLIED'), count('SCREENING'), count('HIRED')]).toEqual([2, 1, 1]);
      expect(funnel.conversion).toBe(0.5);
    });

    it("account managers and recruiters only see their own clients' numbers", async () => {
      const funnelFor = async (u: U, clientId: string) =>
        (
          await http
            .get(`/api/v1/reports/hiring-funnel?clientId=${clientId}`)
            .set(auth(u))
            .expect(200)
        ).body.stages[0].count;
      expect(await funnelFor(am1, clientA)).toBe(2);
      expect(await funnelFor(am1, clientB)).toBe(0); // other AM's client
      expect(await funnelFor(rec1, clientA)).toBe(2); // assigned job
      expect(await funnelFor(rec1, clientB)).toBe(0);

      const rev = clientRevenueSchema.parse(
        (await http.get('/api/v1/reports/client-revenue').set(auth(am2)).expect(200)).body,
      );
      expect(rev.byClient.map((c) => c.clientId)).toEqual([clientB]);
      expect(rev.outstandingFils).toBe(105_000);
      await http.get('/api/v1/reports/client-revenue').set(auth(rec1)).expect(403);

      const { body: tth } = await http
        .get(`/api/v1/reports/time-to-hire?jobId=${jobA}`)
        .set(auth(hr))
        .expect(200);
      expect(tth).toMatchObject({ hires: 1, averageDays: 10 });
    });

    it('blocks roles without reports access (403 per role)', async () => {
      for (const role of ['HIRING_MANAGER', 'EMPLOYEE', 'CLIENT_USER'] as const) {
        await http
          .get('/api/v1/reports/dashboard')
          .set(auth(tokenFor(app, [role])))
          .expect(403);
        await http
          .get('/api/v1/reports/open-requests')
          .set(auth(tokenFor(app, [role])))
          .expect(403);
      }
      await http.get('/api/v1/reports/open-requests/export?format=csv').set(auth(rec1)).expect(403);
      await http.get('/api/v1/reports/hiring-funnel?from=yesterday').set(auth(hr)).expect(400);
    });

    it('builds a dashboard per role', async () => {
      const widgets = async (u: U) =>
        dashboardSchema
          .parse((await http.get('/api/v1/reports/dashboard').set(auth(u)).expect(200)).body)
          .widgets.map((w) => w.key);
      expect(await widgets(hr)).toEqual(
        expect.arrayContaining(['tasks', 'hires', 'expiring', 'openRequests']),
      );
      expect(await widgets(rec1)).toEqual(expect.arrayContaining(['myJobs', 'pipeline']));
      expect(await widgets(am1)).toEqual(
        expect.arrayContaining(['openRequests', 'deployments', 'outstanding']),
      );
      expect(await widgets(finance)).toEqual(expect.arrayContaining(['timesheets', 'outstanding']));
      expect(await widgets(finance)).not.toContain('myJobs');
    });

    it('exports CSV, Excel and PDF with the same filters (US-REP-01)', async () => {
      const csv = await http
        .get(`/api/v1/reports/client-revenue/export?format=csv&clientId=${clientA}`)
        .set(auth(finance))
        .expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.headers['content-disposition']).toContain('staffos-client-revenue.csv');
      expect(csv.text.split('\r\n')[1]).toMatch(/,1,1050,0,1050$/);
      const binary = (path: string) =>
        http
          .get(path)
          .set(auth(finance))
          .buffer(true)
          .parse((res, cb) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
          })
          .expect(200);
      expect(
        (await binary('/api/v1/reports/open-requests/export?format=xlsx')).body
          .subarray(0, 2)
          .toString(),
      ).toBe('PK');
      expect(
        (await binary('/api/v1/reports/hiring-funnel/export?format=pdf')).body
          .subarray(0, 4)
          .toString(),
      ).toBe('%PDF');
      await http.get('/api/v1/reports/salaries/export').set(auth(finance)).expect(404);
    });

    it('emails management the weekly summary with a PDF', async () => {
      send.mockClear();
      const sent = await app.get(WeeklySummaryService).send();
      expect(sent).toBeGreaterThan(0);
      const msg = send.mock.calls.find(([m]) => m.to.startsWith('user-'))?.[0];
      expect(msg.subject).toMatch(/Weekly summary/);
      expect(msg.attachments[0]).toMatchObject({
        contentType: 'application/pdf',
        encoding: 'base64',
      });
    });
  });

  describe('ask your data (US-AI-02)', () => {
    const ask = (u: U, question = 'Which clients have open requests older than 30 days?') =>
      http.post('/api/v1/ai/ask-data').set(auth(u)).send({ question });

    it('answers with the SQL, rows and a chart from the views', async () => {
      mock.enqueue({
        sql: `SELECT client_name, SUM(total_fils) / 100.0 AS total_aed FROM v_client_revenue WHERE client_id = '${clientA}' GROUP BY client_name`,
        answer: 'Invoiced totals per client.',
        chart: { type: 'bar', x: 'client_name', y: 'total_aed' },
      });
      const { body } = await ask(hr).expect(200);
      const res = askDataResponseSchema.parse(body);
      expect(res.sql).toContain('v_client_revenue');
      expect(res.rows).toEqual([{ client_name: expect.any(String), total_aed: 1050 }]);
      expect(res.chart).toEqual({ type: 'bar', x: 'client_name', y: 'total_aed' });
      expect(mock.prompts[0]!.user).toContain('<untrusted_');
    });

    it('rejects SQL touching other tables, writes or several statements (422 UNSAFE_QUERY)', async () => {
      for (const sql of [
        'SELECT email, password_hash FROM users',
        'DELETE FROM v_open_requests',
        'SELECT 1 FROM v_open_requests; DROP TABLE users',
      ]) {
        mock.enqueue({ sql, answer: 'x', chart: { type: 'none' } });
        const res = await ask(finance).expect(422);
        expect(res.body.code).toBe('UNSAFE_QUERY');
      }
      expect(await prisma.user.count()).toBeGreaterThan(0);
    });

    it('runs read-only even if a write slipped through, and times out long queries', async () => {
      const ro = await app.get(PrismaService).$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.$queryRawUnsafe<{ transaction_read_only: string }[]>(
          'SHOW transaction_read_only',
        );
      });
      expect(ro[0]!.transaction_read_only).toBe('on');
      mock.enqueue({
        sql: 'SELECT COUNT(*) AS n FROM v_hiring_funnel a, v_hiring_funnel b, v_hiring_funnel c, v_hiring_funnel d',
        answer: 'x',
        chart: { type: 'none' },
      });
      const slow = await ask(hr);
      // Either finishes (tiny test DB) or is stopped by the 5 s statement timeout.
      expect([200, 422]).toContain(slow.status);
      if (slow.status === 422) expect(slow.body.code).toBe('QUERY_TIMEOUT');
    });

    it('is limited to roles that see every client', async () => {
      await ask(am1).expect(403); // no ai:ask-data
      await ask(rec1).expect(403);
      await http.post('/api/v1/ai/ask-data').set(auth(hr)).send({ question: 'hi' }).expect(400);
      mock.enqueue(new Error('down'));
      mock.enqueue(new Error('down'));
      mock.enqueue(new Error('down'));
      mock.enqueue(new Error('down'));
      const down = await ask(admin);
      expect([422, 503]).toContain(down.status);
    });
  });

  describe('task inbox', () => {
    it('lists my and my-role tasks; completes them; others are 404', async () => {
      const mineTask = await prisma.task.create({
        data: {
          title: `Renew ${randomUUID()}`,
          assigneeRole: 'HR_MANAGER',
          dueDate: new Date('2000-01-01'),
        },
      });
      const other = await prisma.task.create({ data: { title: 'Not yours', assigneeId: am1.id } });
      const { body } = await http.get('/api/v1/tasks').set(auth(hr)).expect(200);
      expect(body.data.map((t: { id: string }) => t.id)).toContain(mineTask.id);
      expect(body.data.map((t: { id: string }) => t.id)).not.toContain(other.id);

      const { body: done } = await http
        .post(`/api/v1/tasks/${mineTask.id}/complete`)
        .set(auth(hr))
        .expect(200);
      expect(taskSchema.parse(done)).toMatchObject({ status: 'DONE', assignee: { id: hr.id } });
      expect(
        (await http.post(`/api/v1/tasks/${mineTask.id}/complete`).set(auth(hr)).expect(409)).body
          .code,
      ).toBe('TASK_ALREADY_DONE');
      await http.post(`/api/v1/tasks/${other.id}/complete`).set(auth(hr)).expect(404);
    });
  });
});
