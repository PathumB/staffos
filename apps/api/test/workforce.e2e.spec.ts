import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { deploymentSchema, mondayOf, type RoleCode, timesheetSchema } from '@staffos/shared';
import request from 'supertest';
import { todayInDubai } from '../src/common/errors/prisma-errors';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { DeploymentsService } from '../src/modules/deployments/deployments.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(180_000);

type U = { id: string; token: string };
const START = '2026-09-07'; // a Monday in the past
const WEEK = '2026-09-14';

describeWithDb('Deployments and timesheets', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let hr: U, am: U, am2: U, finance: U, clientUser: U, otherClientUser: U;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    const make = async (role: RoleCode, clientId?: string): Promise<U> => {
      const user = await createUser(app, { roles: [role], clientId });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    [hr, am, am2, finance] = (await Promise.all(
      (['HR_MANAGER', 'ACCOUNT_MANAGER', 'ACCOUNT_MANAGER', 'FINANCE'] as const).map((r) =>
        make(r),
      ),
    )) as [U, U, U, U];
    const client = await prisma.client.create({
      data: {
        name: `Workforce Client ${randomUUID().slice(0, 6)}`,
        industry: 'CONSTRUCTION',
        city: 'Dubai',
        emirate: 'DUBAI',
        accountManagerId: am.id,
      },
    });
    const other = await prisma.client.create({
      data: {
        name: `Other Client ${randomUUID().slice(0, 6)}`,
        industry: 'CONSTRUCTION',
        city: 'Dubai',
        emirate: 'DUBAI',
        accountManagerId: am2.id,
      },
    });
    projectId = (
      await prisma.project.create({
        data: { clientId: client.id, name: `Tower ${randomUUID().slice(0, 6)}` },
      })
    ).id;
    clientUser = await make('CLIENT_USER', client.id);
    otherClientUser = await make('CLIENT_USER', other.id);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

  /** An employee (ACTIVE unless onboarding) with an EMPLOYEE login. */
  async function worker(status: 'ACTIVE' | 'ONBOARDING' = 'ACTIVE') {
    const user = await createUser(app, { roles: ['EMPLOYEE'] });
    const employee = await prisma.employee.create({
      data: {
        employeeNumber: `EMP-W${randomUUID().slice(0, 8)}`,
        userId: user.id,
        firstName: 'Ravi',
        lastName: 'Kumar',
        email: `ravi-${randomUUID()}@test.staffos`,
        hireDate: new Date('2026-08-01T00:00:00Z'),
        status,
        ...(status === 'ONBOARDING'
          ? { onboardingPlan: { create: { startDate: new Date('2026-09-01T00:00:00Z') } } }
          : {}),
      },
    });
    return { employee, me: { id: user.id, token: (await login(app, user.email)).accessToken } };
  }
  const deploy = (u: U, employeeId: string, extra: Record<string, unknown> = {}) =>
    http
      .post('/api/v1/deployments')
      .set(auth(u))
      .send({ employeeId, projectId, startDate: START, billRateFils: 4_500, ...extra });

  describe('deployments', () => {
    it('lets the account manager deploy, blocks overlaps and other managers', async () => {
      const { employee } = await worker();
      const res = await deploy(am, employee.id).expect(201);
      expect(deploymentSchema.parse(res.body)).toMatchObject({
        status: 'ACTIVE',
        billRateFils: 4_500,
      });
      expect(
        (await deploy(am, employee.id, { startDate: '2026-12-01' }).expect(409)).body.code,
      ).toBe('DEPLOYMENT_OVERLAP');
      const future = await worker();
      expect(
        (await deploy(am, future.employee.id, { startDate: '2099-01-05' }).expect(201)).body.status,
      ).toBe('PLANNED');
      expect(
        (await deploy(am2, future.employee.id, { startDate: '2099-06-01' }).expect(404)).body.code,
      ).toBe('PROJECT_NOT_FOUND');
    });

    it('needs completed onboarding unless an HR Manager overrides with a reason', async () => {
      const { employee } = await worker('ONBOARDING');
      expect((await deploy(am, employee.id).expect(422)).body.code).toBe('ONBOARDING_INCOMPLETE');
      expect(
        (await deploy(am, employee.id, { overrideReason: 'Client urgent' }).expect(422)).body.code,
      ).toBe('ONBOARDING_INCOMPLETE');
      await deploy(hr, employee.id).expect(422);
      const ok = await deploy(hr, employee.id, {
        overrideReason: 'Visa in final stage; client urgent',
      }).expect(201);
      expect(ok.body.overrideReason).toBe('Visa in final stage; client urgent');
      expect(
        await prisma.auditLog.count({
          where: { action: 'CREATE_WITH_OVERRIDE', entityId: ok.body.id },
        }),
      ).toBe(1);
    });

    it('scopes reads: employees see their own (without rates), clients theirs only', async () => {
      const { employee, me } = await worker();
      const dep = (await deploy(am, employee.id).expect(201)).body;
      const mine = await http.get(`/api/v1/deployments/${dep.id}`).set(auth(me)).expect(200);
      expect(mine.body.billRateFils).toBeNull();
      await http.get(`/api/v1/deployments/${dep.id}`).set(auth(clientUser)).expect(200);
      await http.get(`/api/v1/deployments/${dep.id}`).set(auth(otherClientUser)).expect(404);
      await http.get(`/api/v1/deployments/${dep.id}`).set(auth(am2)).expect(404);
    });

    it('ends, cancels and syncs statuses with the calendar', async () => {
      const a = await worker();
      const active = (await deploy(am, a.employee.id).expect(201)).body;
      const ended = await http
        .post(`/api/v1/deployments/${active.id}/end`)
        .set(auth(am))
        .send({ version: active.version, endDate: '2026-09-30', reason: 'Project phase complete' })
        .expect(200);
      expect(ended.body).toMatchObject({ status: 'ENDED', endReason: 'Project phase complete' });

      const b = await worker();
      const planned = (await deploy(am, b.employee.id, { startDate: '2099-03-01' }).expect(201))
        .body;
      const cancelled = await http
        .post(`/api/v1/deployments/${planned.id}/end`)
        .set(auth(am))
        .send({ version: planned.version, endDate: '2099-02-01', reason: 'Client cancelled' })
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');

      const c = await worker();
      const later = (await deploy(am, c.employee.id, { startDate: '2099-03-02' }).expect(201)).body;
      await app.get(DeploymentsService).syncStatuses('2099-03-02');
      expect((await prisma.deployment.findUniqueOrThrow({ where: { id: later.id } })).status).toBe(
        'ACTIVE',
      );
      expect(todayInDubai()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('timesheets', () => {
    async function deployedWorker() {
      const w = await worker();
      const dep = (await deploy(am, w.employee.id).expect(201)).body;
      return { ...w, dep };
    }
    const day = (n: number) => {
      const d = new Date(`${WEEK}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const createSheet = (u: U, deploymentId: string, entries = [{ date: day(0), minutes: 480 }]) =>
      http.post('/api/v1/timesheets').set(auth(u)).send({ deploymentId, weekStart: WEEK, entries });

    it('validates the week, the days and the hours (400)', async () => {
      const { dep, me } = await deployedWorker();
      expect(
        (
          await http
            .post('/api/v1/timesheets')
            .set(auth(me))
            .send({ deploymentId: dep.id, weekStart: day(1) })
            .expect(400)
        ).body.code,
      ).toBe('INVALID_WEEK');
      expect(
        (await createSheet(me, dep.id, [{ date: day(7), minutes: 60 }]).expect(400)).body.code,
      ).toBe('INVALID_ENTRY_DATE');
      await createSheet(me, dep.id, [{ date: day(0), minutes: 17 * 60 }]).expect(400);
      expect(
        (
          await http
            .post('/api/v1/timesheets')
            .set(auth(me))
            .send({ deploymentId: dep.id, weekStart: mondayOf('2026-08-20') })
            .expect(400)
        ).body.code,
      ).toBe('WEEK_OUTSIDE_DEPLOYMENT');
    });

    it('runs draft → submitted → approved, notifying the client and Finance', async () => {
      const { dep, me, employee } = await deployedWorker();
      const draft = (
        await createSheet(me, dep.id, [
          { date: day(0), minutes: 480 },
          { date: day(1), minutes: 540 },
        ]).expect(201)
      ).body;
      expect(timesheetSchema.parse(draft)).toMatchObject({ status: 'DRAFT', totalMinutes: 1020 });
      expect((await createSheet(me, dep.id).expect(409)).body.code).toBe('TIMESHEET_EXISTS');

      // Clients never see drafts.
      await http.get(`/api/v1/timesheets/${draft.id}`).set(auth(clientUser)).expect(404);

      const submitted = await http
        .post(`/api/v1/timesheets/${draft.id}/submit`)
        .set(auth(me))
        .send({ version: draft.version })
        .expect(200);
      expect(submitted.body.status).toBe('SUBMITTED');
      for (const u of [clientUser, finance]) {
        expect(
          await prisma.notification.count({
            where: { userId: u.id, type: 'timesheet.submitted', link: `/timesheets/${draft.id}` },
          }),
        ).toBe(1);
      }
      await http
        .patch(`/api/v1/timesheets/${draft.id}`)
        .set(auth(me))
        .send({ version: submitted.body.version, entries: [] })
        .expect(409);

      await http
        .post(`/api/v1/timesheets/${draft.id}/approve`)
        .set(auth(me))
        .send({ version: 2 })
        .expect(403);
      await http
        .post(`/api/v1/timesheets/${draft.id}/approve`)
        .set(auth(am))
        .send({ version: 2 })
        .expect(403);
      await http
        .post(`/api/v1/timesheets/${draft.id}/approve`)
        .set(auth(otherClientUser))
        .send({ version: 2 })
        .expect(404);
      const approved = await http
        .post(`/api/v1/timesheets/${draft.id}/approve`)
        .set(auth(clientUser))
        .send({ version: submitted.body.version })
        .expect(200);
      expect(approved.body).toMatchObject({ status: 'APPROVED', decidedBy: { id: clientUser.id } });
      expect(
        (
          await http
            .post(`/api/v1/timesheets/${draft.id}/approve`)
            .set(auth(clientUser))
            .send({ version: approved.body.version })
            .expect(409)
        ).body.code,
      ).toBe('INVALID_TIMESHEET_TRANSITION');
      expect(employee.id).toBe(approved.body.employee.id);
    });

    it('sends a rejected timesheet back with a comment, editable and resubmittable', async () => {
      const { dep, me } = await deployedWorker();
      let sheet = (await createSheet(me, dep.id).expect(201)).body;
      sheet = (
        await http
          .post(`/api/v1/timesheets/${sheet.id}/submit`)
          .set(auth(me))
          .send({ version: sheet.version })
          .expect(200)
      ).body;
      await http
        .post(`/api/v1/timesheets/${sheet.id}/reject`)
        .set(auth(clientUser))
        .send({ version: sheet.version })
        .expect(400);
      sheet = (
        await http
          .post(`/api/v1/timesheets/${sheet.id}/reject`)
          .set(auth(clientUser))
          .send({ version: sheet.version, comment: 'Friday was a public holiday' })
          .expect(200)
      ).body;
      expect(sheet).toMatchObject({
        status: 'REJECTED',
        rejectComment: 'Friday was a public holiday',
      });
      expect(
        await prisma.notification.count({ where: { userId: me.id, type: 'timesheet.rejected' } }),
      ).toBe(1);

      sheet = (
        await http
          .patch(`/api/v1/timesheets/${sheet.id}`)
          .set(auth(me))
          .send({ version: sheet.version, entries: [{ date: day(0), minutes: 420 }] })
          .expect(200)
      ).body;
      expect(sheet.totalMinutes).toBe(420);
      await http
        .post(`/api/v1/timesheets/${sheet.id}/submit`)
        .set(auth(me))
        .send({ version: sheet.version })
        .expect(200);
    });

    it('bulk-approves what the caller may approve and reports the rest', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 2; i += 1) {
        const { dep, me } = await deployedWorker();
        const s = (await createSheet(me, dep.id).expect(201)).body;
        await http
          .post(`/api/v1/timesheets/${s.id}/submit`)
          .set(auth(me))
          .send({ version: s.version })
          .expect(200);
        ids.push(s.id);
      }
      const res = await http
        .post('/api/v1/timesheets/bulk-approve')
        .set(auth(finance))
        .send({ ids: [...ids, randomUUID()] })
        .expect(200);
      expect(res.body).toEqual([
        { id: ids[0], ok: true },
        { id: ids[1], ok: true },
        { id: expect.any(String), ok: false, code: 'TIMESHEET_NOT_FOUND' },
      ]);
    });
  });
});
