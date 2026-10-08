import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { applicationSchema, jobSchema, pipelineSchema, type RoleCode } from '@staffos/shared';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login, tokenFor } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(120_000);

type U = { id: string; token: string };

describeWithDb('Recruitment: jobs, candidates, applications', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let hr: U, rec1: U, rec2: U, hm: U, am: U, am2: U;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    jest.spyOn(app.get(MailService), 'send').mockResolvedValue();
    const make = async (role: RoleCode): Promise<U> => {
      const user = await createUser(app, { roles: [role] });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    [hr, rec1, rec2, hm, am, am2] = (await Promise.all(
      (
        [
          'HR_MANAGER',
          'RECRUITER',
          'RECRUITER',
          'HIRING_MANAGER',
          'ACCOUNT_MANAGER',
          'ACCOUNT_MANAGER',
        ] as const
      ).map(make),
    )) as [U, U, U, U, U, U];
    clientId = (
      await prisma.client.create({
        data: {
          name: `Recruit Test ${randomUUID().slice(0, 6)}`,
          industry: 'LOGISTICS',
          city: 'Dubai',
          emirate: 'DUBAI',
          accountManagerId: am.id,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (u: U | string) => ({
    Authorization: `Bearer ${typeof u === 'string' ? u : u.token}`,
  });
  const newRequest = async (status: 'APPROVED' | 'DRAFT' = 'APPROVED') =>
    (
      await prisma.manpowerRequest.create({
        data: {
          clientId,
          roleTitle: 'Forklift Operator',
          category: 'DRIVER',
          headcount: 4,
          location: 'Jebel Ali',
          emirate: 'DUBAI',
          startDate: new Date('2027-02-01T00:00:00Z'),
          status,
        },
      })
    ).id;
  const openJob = async (overrides: Record<string, unknown> = {}, status = 201) =>
    http
      .post('/api/v1/jobs')
      .set(auth(hr))
      .send({
        manpowerRequestId: await newRequest(),
        recruiterIds: [rec1.id],
        hiringManagerId: hm.id,
        skills: [{ name: 'Forklift licence', weight: 'MUST', minYears: 2 }],
        ...overrides,
      })
      .expect(status);
  const publish = async (job: { id: string; version: number }) =>
    (
      await http
        .post(`/api/v1/jobs/${job.id}/publish`)
        .set(auth(hr))
        .send({ version: job.version })
        .expect(200)
    ).body;
  const newCandidate = (u: U, overrides: Record<string, unknown> = {}) =>
    http
      .post('/api/v1/candidates')
      .set(auth(u))
      .send({
        firstName: 'Rania',
        lastName: 'Saeed',
        email: `rania-${randomUUID()}@candidate.test`,
        skills: [{ name: 'Forklift licence', years: 4 }],
        ...overrides,
      });
  const move = (id: string, u: U | string, body: Record<string, unknown>) =>
    http.post(`/api/v1/applications/${id}/transition`).set(auth(u)).send(body);

  describe('jobs', () => {
    it('opens a DRAFT job from an approved request, copying its fields', async () => {
      const res = await openJob();
      const job = jobSchema.parse(res.body);
      expect(job).toMatchObject({
        status: 'DRAFT',
        title: 'Forklift Operator',
        headcount: 4,
        category: 'DRIVER',
        client: { id: clientId },
      });
      expect(job.recruiters.map((r) => r.id)).toEqual([rec1.id]);
      expect(job.slug).toMatch(/^forklift-operator-[0-9a-f]{6}$/);
    });

    it('refuses unapproved requests (422) and non-recruiters as recruiters (422)', async () => {
      const draft = await http
        .post('/api/v1/jobs')
        .set(auth(hr))
        .send({
          manpowerRequestId: await newRequest('DRAFT'),
          recruiterIds: [rec1.id],
          hiringManagerId: hm.id,
        })
        .expect(422);
      expect(draft.body.code).toBe('REQUEST_NOT_APPROVED');
      expect((await openJob({ recruiterIds: [hm.id] }, 422)).body.code).toBe('INVALID_RECRUITER');
      expect((await openJob({ hiringManagerId: rec1.id }, 422)).body.code).toBe(
        'INVALID_HIRING_MANAGER',
      );
    });

    it.each([
      'RECRUITER',
      'ACCOUNT_MANAGER',
      'HIRING_MANAGER',
      'FINANCE',
      'EMPLOYEE',
      'CLIENT_USER',
    ] as const)('blocks %s from opening jobs (403)', async (role) => {
      await http
        .post('/api/v1/jobs')
        .set(auth(tokenFor(app, [role])))
        .send({ manpowerRequestId: randomUUID(), recruiterIds: [rec1.id], hiringManagerId: hm.id })
        .expect(403);
    });

    it('follows the lifecycle and rejects stale or invalid changes (409)', async () => {
      const { body: draft } = await openJob();
      const open = await publish(draft);
      expect(open).toMatchObject({ status: 'OPEN', version: draft.version + 1 });
      expect(open.publishedAt).not.toBeNull();

      expect(
        (
          await http
            .post(`/api/v1/jobs/${draft.id}/publish`)
            .set(auth(hr))
            .send({ version: open.version })
            .expect(409)
        ).body.code,
      ).toBe('INVALID_TRANSITION');
      expect(
        (
          await http
            .post(`/api/v1/jobs/${draft.id}/hold`)
            .set(auth(hr))
            .send({ version: draft.version })
            .expect(409)
        ).body.code,
      ).toBe('STALE_VERSION');
      const { body: closed } = await http
        .post(`/api/v1/jobs/${draft.id}/close`)
        .set(auth(hr))
        .send({ version: open.version })
        .expect(200);
      await http
        .patch(`/api/v1/jobs/${draft.id}`)
        .set(auth(hr))
        .send({ title: 'x', version: closed.version })
        .expect(409);
    });

    it('scopes jobs: assigned recruiter, hiring manager and owning account manager only (404 otherwise)', async () => {
      const { body: job } = await openJob();
      for (const u of [rec1, hm, am, hr])
        await http.get(`/api/v1/jobs/${job.id}`).set(auth(u)).expect(200);
      for (const u of [rec2, am2]) {
        await http.get(`/api/v1/jobs/${job.id}`).set(auth(u)).expect(404);
        await http
          .get(`/api/v1/jobs/${job.id}/pipeline`)
          .set(auth(u))
          .expect(rec2 === u ? 404 : 403);
      }
      const list = await http.get('/api/v1/jobs?pageSize=100').set(auth(rec2)).expect(200);
      expect(list.body.data.some((j: { id: string }) => j.id === job.id)).toBe(false);
    });
  });

  describe('candidates', () => {
    it('detects duplicates by email and only reveals the match to someone who can see it', async () => {
      const email = `dup-${randomUUID()}@candidate.test`;
      const { body: first } = await newCandidate(rec1, { email }).expect(201);

      const own = await newCandidate(rec1, { email }).expect(409);
      expect(own.body).toMatchObject({
        code: 'CANDIDATE_DUPLICATE',
        details: { candidateId: first.id },
      });
      const other = await newCandidate(rec2, { email }).expect(409);
      expect(other.body.details.candidateId).toBeUndefined();

      await http
        .post('/api/v1/candidates?force=true')
        .set(auth(rec1))
        .send({ firstName: 'A', lastName: 'B', email })
        .expect(409);
      await http
        .post('/api/v1/candidates?force=true')
        .set(auth(hr))
        .send({ firstName: 'A', lastName: 'B', email })
        .expect(201);
    });

    it("hides another recruiter's candidates (404) and blocks roles without access (403)", async () => {
      const { body: c } = await newCandidate(rec1).expect(201);
      await http.get(`/api/v1/candidates/${c.id}`).set(auth(rec2)).expect(404);
      await http
        .patch(`/api/v1/candidates/${c.id}`)
        .set(auth(rec2))
        .send({ currentTitle: 'x' })
        .expect(404);
      for (const role of ['FINANCE', 'EMPLOYEE', 'ACCOUNT_MANAGER'] as const) {
        await http
          .get('/api/v1/candidates')
          .set(auth(tokenFor(app, [role])))
          .expect(403);
      }
      await http.delete(`/api/v1/candidates/${c.id}`).set(auth(rec1)).expect(403);
    });
  });

  describe('applications and the pipeline', () => {
    it('enforces the stage rules end to end with history, scoping and masking', async () => {
      const { body: draft } = await openJob();
      const { body: candidate } = await newCandidate(rec1).expect(201);
      const add = { candidateId: candidate.id, jobId: draft.id };

      expect(
        (await http.post('/api/v1/applications').set(auth(rec1)).send(add).expect(422)).body.code,
      ).toBe('JOB_NOT_OPEN');
      await publish(draft);
      const { body: created } = await http
        .post('/api/v1/applications')
        .set(auth(rec1))
        .send(add)
        .expect(201);
      expect(applicationSchema.parse(created).stage).toBe('APPLIED');
      expect(
        (await http.post('/api/v1/applications').set(auth(rec1)).send(add).expect(409)).body.code,
      ).toBe('ALREADY_APPLIED');
      await http.post('/api/v1/applications').set(auth(rec2)).send(add).expect(404);

      // Illegal jump is rejected by the API, not just the UI.
      const jump = await move(created.id, rec1, { to: 'HIRED', version: created.version }).expect(
        409,
      );
      expect(jump.body).toMatchObject({
        code: 'INVALID_TRANSITION',
        details: { from: 'APPLIED', to: 'HIRED' },
      });

      const { body: screening } = await move(created.id, rec1, {
        to: 'SCREENING',
        version: created.version,
      }).expect(200);
      expect(
        (await move(created.id, rec1, { to: 'SHORTLISTED', version: created.version }).expect(409))
          .body.code,
      ).toBe('STALE_VERSION');
      await move(created.id, rec2, { to: 'SHORTLISTED', version: screening.version }).expect(404);
      await move(created.id, hm, { to: 'SHORTLISTED', version: screening.version }).expect(403);

      // Hiring managers and clients only see shortlisted candidates.
      await http.get(`/api/v1/applications/${created.id}`).set(auth(hm)).expect(404);
      const { body: shortlisted } = await move(created.id, rec1, {
        to: 'SHORTLISTED',
        version: screening.version,
      }).expect(200);
      await http.get(`/api/v1/applications/${created.id}`).set(auth(hm)).expect(200);
      const client = await createUser(app, { roles: ['CLIENT_USER'], clientId });
      const portal = (await login(app, client.email)).accessToken;
      const seen = await http
        .get(`/api/v1/candidates/${candidate.id}`)
        .set(auth(portal))
        .expect(200);
      expect(seen.body.email).toMatch(/^r•••@candidate\.test$/);
      expect(seen.body.phone).toBeNull();

      const { body: interview } = await move(created.id, rec1, {
        to: 'INTERVIEW',
        version: shortlisted.version,
      }).expect(200);
      const { body: offer } = await move(created.id, rec1, {
        to: 'OFFER',
        version: interview.version,
      }).expect(200);
      expect(
        (await move(created.id, rec1, { to: 'HIRED', version: offer.version }).expect(422)).body
          .code,
      ).toBe('OFFER_NOT_ACCEPTED');
      await move(created.id, rec1, { to: 'REJECTED', version: offer.version }).expect(400);
      const { body: rejected } = await move(created.id, rec1, {
        to: 'REJECTED',
        version: offer.version,
        reason: 'Salary mismatch',
      }).expect(200);
      expect(rejected).toMatchObject({ stage: 'REJECTED', rejectReason: 'Salary mismatch' });
      await move(created.id, rec1, { to: 'SCREENING', version: rejected.version }).expect(409);

      expect(rejected.history.map((h: { toStage: string }) => h.toStage)).toEqual([
        'APPLIED',
        'SCREENING',
        'SHORTLISTED',
        'INTERVIEW',
        'OFFER',
        'REJECTED',
      ]);
      expect(
        await prisma.auditLog.count({
          where: { entity: 'application', entityId: created.id, action: 'TRANSITION' },
        }),
      ).toBe(5);
    });

    it('groups the pipeline by stage, with only shortlisted columns for hiring managers', async () => {
      const { body: draft } = await openJob();
      await publish(draft);
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        const { body: c } = await newCandidate(rec1).expect(201);
        ids.push(
          (
            await http
              .post('/api/v1/applications')
              .set(auth(rec1))
              .send({ candidateId: c.id, jobId: draft.id })
              .expect(201)
          ).body.id,
        );
      }
      await move(ids[0]!, rec1, { to: 'SCREENING', version: 1 }).expect(200);

      const full = pipelineSchema.parse(
        (await http.get(`/api/v1/jobs/${draft.id}/pipeline`).set(auth(rec1)).expect(200)).body,
      );
      const count = (stage: string) => full.columns.find((c) => c.stage === stage)?.count;
      expect([count('APPLIED'), count('SCREENING')]).toEqual([1, 1]);
      expect(full.columns.map((c) => c.stage)).toContain('REJECTED');

      const limited = (
        await http.get(`/api/v1/jobs/${draft.id}/pipeline`).set(auth(hm)).expect(200)
      ).body;
      expect(limited.columns.map((c: { stage: string }) => c.stage)).toEqual([
        'SHORTLISTED',
        'INTERVIEW',
        'OFFER',
        'HIRED',
      ]);
    });

    it.each(['FINANCE', 'EMPLOYEE', 'ACCOUNT_MANAGER'] as const)(
      'blocks %s from the applications API (403)',
      async (role) => {
        await http
          .get('/api/v1/applications')
          .set(auth(tokenFor(app, [role])))
          .expect(403);
      },
    );
  });
});
