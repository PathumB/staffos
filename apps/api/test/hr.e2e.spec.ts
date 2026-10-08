import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  employeeSchema,
  type JobCategory,
  JobCategory as Categories,
  onboardingPlanSchema,
  type RoleCode,
} from '@staffos/shared';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(120_000);

type U = { id: string; token: string };

describeWithDb('HR core, onboarding and notifications', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let send: jest.SpyInstance;
  let hr: U, am: U, am2: U, rec: U, finance: U;
  let clientId: string;
  let jobId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    send = jest.spyOn(app.get(MailService), 'send').mockResolvedValue();
    const make = async (role: RoleCode): Promise<U> => {
      const user = await createUser(app, { roles: [role] });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    [hr, am, am2, rec, finance] = (await Promise.all(
      (['HR_MANAGER', 'ACCOUNT_MANAGER', 'ACCOUNT_MANAGER', 'RECRUITER', 'FINANCE'] as const).map(
        make,
      ),
    )) as [U, U, U, U, U];
    const client = await prisma.client.create({
      data: {
        name: `HR Test ${randomUUID().slice(0, 6)}`,
        industry: 'FACILITIES',
        city: 'Dubai',
        emirate: 'DUBAI',
        accountManagerId: am.id,
      },
    });
    clientId = client.id;
    const mr = await prisma.manpowerRequest.create({
      data: {
        clientId,
        roleTitle: 'Cleaner',
        category: 'FACILITIES',
        headcount: 5,
        location: 'Deira',
        emirate: 'DUBAI',
        startDate: new Date('2027-02-01T00:00:00Z'),
        status: 'APPROVED',
      },
    });
    jobId = (
      await prisma.job.create({
        data: {
          manpowerRequestId: mr.id,
          clientId,
          title: 'Cleaner',
          slug: `cleaner-${randomUUID().slice(0, 8)}`,
          category: 'FACILITIES',
          location: 'Deira',
          emirate: 'DUBAI',
          headcount: 5,
          status: 'OPEN',
          hiringManagerId: hr.id,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => send.mockClear());

  const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

  /**
   * A hired employee (linked to a candidate and application on our client's job) with a plan of
   * three tasks, plus an EMPLOYEE login linked to the record.
   */
  async function hiredEmployee(withLogin = true) {
    const candidate = await prisma.candidate.create({
      data: {
        firstName: 'Aisha',
        lastName: 'Karim',
        email: `aisha-${randomUUID()}@candidate.test`,
        source: 'MANUAL',
      },
    });
    const application = await prisma.application.create({
      data: { jobId, candidateId: candidate.id, stage: 'HIRED' },
    });
    const user = withLogin ? await createUser(app, { roles: ['EMPLOYEE'] }) : null;
    const employee = await prisma.employee.create({
      data: {
        employeeNumber: `EMP-T${randomUUID().slice(0, 8)}`,
        candidateId: candidate.id,
        applicationId: application.id,
        userId: user?.id,
        firstName: 'Aisha',
        lastName: 'Karim',
        email: candidate.email,
        hireDate: new Date('2027-02-01T00:00:00Z'),
        salaryFils: 400_000,
        status: 'ONBOARDING',
      },
    });
    const day = (n: number) => new Date(Date.UTC(2027, 1, 1 + n));
    const plan = await prisma.onboardingPlan.create({
      data: {
        employeeId: employee.id,
        startDate: day(0),
        tasks: {
          create: [
            {
              title: 'Sign contract',
              type: 'DOCUMENTS',
              assigneeRole: 'EMPLOYEE',
              dueDate: day(-7),
              sortOrder: 0,
            },
            {
              title: 'Visa',
              type: 'VISA',
              assigneeRole: 'HR_MANAGER',
              dueDate: day(-5),
              sortOrder: 1,
            },
            {
              title: 'Optional survey',
              type: 'OTHER',
              assigneeRole: 'EMPLOYEE',
              dueDate: day(5),
              required: false,
              sortOrder: 2,
            },
          ],
        },
      },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
    const me: U | null = user
      ? { id: user.id, token: (await login(app, user.email)).accessToken }
      : null;
    return { employee, plan, me };
  }

  describe('employees', () => {
    it('shows HR the record linked to its candidate, application and job', async () => {
      const { employee } = await hiredEmployee(false);
      const res = await http.get(`/api/v1/employees/${employee.id}`).set(auth(hr)).expect(200);
      expect(employeeSchema.parse(res.body)).toMatchObject({
        candidateId: employee.candidateId,
        applicationId: employee.applicationId,
        job: { id: jobId, title: 'Cleaner' },
        salaryFils: 400_000,
        onboarding: { status: 'IN_PROGRESS', done: 0, total: 3 },
      });
    });

    it('lets an employee see and edit only their own contact details', async () => {
      const { employee, me } = await hiredEmployee();
      const other = (await hiredEmployee(false)).employee;
      const list = await http.get('/api/v1/employees').set(auth(me!)).expect(200);
      expect(list.body.data.map((e: { id: string }) => e.id)).toEqual([employee.id]);
      expect(list.body.data[0].salaryFils).toBe(400_000); // own pay is visible
      await http.get(`/api/v1/employees/${other.id}`).set(auth(me!)).expect(404);

      const ok = await http
        .patch(`/api/v1/employees/${employee.id}`)
        .set(auth(me!))
        .send({ version: 1, phone: '+971 50 123 4567' })
        .expect(200);
      expect(ok.body).toMatchObject({ phone: '+971 50 123 4567', version: 2 });
      const blocked = await http
        .patch(`/api/v1/employees/${employee.id}`)
        .set(auth(me!))
        .send({ version: 2, salaryFils: 900_000 })
        .expect(403);
      expect(blocked.body).toMatchObject({
        code: 'EMPLOYEE_FIELDS_RESTRICTED',
        details: { fields: ['salaryFils'] },
      });
    });

    it("scopes account managers to their clients' people and hides pay", async () => {
      const { employee } = await hiredEmployee(false);
      const res = await http.get(`/api/v1/employees/${employee.id}`).set(auth(am)).expect(200);
      expect(res.body.salaryFils).toBeNull();
      await http.get(`/api/v1/employees/${employee.id}`).set(auth(am2)).expect(404);
      expect(
        (await http.get(`/api/v1/employees/${employee.id}`).set(auth(finance)).expect(200)).body
          .salaryFils,
      ).toBe(400_000);
      await http.get('/api/v1/employees').set(auth(rec)).expect(403);
    });

    it('rejects stale edits, and terminating cancels onboarding and closes the login', async () => {
      const { employee, plan } = await hiredEmployee();
      await http
        .patch(`/api/v1/employees/${employee.id}`)
        .set(auth(hr))
        .send({ version: 7, status: 'ACTIVE' })
        .expect(409);
      const res = await http
        .patch(`/api/v1/employees/${employee.id}`)
        .set(auth(hr))
        .send({ version: 1, status: 'TERMINATED' })
        .expect(200);
      expect(res.body.status).toBe('TERMINATED');
      expect(
        (await prisma.onboardingPlan.findUniqueOrThrow({ where: { id: plan.id } })).status,
      ).toBe('CANCELLED');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: employee.userId! } })).status,
      ).toBe('DEACTIVATED');
      const again = await http
        .patch(`/api/v1/employees/${employee.id}`)
        .set(auth(hr))
        .send({ version: 2, phone: '+971 4 000 0000' })
        .expect(409);
      expect(again.body.code).toBe('EMPLOYEE_TERMINATED');
    });

    it('invites an employee to StaffOS once (HR only)', async () => {
      const { employee } = await hiredEmployee(false);
      const { me } = await hiredEmployee();
      await http.post(`/api/v1/employees/${employee.id}/invite`).set(auth(me!)).expect(403);
      const res = await http
        .post(`/api/v1/employees/${employee.id}/invite`)
        .set(auth(hr))
        .expect(200);
      expect(res.body.account).toMatchObject({ status: 'INVITED' });
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: res.body.account.id },
        include: { roles: { include: { role: true } } },
      });
      expect(user.roles.map((r) => r.role.code)).toEqual(['EMPLOYEE']);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: user.email }));
      expect(
        (await http.post(`/api/v1/employees/${employee.id}/invite`).set(auth(hr)).expect(409)).body
          .code,
      ).toBe('EMPLOYEE_HAS_ACCOUNT');
    });

    it('lets only HR maintain departments', async () => {
      const name = `Operations ${randomUUID().slice(0, 6)}`;
      await http.post('/api/v1/departments').set(auth(hr)).send({ name }).expect(201);
      expect(
        (await http.post('/api/v1/departments').set(auth(hr)).send({ name }).expect(409)).body.code,
      ).toBe('DEPARTMENT_EXISTS');
      const { me } = await hiredEmployee();
      await http.post('/api/v1/departments').set(auth(me!)).send({ name: 'Mine' }).expect(403);
      await http.post('/api/v1/departments').set(auth(am)).send({ name: 'Mine' }).expect(403);
      const list = await http.get('/api/v1/departments').set(auth(finance)).expect(200);
      expect(list.body.map((d: { name: string }) => d.name)).toContain(name);
    });
  });

  describe('onboarding', () => {
    it('runs the plan: own tasks only, last required task completes it and activates the employee', async () => {
      const { employee, plan, me } = await hiredEmployee();
      const [contract, visa] = plan.tasks;
      const other = (await hiredEmployee()).me!;

      const view = onboardingPlanSchema.parse(
        (await http.get(`/api/v1/onboarding-plans/${plan.id}`).set(auth(me!)).expect(200)).body,
      );
      expect(view.tasks?.map((t) => t.canComplete)).toEqual([true, false, true]);
      await http.get(`/api/v1/onboarding-plans/${plan.id}`).set(auth(other)).expect(404);

      expect(
        (
          await http
            .post(`/api/v1/onboarding-tasks/${visa!.id}/complete`)
            .set(auth(me!))
            .send({})
            .expect(403)
        ).body.code,
      ).toBe('TASK_NOT_ASSIGNED_TO_YOU');
      await http
        .post(`/api/v1/onboarding-tasks/${contract!.id}/complete`)
        .set(auth(me!))
        .send({ note: 'Signed at the office' })
        .expect(200);
      expect(
        (
          await http
            .post(`/api/v1/onboarding-tasks/${contract!.id}/complete`)
            .set(auth(me!))
            .send({})
            .expect(409)
        ).body.code,
      ).toBe('TASK_ALREADY_DONE');

      // HR finishes the last required task; the optional survey doesn't block completion.
      const done = await http
        .post(`/api/v1/onboarding-tasks/${visa!.id}/complete`)
        .set(auth(hr))
        .send({})
        .expect(200);
      expect(done.body).toMatchObject({ status: 'COMPLETED', progress: { done: 2, total: 3 } });
      expect((await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } })).status).toBe(
        'ACTIVE',
      );
      expect(
        await prisma.notification.count({
          where: { userId: hr.id, type: 'onboarding.completed', link: `/employees/${employee.id}` },
        }),
      ).toBe(1);

      // Reopening is HR's call and puts the plan back in progress.
      await http.post(`/api/v1/onboarding-tasks/${visa!.id}/reopen`).set(auth(me!)).expect(403);
      const reopened = await http
        .post(`/api/v1/onboarding-tasks/${visa!.id}/reopen`)
        .set(auth(hr))
        .expect(200);
      expect(reopened.body.status).toBe('IN_PROGRESS');
    });

    it('lets HR reassign a task, notifying the new assignee', async () => {
      const { plan, me } = await hiredEmployee();
      const visa = plan.tasks[1]!;
      await http
        .patch(`/api/v1/onboarding-tasks/${visa.id}`)
        .set(auth(me!))
        .send({ dueDate: '2027-01-30' })
        .expect(403);
      const res = await http
        .patch(`/api/v1/onboarding-tasks/${visa.id}`)
        .set(auth(hr))
        .send({ assigneeId: rec.id, dueDate: '2027-01-30' })
        .expect(200);
      expect(res.body.tasks[1]).toMatchObject({ assignee: { id: rec.id }, dueDate: '2027-01-30' });
      expect(
        await prisma.notification.count({
          where: { userId: rec.id, type: 'onboarding.task_assigned' },
        }),
      ).toBeGreaterThan(0);
    });

    it('manages templates without touching existing plans', async () => {
      const used = new Set(
        (await prisma.onboardingTemplate.findMany({ select: { category: true } })).map(
          (t) => t.category,
        ),
      );
      const category = (Object.values(Categories) as JobCategory[]).find((c) => !used.has(c));
      if (!category) return; // every category already has a template in this database
      const body = {
        name: `Test ${category}`,
        category,
        tasks: [
          { title: 'Induction', type: 'INDUCTION', assigneeRole: 'HR_MANAGER', dueOffsetDays: 0 },
        ],
      };
      const created = await http
        .post('/api/v1/onboarding-templates')
        .set(auth(hr))
        .send(body)
        .expect(201);
      try {
        expect(
          (await http.post('/api/v1/onboarding-templates').set(auth(hr)).send(body).expect(409))
            .body.code,
        ).toBe('TEMPLATE_CATEGORY_EXISTS');

        const { employee } = await hiredEmployee(false);
        const plan = await prisma.onboardingPlan.findUniqueOrThrow({
          where: { employeeId: employee.id },
        });
        await prisma.onboardingPlan.update({
          where: { id: plan.id },
          data: { templateId: created.body.id },
        });

        const updated = await http
          .patch(`/api/v1/onboarding-templates/${created.body.id}`)
          .set(auth(hr))
          .send({ ...body, tasks: [...body.tasks, { ...body.tasks[0], title: 'PPE' }] })
          .expect(200);
        expect(updated.body.tasks).toHaveLength(2);
        expect(await prisma.onboardingTask.count({ where: { planId: plan.id } })).toBe(3);
        expect(
          (
            await http
              .delete(`/api/v1/onboarding-templates/${created.body.id}`)
              .set(auth(hr))
              .expect(409)
          ).body.code,
        ).toBe('TEMPLATE_IN_USE');
        await prisma.onboardingPlan.update({ where: { id: plan.id }, data: { templateId: null } });
        await http
          .delete(`/api/v1/onboarding-templates/${created.body.id}`)
          .set(auth(hr))
          .expect(204);
      } finally {
        await prisma.onboardingTemplate.deleteMany({ where: { id: created.body.id } });
      }
    });

    it('keeps templates and plans away from roles without onboarding access', async () => {
      const { plan, me } = await hiredEmployee();
      await http.get('/api/v1/onboarding-templates').set(auth(me!)).expect(403);
      await http.get(`/api/v1/onboarding-plans/${plan.id}`).set(auth(rec)).expect(403);
      await http.get(`/api/v1/onboarding-plans/${plan.id}`).set(auth(am)).expect(200);
      await http.get(`/api/v1/onboarding-plans/${plan.id}`).set(auth(am2)).expect(404);
    });
  });

  describe('notifications', () => {
    it('lists, counts and marks your own notifications only', async () => {
      const service = app.get(NotificationsService);
      await service.notify([rec.id], { type: 'test.ping', title: 'Ping one' });
      await service.notify([rec.id], { type: 'test.ping', title: 'Ping two' });
      await service.notify([am2.id], { type: 'test.ping', title: 'Not yours' });

      const count = (await http.get('/api/v1/notifications/unread-count').set(auth(rec))).body
        .count;
      expect(count).toBeGreaterThanOrEqual(2);
      const list = await http.get('/api/v1/notifications?unread=true').set(auth(rec)).expect(200);
      const first = list.body.data[0];
      expect(list.body.data.every((n: { title: string }) => n.title !== 'Not yours')).toBe(true);

      await http.post(`/api/v1/notifications/${first.id}/read`).set(auth(rec)).expect(200);
      expect((await http.get('/api/v1/notifications/unread-count').set(auth(rec))).body.count).toBe(
        count - 1,
      );
      const theirs = await prisma.notification.findFirstOrThrow({ where: { userId: am2.id } });
      await http.post(`/api/v1/notifications/${theirs.id}/read`).set(auth(rec)).expect(404);
      await http.post('/api/v1/notifications/read-all').set(auth(rec)).expect(200);
      expect((await http.get('/api/v1/notifications/unread-count').set(auth(rec))).body.count).toBe(
        0,
      );
    });

    it('emails pending notifications once, after they were committed', async () => {
      const service = app.get(NotificationsService);
      await service.notify([finance.id], {
        type: 'test.mail',
        title: 'Invoice ready',
        link: '/invoices',
      });
      await service.notify([finance.id], { type: 'test.quiet', title: 'No email', email: false });
      await service.sendPendingEmails();
      const toFinance = send.mock.calls
        .map(([m]) => m)
        .filter((m) => m.subject === 'Invoice ready');
      expect(toFinance).toHaveLength(1);
      expect(toFinance[0].text).toContain('/invoices');
      expect(send.mock.calls.some(([m]) => m.subject === 'No email')).toBe(false);

      send.mockClear();
      await service.sendPendingEmails();
      expect(send.mock.calls.some(([m]) => m.subject === 'Invoice ready')).toBe(false);
    });
  });
});
