import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { clientSchema, manpowerRequestSchema, type RoleCode } from '@staffos/shared';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login, tokenFor } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(90_000);

const trn = () =>
  `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0')}`;

describeWithDb('CRM: clients, contacts, activities, projects, manpower requests', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const tokens: Record<'admin' | 'am1' | 'am2' | 'hr' | 'finance', string> = {} as never;
  let am1Id: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    jest.spyOn(app.get(MailService), 'send').mockResolvedValue();
    // A run cut short (e.g. network loss) can leave the test approval chain active; it would
    // change how every request below is approved.
    await prisma.workflowDefinition.updateMany({
      where: { name: { startsWith: 'Two-step ' }, active: true },
      data: { active: false },
    });
    const make = async (role: RoleCode) => {
      const user = await createUser(app, { roles: [role] });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    const [admin, am1, am2, hr, finance] = await Promise.all(
      (['SUPER_ADMIN', 'ACCOUNT_MANAGER', 'ACCOUNT_MANAGER', 'HR_MANAGER', 'FINANCE'] as const).map(
        make,
      ),
    );
    Object.assign(tokens, {
      admin: admin!.token,
      am1: am1!.token,
      am2: am2!.token,
      hr: hr!.token,
      finance: finance!.token,
    });
    am1Id = am1!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const newClient = (token: string, body: Record<string, unknown> = {}) =>
    http
      .post('/api/v1/clients')
      .set(auth(token))
      .send({
        name: `Gulf Build ${randomUUID().slice(0, 6)}`,
        industry: 'CONSTRUCTION',
        city: 'Dubai',
        emirate: 'DUBAI',
        trn: trn(),
        ...body,
      });
  const requestBody = (overrides: Record<string, unknown> = {}) => ({
    roleTitle: 'Heavy Vehicle Driver',
    category: 'DRIVER',
    headcount: 10,
    location: 'Jebel Ali',
    emirate: 'DUBAI',
    startDate: '2027-01-15',
    ...overrides,
  });

  async function clientUserFor(clientId: string): Promise<string> {
    const user = await createUser(app, { roles: ['CLIENT_USER'], clientId });
    return (await login(app, user.email)).accessToken;
  }

  describe('clients', () => {
    it('creates a client owned by the account manager and audits it', async () => {
      const res = await newClient(tokens.am1).expect(201);
      const client = clientSchema.parse(res.body);
      expect(client.accountManager.id).toBe(am1Id);
      expect(client).toMatchObject({
        vatRateBps: 500,
        paymentTermsDays: 30,
        status: 'ACTIVE',
        openRequests: 0,
      });
      expect(
        await prisma.auditLog.count({
          where: { entity: 'client', entityId: client.id, action: 'CREATE' },
        }),
      ).toBe(1);
    });

    it('rejects a duplicate TRN with 409', async () => {
      const shared = trn();
      await newClient(tokens.am1, { trn: shared }).expect(201);
      expect((await newClient(tokens.am1, { trn: shared }).expect(409)).body.code).toBe(
        'CLIENT_TRN_EXISTS',
      );
    });

    it("hides another account manager's client (404, not in lists) but HR and Finance can read it", async () => {
      const { body: client } = await newClient(tokens.am1).expect(201);

      await http.get(`/api/v1/clients/${client.id}`).set(auth(tokens.am2)).expect(404);
      await http
        .patch(`/api/v1/clients/${client.id}`)
        .set(auth(tokens.am2))
        .send({ city: 'Sharjah' })
        .expect(404);
      const list = await http
        .get(`/api/v1/clients?search=${encodeURIComponent(client.name)}`)
        .set(auth(tokens.am2))
        .expect(200);
      expect(list.body.data).toHaveLength(0);

      await http.get(`/api/v1/clients/${client.id}`).set(auth(tokens.hr)).expect(200);
      await http.get(`/api/v1/clients/${client.id}`).set(auth(tokens.finance)).expect(200);
    });

    it.each([
      'HR_MANAGER',
      'RECRUITER',
      'HIRING_MANAGER',
      'FINANCE',
      'EMPLOYEE',
      'CLIENT_USER',
    ] as const)('blocks %s from creating clients (403)', async (role) => {
      await newClient(tokenFor(app, [role])).expect(403);
    });

    it('only lets a Super Admin assign another account manager', async () => {
      const other = await prisma.user.findFirstOrThrow({
        where: { id: { not: am1Id }, roles: { some: { role: { code: 'ACCOUNT_MANAGER' } } } },
      });
      await newClient(tokens.am1, { accountManagerId: other.id }).expect(403);
      const res = await newClient(tokens.admin, { accountManagerId: am1Id }).expect(201);
      expect(res.body.accountManager.id).toBe(am1Id);
      await newClient(tokens.admin).expect(422);
    });

    it('partial updates keep untouched fields, and archiving hides the client', async () => {
      const { body: client } = await newClient(tokens.am1, { paymentTermsDays: 60 }).expect(201);

      const updated = await http
        .patch(`/api/v1/clients/${client.id}`)
        .set(auth(tokens.am1))
        .send({ city: 'Abu Dhabi' })
        .expect(200);
      expect(updated.body).toMatchObject({
        city: 'Abu Dhabi',
        paymentTermsDays: 60,
        status: 'ACTIVE',
      });

      await http.delete(`/api/v1/clients/${client.id}`).set(auth(tokens.am1)).expect(204);
      await http.get(`/api/v1/clients/${client.id}`).set(auth(tokens.am1)).expect(404);
    });

    it('client users only ever see their own company', async () => {
      const { body: own } = await newClient(tokens.am1).expect(201);
      const { body: other } = await newClient(tokens.am1).expect(201);
      const portal = await clientUserFor(own.id);

      const list = await http.get('/api/v1/clients').set(auth(portal)).expect(200);
      expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([own.id]);
      await http.get(`/api/v1/clients/${other.id}`).set(auth(portal)).expect(404);
      await http.get(`/api/v1/clients/${other.id}/contacts`).set(auth(portal)).expect(404);
    });
  });

  describe('contacts, activities and projects', () => {
    it('manages contacts with a single primary and invites one to the portal', async () => {
      const { body: client } = await newClient(tokens.am1).expect(201);
      const base = `/api/v1/clients/${client.id}/contacts`;
      const email = `contact-${randomUUID()}@client.test`;

      const { body: first } = await http
        .post(base)
        .set(auth(tokens.am1))
        .send({ firstName: 'Rami', lastName: 'Saad', email, isPrimary: true })
        .expect(201);
      const { body: second } = await http
        .post(base)
        .set(auth(tokens.am1))
        .send({ firstName: 'Hana', lastName: 'Ali', isPrimary: true })
        .expect(201);
      const contacts = (await http.get(base).set(auth(tokens.am1)).expect(200)).body as {
        id: string;
        isPrimary: boolean;
      }[];
      expect(contacts.filter((c) => c.isPrimary).map((c) => c.id)).toEqual([second.id]);

      const invited = await http
        .post(`${base}/${first.id}/invite`)
        .set(auth(tokens.am1))
        .expect(201);
      expect(invited.body.portalUser).toMatchObject({ status: 'INVITED' });
      const portalUser = await prisma.user.findUniqueOrThrow({
        where: { email },
        include: { roles: { include: { role: true } } },
      });
      expect(portalUser.clientId).toBe(client.id);
      expect(portalUser.roles.map((r) => r.role.code)).toEqual(['CLIENT_USER']);

      expect(
        (await http.post(`${base}/${first.id}/invite`).set(auth(tokens.am1)).expect(409)).body.code,
      ).toBe('CONTACT_ALREADY_INVITED');
      expect(
        (await http.post(`${base}/${second.id}/invite`).set(auth(tokens.am1)).expect(422)).body
          .code,
      ).toBe('CONTACT_EMAIL_REQUIRED');
    });

    it('logs activities newest first with the author', async () => {
      const { body: client } = await newClient(tokens.am1).expect(201);
      const base = `/api/v1/clients/${client.id}/activities`;
      await http
        .post(base)
        .set(auth(tokens.am1))
        .send({ type: 'CALL', subject: 'Intro call', occurredAt: '2026-10-01T09:00:00Z' })
        .expect(201);
      await http
        .post(base)
        .set(auth(tokens.am1))
        .send({ type: 'MEETING', subject: 'Site visit' })
        .expect(201);

      const { body } = await http.get(base).set(auth(tokens.hr)).expect(200);
      expect(body.map((a: { subject: string }) => a.subject)).toEqual(['Site visit', 'Intro call']);
      expect(body[0].author.id).toBe(am1Id);
      await http.post(base).set(auth(tokens.am2)).send({ type: 'NOTE', subject: 'x' }).expect(404);
    });

    it('creates projects with unique names per client', async () => {
      const { body: client } = await newClient(tokens.am1).expect(201);
      const base = `/api/v1/clients/${client.id}/projects`;
      await http
        .post(base)
        .set(auth(tokens.am1))
        .send({ name: 'Al Maktoum Airport Expansion', emirate: 'DUBAI' })
        .expect(201);
      expect(
        (
          await http
            .post(base)
            .set(auth(tokens.hr))
            .send({ name: 'Al Maktoum Airport Expansion' })
            .expect(409)
        ).body.code,
      ).toBe('PROJECT_NAME_EXISTS');
      await http
        .post(base)
        .set(auth(tokenFor(app, ['FINANCE'])))
        .send({ name: 'Other' })
        .expect(403);
    });
  });

  describe('manpower requests', () => {
    let clientId: string;
    beforeAll(async () => {
      clientId = (await newClient(tokens.am1).expect(201)).body.id;
    });

    const create = (token: string, body: Record<string, unknown> = {}) =>
      http
        .post('/api/v1/manpower-requests')
        .set(auth(token))
        .send(requestBody({ clientId, ...body }));
    const act = (id: string, action: string, token: string, body: Record<string, unknown>) =>
      http.post(`/api/v1/manpower-requests/${id}/${action}`).set(auth(token)).send(body);

    it('auto-approves on submit when headcount ≤ 20', async () => {
      const { body: draft } = await create(tokens.am1, { headcount: 20 }).expect(201);
      expect(manpowerRequestSchema.parse(draft).status).toBe('DRAFT');

      const { body } = await act(draft.id, 'submit', tokens.am1, { version: draft.version }).expect(
        200,
      );
      expect(body).toMatchObject({ status: 'APPROVED', version: draft.version + 1 });
      expect(body.decisionComment).toMatch(/Auto-approved/);
    });

    it('sends > 20 to HR approval; only HR can approve; double approval is 409', async () => {
      const { body: draft } = await create(tokens.am1, { headcount: 25 }).expect(201);
      const { body: pending } = await act(draft.id, 'submit', tokens.am1, {
        version: draft.version,
      }).expect(200);
      expect(pending.status).toBe('PENDING_APPROVAL');

      await act(draft.id, 'approve', tokens.am1, { version: pending.version }).expect(403);
      await act(draft.id, 'approve', tokenFor(app, ['RECRUITER']), {
        version: pending.version,
      }).expect(403);

      const { body: approved } = await act(draft.id, 'approve', tokens.hr, {
        version: pending.version,
        comment: 'Budget confirmed',
      }).expect(200);
      expect(approved).toMatchObject({ status: 'APPROVED', decisionComment: 'Budget confirmed' });
      expect(approved.decidedBy).not.toBeNull();

      const again = await act(draft.id, 'approve', tokens.hr, { version: approved.version }).expect(
        409,
      );
      expect(again.body.code).toBe('INVALID_TRANSITION');
      expect(
        await prisma.auditLog.count({
          where: { entityId: draft.id, action: { in: ['CREATE', 'SUBMIT', 'APPROVE'] } },
        }),
      ).toBe(3);
    });

    it('requires a comment to reject and rejects stale versions', async () => {
      const { body: draft } = await create(tokens.am1, { headcount: 50 }).expect(201);
      const { body: pending } = await act(draft.id, 'submit', tokens.am1, {
        version: draft.version,
      }).expect(200);

      await act(draft.id, 'reject', tokens.hr, { version: pending.version }).expect(400);
      expect(
        (
          await act(draft.id, 'reject', tokens.hr, {
            version: draft.version,
            comment: 'No',
          }).expect(409)
        ).body.code,
      ).toBe('STALE_VERSION');
      const { body: rejected } = await act(draft.id, 'reject', tokens.hr, {
        version: pending.version,
        comment: 'Over budget',
      }).expect(200);
      expect(rejected.status).toBe('REJECTED');

      await http
        .patch(`/api/v1/manpower-requests/${draft.id}`)
        .set(auth(tokens.am1))
        .send({ headcount: 5, version: rejected.version })
        .expect(409);
    });

    it('uses the approval threshold from settings', async () => {
      await prisma.setting.upsert({
        where: { key: 'manpowerApprovalThreshold' },
        update: { value: 5 },
        create: { key: 'manpowerApprovalThreshold', value: 5 },
      });
      try {
        const { body: draft } = await create(tokens.am1, { headcount: 6 }).expect(201);
        const { body } = await act(draft.id, 'submit', tokens.am1, {
          version: draft.version,
        }).expect(200);
        expect(body.status).toBe('PENDING_APPROVAL');
      } finally {
        await prisma.setting.delete({ where: { key: 'manpowerApprovalThreshold' } });
      }
    });

    // Approval chains live in this file because they change how every manpower request in the
    // database is approved while active; tests in one file run one at a time.
    describe('approval chains (US-WF-01)', () => {
      let workflowId: string;
      beforeAll(async () => {
        const { body } = await http
          .post('/api/v1/workflows')
          .set(auth(tokens.admin))
          .send({
            name: `Two-step ${randomUUID().slice(0, 6)}`,
            subject: 'MANPOWER_REQUEST',
            steps: [
              { name: 'HR review', approverRole: 'HR_MANAGER' },
              { name: 'Director sign-off', approverRole: 'SUPER_ADMIN' },
            ],
          })
          .expect(201);
        workflowId = body.id;
        expect(body.steps.map((s: { stepOrder: number }) => s.stepOrder)).toEqual([1, 2]);
      });
      afterAll(async () => {
        await prisma.workflowDefinition.update({
          where: { id: workflowId },
          data: { active: false },
        });
      });

      const myApprovals = async (token: string) =>
        (await http.get('/api/v1/approvals').set(auth(token)).expect(200)).body.data as {
          entityId: string;
          currentStep: number;
        }[];

      it('moves step by step; each step only by its role; last step approves', async () => {
        const { body: draft } = await create(tokens.am1, { headcount: 30 }).expect(201);
        const { body: pending } = await act(draft.id, 'submit', tokens.am1, {
          version: draft.version,
        }).expect(200);
        expect(pending.status).toBe('PENDING_APPROVAL');
        expect((await myApprovals(tokens.hr)).some((a) => a.entityId === draft.id)).toBe(true);
        expect((await myApprovals(tokens.am1)).some((a) => a.entityId === draft.id)).toBe(false);

        const { body: step1 } = await act(draft.id, 'approve', tokens.hr, {
          version: pending.version,
          comment: 'HR ok',
        }).expect(200);
        expect(step1).toMatchObject({ status: 'PENDING_APPROVAL', version: pending.version + 1 });
        const notYours = await act(draft.id, 'approve', tokens.hr, { version: step1.version });
        expect(notYours.status).toBe(403);
        expect(notYours.body.code).toBe('NOT_YOUR_APPROVAL_STEP');
        expect((await myApprovals(tokens.hr)).some((a) => a.entityId === draft.id)).toBe(false);

        const { body: done } = await act(draft.id, 'approve', tokens.admin, {
          version: step1.version,
        }).expect(200);
        expect(done.status).toBe('APPROVED');
        const chain = await prisma.approvalRequest.findFirstOrThrow({
          where: { manpowerRequestId: draft.id },
          include: { decisions: { orderBy: { stepOrder: 'asc' } } },
        });
        expect(chain.status).toBe('APPROVED');
        expect(chain.decisions.map((d) => [d.stepOrder, d.decision])).toEqual([
          [1, 'APPROVED'],
          [2, 'APPROVED'],
        ]);
      });

      it('ends on a rejection at any step; steps are locked while approvals pend', async () => {
        const { body: draft } = await create(tokens.am1, { headcount: 40 }).expect(201);
        const { body: pending } = await act(draft.id, 'submit', tokens.am1, {
          version: draft.version,
        }).expect(200);
        const locked = await http
          .patch(`/api/v1/workflows/${workflowId}`)
          .set(auth(tokens.admin))
          .send({ steps: [{ name: 'Only', approverRole: 'HR_MANAGER' }] })
          .expect(409);
        expect(locked.body.code).toBe('WORKFLOW_IN_USE');

        const { body: rejected } = await act(draft.id, 'reject', tokens.hr, {
          version: pending.version,
          comment: 'Not this quarter',
        }).expect(200);
        expect(rejected.status).toBe('REJECTED');
        expect(
          (
            await prisma.approvalRequest.findFirstOrThrow({
              where: { manpowerRequestId: draft.id },
            })
          ).status,
        ).toBe('REJECTED');
      });

      it('an automation rule can start the chain for a small request (US-AUTO-02)', async () => {
        const roleTitle = `Chained ${randomUUID().slice(0, 8)}`;
        const { body: rule } = await http
          .post('/api/v1/automation-rules')
          .set(auth(tokens.admin))
          .send({
            name: `Approve ${roleTitle}`,
            event: 'MANPOWER_REQUEST_CREATED',
            conditions: [{ field: 'roleTitle', op: 'eq', value: roleTitle }],
            actions: [{ type: 'start_approval', workflowId }],
          })
          .expect(201);
        try {
          const { body: draft } = await create(tokens.am1, { headcount: 2, roleTitle }).expect(201);
          const run = await prisma.automationRun.findFirstOrThrow({ where: { ruleId: rule.id } });
          expect(run).toMatchObject({ status: 'SUCCEEDED', attempts: 1 });
          expect(run.payload).toMatchObject({ manpowerRequestId: draft.id, headcount: 2 });

          const { body: submitted } = await act(draft.id, 'submit', tokens.am1, {
            version: draft.version,
          }).expect(200);
          expect(submitted.status).toBe('PENDING_APPROVAL'); // not auto-approved despite ≤ 20

          const { body: cancelled } = await act(draft.id, 'cancel', tokens.am1, {
            version: submitted.version,
            reason: 'Duplicate',
          }).expect(200);
          expect(cancelled.status).toBe('CANCELLED');
          expect(
            (
              await prisma.approvalRequest.findFirstOrThrow({
                where: { manpowerRequestId: draft.id },
              })
            ).status,
          ).toBe('CANCELLED');
        } finally {
          await prisma.automationRule.update({ where: { id: rule.id }, data: { active: false } });
        }
      });
    });

    it('validates input (headcount, past start date, unknown fields)', async () => {
      const res = await create(tokens.am1, {
        headcount: 0,
        startDate: '2020-01-01',
        status: 'APPROVED',
      }).expect(400);
      expect(Object.keys(res.body.details.fields).sort()).toEqual(['headcount', 'status']);
      const past = await create(tokens.am1, { startDate: '2020-01-01' }).expect(400);
      expect(past.body.details.fields).toHaveProperty('startDate');
    });

    it("blocks raising requests for another account manager's client (404)", async () => {
      await create(tokens.am2).expect(404);
    });

    it.each(['RECRUITER', 'HIRING_MANAGER', 'FINANCE', 'EMPLOYEE'] as const)(
      'blocks %s from creating requests (403)',
      async (role) => {
        await create(tokenFor(app, [role])).expect(403);
      },
    );

    it('client users raise requests for their own company only and cannot submit them', async () => {
      const { body: otherClient } = await newClient(tokens.am2).expect(201);
      const portal = await clientUserFor(clientId);

      const { body } = await http
        .post('/api/v1/manpower-requests')
        .set(auth(portal))
        .send(requestBody({ clientId: otherClient.id }))
        .expect(201);
      expect(body).toMatchObject({ status: 'SUBMITTED', client: { id: clientId } });

      await act(body.id, 'submit', portal, { version: body.version }).expect(403);
      const { body: reviewed } = await act(body.id, 'submit', tokens.am1, {
        version: body.version,
      }).expect(200);
      expect(reviewed.status).toBe('APPROVED');

      const { body: otherRequest } = await http
        .post('/api/v1/manpower-requests')
        .set(auth(tokens.am2))
        .send(requestBody({ clientId: otherClient.id }))
        .expect(201);
      await http.get(`/api/v1/manpower-requests/${otherRequest.id}`).set(auth(portal)).expect(404);
      const list = await http
        .get('/api/v1/manpower-requests?pageSize=100')
        .set(auth(portal))
        .expect(200);
      expect(
        list.body.data.every((r: { client: { id: string } }) => r.client.id === clientId),
      ).toBe(true);
    });

    it('cancels with a reason and shows open requests on the client', async () => {
      const { body: draft } = await create(tokens.am1).expect(201);
      const { body: approved } = await act(draft.id, 'submit', tokens.am1, {
        version: draft.version,
      }).expect(200);
      const client = await http
        .get(`/api/v1/clients/${clientId}`)
        .set(auth(tokens.am1))
        .expect(200);
      expect(client.body.openRequests).toBeGreaterThan(0);

      await act(draft.id, 'cancel', tokens.am1, { version: approved.version }).expect(400);
      const { body } = await act(draft.id, 'cancel', tokens.am1, {
        version: approved.version,
        reason: 'Client postponed',
      }).expect(200);
      expect(body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Client postponed' });
    });
  });
});
