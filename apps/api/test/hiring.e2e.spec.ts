import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type ApplicationStage,
  feedbackSchema,
  interviewSchema,
  offerSchema,
  type RoleCode,
} from '@staffos/shared';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(120_000);

type U = { id: string; token: string };

describeWithDb('Recruitment part 2: interviews, offers, hire', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let send: jest.SpyInstance;
  let hr: U, rec1: U, rec2: U, hm: U, hm2: U, am: U;
  let clientId: string;
  let requestId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    send = jest.spyOn(app.get(MailService), 'send').mockResolvedValue();
    const make = async (role: RoleCode): Promise<U> => {
      const user = await createUser(app, { roles: [role] });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    [hr, rec1, rec2, hm, hm2, am] = (await Promise.all(
      (
        [
          'HR_MANAGER',
          'RECRUITER',
          'RECRUITER',
          'HIRING_MANAGER',
          'HIRING_MANAGER',
          'ACCOUNT_MANAGER',
        ] as const
      ).map(make),
    )) as [U, U, U, U, U, U];
    clientId = (
      await prisma.client.create({
        data: {
          name: `Hiring Test ${randomUUID().slice(0, 6)}`,
          industry: 'FACILITIES',
          city: 'Dubai',
          emirate: 'DUBAI',
          accountManagerId: am.id,
        },
      })
    ).id;
    requestId = (
      await prisma.manpowerRequest.create({
        data: {
          clientId,
          roleTitle: 'Facilities Technician',
          category: 'FACILITIES',
          headcount: 1,
          location: 'Al Quoz',
          emirate: 'DUBAI',
          startDate: new Date('2027-02-01T00:00:00Z'),
          status: 'APPROVED',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => send.mockClear());

  const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

  /** An OPEN job (rec1 assigned, hm as hiring manager) with one application at `stage`. */
  async function setup(stage: ApplicationStage, headcount = 2) {
    const job = await prisma.job.create({
      data: {
        manpowerRequestId: requestId,
        clientId,
        title: 'Facilities Technician',
        slug: `facilities-technician-${randomUUID().slice(0, 8)}`,
        category: 'FACILITIES',
        location: 'Al Quoz',
        emirate: 'DUBAI',
        headcount,
        status: 'OPEN',
        hiringManagerId: hm.id,
        recruiters: { create: [{ userId: rec1.id }] },
      },
    });
    const candidate = await prisma.candidate.create({
      data: {
        firstName: 'Karim',
        lastName: 'Nassar',
        email: `karim-${randomUUID()}@candidate.test`,
        source: 'MANUAL',
      },
    });
    const application = await prisma.application.create({
      data: {
        jobId: job.id,
        candidateId: candidate.id,
        stage,
        stageHistory: { create: { toStage: stage } },
      },
    });
    return { job, candidate, application };
  }

  const inAWeek = () => new Date(Date.now() + 7 * 86_400_000).toISOString();
  const schedule = (u: U, applicationId: string, overrides: Record<string, unknown> = {}) =>
    http
      .post('/api/v1/interviews')
      .set(auth(u))
      .send({
        applicationId,
        scheduledAt: inAWeek(),
        durationMin: 45,
        mode: 'ONSITE',
        location: 'Al Quoz office',
        interviewerIds: [hm.id],
        ...overrides,
      });
  const feedback = (u: U, interviewId: string, recommendation = 'YES') =>
    http
      .post(`/api/v1/interviews/${interviewId}/feedback`)
      .set(auth(u))
      .send({ scores: [{ criterion: 'Technical skills', score: 4 }], recommendation });
  const offerBody = (applicationId: string) => ({
    applicationId,
    salaryFils: 650_000,
    startDate: '2027-03-01',
    contractType: 'FIXED_TERM',
    contractMonths: 24,
  });
  const act = (u: U, id: string, action: string, version: number) =>
    http.post(`/api/v1/offers/${id}/${action}`).set(auth(u)).send({ version });

  describe('interviews', () => {
    it('schedules and emails each person their own Asia/Dubai invite', async () => {
      const { application, candidate } = await setup('INTERVIEW');
      const res = await schedule(rec1, application.id, { interviewerIds: [hm.id, hm2.id] }).expect(
        201,
      );
      const interview = interviewSchema.parse(res.body);
      expect(interview).toMatchObject({ status: 'SCHEDULED', applicationId: application.id });
      expect(interview.interviewers).toHaveLength(2);

      expect(send).toHaveBeenCalledTimes(3);
      const toCandidate = send.mock.calls.map(([m]) => m).find((m) => m.to === candidate.email);
      expect(toCandidate.icalEvent.method).toBe('REQUEST');
      expect(toCandidate.icalEvent.content).toContain('DTSTART;TZID=Asia/Dubai:');
      // The candidate's invite lists only the candidate, never staff addresses.
      expect(toCandidate.icalEvent.content).not.toContain('@test.staffos');
      expect(toCandidate.text).not.toContain('Karim Nassar for');
    });

    it('needs the Interview stage (422) and a valid panel (422)', async () => {
      const { application } = await setup('SHORTLISTED');
      expect((await schedule(rec1, application.id).expect(422)).body.code).toBe(
        'APPLICATION_NOT_IN_INTERVIEW',
      );
      const ready = await setup('INTERVIEW');
      expect(
        (await schedule(rec1, ready.application.id, { interviewerIds: [rec2.id] }).expect(422)).body
          .code,
      ).toBe('INVALID_INTERVIEWER');
      expect(
        (
          await schedule(rec1, ready.application.id, {
            scheduledAt: '2020-01-01T10:00:00Z',
          }).expect(422)
        ).body.code,
      ).toBe('INTERVIEW_IN_PAST');
    });

    it('lists panel options (id, name, role) for schedulers only', async () => {
      const res = await http.get('/api/v1/interviews/panel-options').set(auth(rec1)).expect(200);
      const ids = res.body.map((o: { id: string }) => o.id);
      expect(ids).toEqual(expect.arrayContaining([hm.id, hr.id]));
      expect(ids).not.toContain(rec1.id);
      expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name', 'role']);
      await http.get('/api/v1/interviews/panel-options').set(auth(hm)).expect(403);
    });

    it('blocks hiring managers (403) and unassigned recruiters (404) from scheduling', async () => {
      const { application } = await setup('INTERVIEW');
      await schedule(hm, application.id).expect(403);
      await schedule(rec2, application.id).expect(404);
    });

    it('completes the interview when the whole panel has scored, and notifies recruiters', async () => {
      const { application } = await setup('INTERVIEW');
      const { id } = (await schedule(rec1, application.id, { interviewerIds: [hm.id, hm2.id] }))
        .body;

      await feedback(rec1, id).expect(403); // recruiters can't give feedback
      expect((await feedback(hr, id).expect(403)).body.code).toBe('NOT_AN_INTERVIEWER');
      feedbackSchema.parse((await feedback(hm, id).expect(200)).body);
      expect((await http.get(`/api/v1/interviews/${id}`).set(auth(rec1))).body.status).toBe(
        'SCHEDULED',
      );
      await feedback(hm2, id, 'NO').expect(200);
      expect((await http.get(`/api/v1/interviews/${id}`).set(auth(rec1))).body.status).toBe(
        'COMPLETED',
      );
      expect(
        await prisma.notification.count({
          where: {
            userId: rec1.id,
            type: 'interview.feedback_complete',
            link: { contains: application.id },
          },
        }),
      ).toBe(1);

      // Panel members see only their own scorecard; the job's hiring manager sees all.
      const own = (await http.get(`/api/v1/interviews/${id}/feedback`).set(auth(hm2))).body;
      expect(own.map((f: { interviewer: { id: string } }) => f.interviewer.id)).toEqual([hm2.id]);
      expect((await http.get(`/api/v1/interviews/${id}/feedback`).set(auth(hm))).body).toHaveLength(
        2,
      );
    });

    it('lets the author edit feedback for 24 hours, then locks it (409)', async () => {
      const { application } = await setup('INTERVIEW');
      const { id } = (await schedule(rec1, application.id)).body;
      await feedback(hm, id, 'YES').expect(200);
      expect((await feedback(hm, id, 'STRONG_YES').expect(200)).body.recommendation).toBe(
        'STRONG_YES',
      );
      await prisma.interviewFeedback.updateMany({
        where: { interviewId: id },
        data: { submittedAt: new Date(Date.now() - 25 * 3_600_000) },
      });
      expect((await feedback(hm, id, 'NO').expect(409)).body.code).toBe('FEEDBACK_LOCKED');
    });

    it('cancels with a calendar CANCEL, after which it cannot be rescheduled (409)', async () => {
      const { application } = await setup('INTERVIEW');
      const { id } = (await schedule(rec1, application.id)).body;
      send.mockClear();
      const res = await http
        .post(`/api/v1/interviews/${id}/cancel`)
        .set(auth(rec1))
        .send({ reason: 'Candidate asked to move it' })
        .expect(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(send.mock.calls.every(([m]) => m.icalEvent.method === 'CANCEL')).toBe(true);
      const patch = await http
        .patch(`/api/v1/interviews/${id}`)
        .set(auth(rec1))
        .send({ scheduledAt: inAWeek(), durationMin: 30, mode: 'PHONE', interviewerIds: [hm.id] })
        .expect(409);
      expect(patch.body.code).toBe('INTERVIEW_NOT_SCHEDULED');
    });
  });

  describe('offers', () => {
    it('is created PENDING_APPROVAL only in the Offer stage, one at a time', async () => {
      const early = await setup('INTERVIEW');
      expect(
        (
          await http
            .post('/api/v1/offers')
            .set(auth(rec1))
            .send(offerBody(early.application.id))
            .expect(422)
        ).body.code,
      ).toBe('APPLICATION_NOT_IN_OFFER');

      const { application } = await setup('OFFER');
      const res = await http
        .post('/api/v1/offers')
        .set(auth(rec1))
        .send(offerBody(application.id))
        .expect(201);
      expect(offerSchema.parse(res.body)).toMatchObject({
        status: 'PENDING_APPROVAL',
        currency: 'AED',
        salaryFils: 650_000,
      });
      expect(
        await prisma.notification.count({
          where: { userId: hm.id, type: 'offer.approval_needed' },
        }),
      ).toBeGreaterThan(0);
      expect(
        (
          await http
            .post('/api/v1/offers')
            .set(auth(rec1))
            .send(offerBody(application.id))
            .expect(409)
        ).body.code,
      ).toBe('OFFER_EXISTS');
    });

    it("is approved only by the job's hiring manager or HR; others are blocked", async () => {
      const { application } = await setup('OFFER');
      const offer = (
        await http.post('/api/v1/offers').set(auth(rec1)).send(offerBody(application.id))
      ).body;
      await act(rec1, offer.id, 'approve', offer.version).expect(403); // no offers:approve
      await act(hm2, offer.id, 'approve', offer.version).expect(404); // another job's manager
      await act(rec2, offer.id, 'send', offer.version).expect(404); // unassigned recruiter
      expect((await act(rec1, offer.id, 'send', offer.version).expect(409)).body.code).toBe(
        'INVALID_OFFER_TRANSITION',
      );
      const approved = (await act(hm, offer.id, 'approve', offer.version).expect(200)).body;
      expect(approved).toMatchObject({ status: 'APPROVED', approvedBy: { id: hm.id } });
      expect((await act(rec1, offer.id, 'send', offer.version).expect(409)).body.code).toBe(
        'STALE_VERSION',
      );
    });
  });

  describe('hire', () => {
    const fullOffer = async (applicationId: string) => {
      let offer = (await http.post('/api/v1/offers').set(auth(rec1)).send(offerBody(applicationId)))
        .body;
      for (const [u, action] of [
        [hm, 'approve'],
        [rec1, 'send'],
        [rec1, 'accept'],
      ] as const) {
        offer = (await act(u, offer.id, action, offer.version).expect(200)).body;
      }
      return offer;
    };

    it('creates the employee and onboarding plan, fills the job and notifies the account manager', async () => {
      const { application, job, candidate } = await setup('OFFER', 1);
      await fullOffer(application.id);
      const template =
        (await prisma.onboardingTemplate.findFirst({
          where: { category: 'FACILITIES', active: true },
          include: { tasks: true },
        })) ??
        (await prisma.onboardingTemplate.findFirst({
          where: { category: null, active: true },
          include: { tasks: true },
        }));

      const res = await http
        .post(`/api/v1/applications/${application.id}/transition`)
        .set(auth(rec1))
        .send({ to: 'HIRED', version: application.version })
        .expect(200);
      expect(res.body.stage).toBe('HIRED');

      const employee = await prisma.employee.findUniqueOrThrow({
        where: { candidateId: candidate.id },
        include: { onboardingPlan: { include: { tasks: true } } },
      });
      expect(employee).toMatchObject({
        status: 'ONBOARDING',
        salaryFils: 650_000,
        hireDate: new Date('2027-03-01T00:00:00Z'),
      });
      expect(employee.employeeNumber).toMatch(/^EMP-\d{6,}$/);
      expect(employee.onboardingPlan?.tasks).toHaveLength(template?.tasks.length ?? 0);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('FILLED');
      expect(
        await prisma.notification.count({ where: { userId: am.id, type: 'application.hired' } }),
      ).toBeGreaterThan(0);
    });

    it('rolls everything back if a step fails: stage stays OFFER, nothing is created', async () => {
      const { application, candidate } = await setup('OFFER');
      await fullOffer(application.id);
      // An existing employee record for this candidate makes the hire step fail mid-transaction.
      await prisma.employee.create({
        data: {
          employeeNumber: `EMP-T${randomUUID().slice(0, 8)}`,
          candidateId: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          hireDate: new Date('2026-01-01T00:00:00Z'),
        },
      });
      const res = await http
        .post(`/api/v1/applications/${application.id}/transition`)
        .set(auth(rec1))
        .send({ to: 'HIRED', version: application.version })
        .expect(409);
      expect(res.body.code).toBe('ALREADY_EMPLOYED');

      const after = await prisma.application.findUniqueOrThrow({
        where: { id: application.id },
        include: { stageHistory: true },
      });
      expect(after.stage).toBe('OFFER');
      expect(after.version).toBe(application.version);
      expect(after.stageHistory.some((h) => h.toStage === 'HIRED')).toBe(false);
      expect(await prisma.employee.count({ where: { applicationId: application.id } })).toBe(0);
    });
  });
});
