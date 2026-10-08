import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { publicJobSchema, trackingSchema } from '@staffos/shared';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { createUser } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(120_000);

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(300, 0x20)]);

describeWithDb('Careers portal (public)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let send: jest.SpyInstance;
  let recruiterId: string;
  let clientId: string;
  let requestId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    send = jest.spyOn(app.get(MailService), 'send').mockResolvedValue();
    recruiterId = (await createUser(app, { roles: ['RECRUITER'] })).id;
    const hm = await createUser(app, { roles: ['HIRING_MANAGER'] });
    const am = await createUser(app, { roles: ['ACCOUNT_MANAGER'] });
    clientId = (
      await prisma.client.create({
        data: {
          name: `Secret Client ${randomUUID().slice(0, 6)}`,
          industry: 'LOGISTICS',
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
          roleTitle: 'Warehouse Associate',
          category: 'OTHER',
          headcount: 3,
          location: 'Jebel Ali',
          emirate: 'DUBAI',
          startDate: new Date('2027-02-01T00:00:00Z'),
          status: 'APPROVED',
        },
      })
    ).id;
    hmId = hm.id;
  });
  let hmId: string;

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => send.mockClear());

  const newJob = (status: 'OPEN' | 'DRAFT' = 'OPEN', showClientName = false) =>
    prisma.job.create({
      data: {
        manpowerRequestId: requestId,
        clientId,
        title: `Warehouse Associate ${randomUUID().slice(0, 4)}`,
        slug: `warehouse-associate-${randomUUID().slice(0, 8)}`,
        category: 'OTHER',
        location: 'Jebel Ali',
        emirate: 'DUBAI',
        headcount: 3,
        status,
        showClientName,
        publishedAt: new Date(),
        hiringManagerId: hmId,
        recruiters: { create: [{ userId: recruiterId }] },
        skills: { create: [{ name: 'Forklift licence', weight: 'MUST' }] },
      },
    });
  const apply = (
    slug: string,
    fields: Record<string, string> = {},
    file: Buffer | null = PDF,
    name = 'cv.pdf',
  ) => {
    const req = http.post(`/api/v1/careers/jobs/${slug}/apply`);
    const data = {
      firstName: 'Amal',
      lastName: 'Yousef',
      email: `amal-${randomUUID()}@candidate.test`,
      phone: '+971 50 111 2222',
      consent: 'true',
      ...fields,
    };
    for (const [k, v] of Object.entries(data)) req.field(k, v);
    return file ? req.attach('file', file, name) : req;
  };
  const tokenFrom = (url: string) => url.split('/').pop()!;

  it('lists only open jobs with public fields, hiding the client unless allowed', async () => {
    const open = await newJob();
    const named = await newJob('OPEN', true);
    const draft = await newJob('DRAFT');
    const res = await http
      .get('/api/v1/careers/jobs?pageSize=100&search=Warehouse%20Associate')
      .expect(200);
    const slugs = res.body.data.map((j: { slug: string }) => j.slug);
    expect(slugs).toEqual(expect.arrayContaining([open.slug, named.slug]));
    expect(slugs).not.toContain(draft.slug);

    const one = publicJobSchema
      .strict()
      .parse((await http.get(`/api/v1/careers/jobs/${open.slug}`).expect(200)).body);
    expect(one.clientName).toBeNull();
    expect(one.skills).toEqual([{ name: 'Forklift licence', required: true }]);
    expect((await http.get(`/api/v1/careers/jobs/${named.slug}`)).body.clientName).toMatch(
      /^Secret Client/,
    );
    await http.get(`/api/v1/careers/jobs/${draft.slug}`).expect(404);
  });

  it('creates candidate, CV and APPLIED application, notifies recruiters and emails the link', async () => {
    const job = await newJob();
    const email = `amal-${randomUUID()}@candidate.test`;
    const res = await apply(job.slug, { email: email.toUpperCase() }).expect(201);
    expect(res.body.trackingUrl).toMatch(/^http:\/\/localhost:5173\/careers\/track\/[\w-]+$/);

    const candidate = await prisma.candidate.findFirstOrThrow({
      where: { email },
      include: { applications: { include: { stageHistory: true } }, documents: true },
    });
    expect(candidate).toMatchObject({ source: 'CAREERS_PORTAL' });
    expect(candidate.consentAt).not.toBeNull();
    expect(candidate.applications[0]).toMatchObject({ jobId: job.id, stage: 'APPLIED' });
    expect(candidate.applications[0]!.stageHistory).toHaveLength(1);
    expect(candidate.applications[0]!.trackingTokenHash).not.toBe(tokenFrom(res.body.trackingUrl));
    expect(candidate.documents).toMatchObject([{ type: 'CV', mimeType: 'application/pdf' }]);
    expect(
      await prisma.notification.count({
        where: { userId: recruiterId, type: 'application.received' },
      }),
    ).toBeGreaterThan(0);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: email, text: expect.stringContaining(res.body.trackingUrl) }),
    );

    // Same email again on this job: 409. On another job: same candidate, new application.
    expect((await apply(job.slug, { email }).expect(409)).body.code).toBe('ALREADY_APPLIED');
    const other = await newJob();
    await apply(other.slug, { email }).expect(201);
    expect(await prisma.candidate.count({ where: { email } })).toBe(1);
  });

  it('requires consent and a real PDF or Word CV', async () => {
    const job = await newJob();
    await apply(job.slug, { consent: 'false' }).expect(400);
    expect(
      (await apply(job.slug, {}, Buffer.from('MZ\x90\x00'), 'cv.pdf').expect(422)).body.code,
    ).toBe('INVALID_FILE');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(50)]);
    await apply(job.slug, {}, png, 'cv.png').expect(422);
    await apply(job.slug, {}, null).expect(422);
    const closed = await newJob('DRAFT');
    await apply(closed.slug).expect(404);
  });

  it('shows a candidate-friendly status only, and 404 for unknown tokens', async () => {
    const job = await newJob();
    const email = `amal-${randomUUID()}@candidate.test`;
    const token = tokenFrom((await apply(job.slug, { email }).expect(201)).body.trackingUrl);
    const res = await http.get(`/api/v1/careers/applications/${token}`).expect(200);
    expect(trackingSchema.strict().parse(res.body)).toMatchObject({
      jobTitle: job.title,
      publicStatus: 'RECEIVED',
    });

    const application = await prisma.application.findFirstOrThrow({
      where: { candidate: { email } },
    });
    await prisma.application.update({
      where: { id: application.id },
      data: { stage: 'SHORTLISTED' },
    });
    expect((await http.get(`/api/v1/careers/applications/${token}`)).body.publicStatus).toBe(
      'IN_REVIEW',
    );
    await prisma.application.update({
      where: { id: application.id },
      data: { stage: 'REJECTED', rejectReason: 'Internal note' },
    });
    const closed = await http.get(`/api/v1/careers/applications/${token}`).expect(200);
    expect(closed.body.publicStatus).toBe('CLOSED');
    expect(JSON.stringify(closed.body)).not.toContain('Internal note');

    await http.get(`/api/v1/careers/applications/${'x'.repeat(43)}`).expect(404);
    await http.get('/api/v1/careers/applications/not-a-token!').expect(404);
  });

  it('turns a deletion request into an audited HR task', async () => {
    const job = await newJob();
    const email = `amal-${randomUUID()}@candidate.test`;
    const token = tokenFrom((await apply(job.slug, { email }).expect(201)).body.trackingUrl);
    await http
      .post(`/api/v1/careers/applications/${token}/data-request`)
      .send({ type: 'DELETE' })
      .expect(202);
    const candidate = await prisma.candidate.findFirstOrThrow({ where: { email } });
    const dsr = await prisma.dataSubjectRequest.findFirstOrThrow({
      where: { candidateId: candidate.id },
    });
    expect(dsr).toMatchObject({ type: 'DELETE', status: 'OPEN' });
    expect(
      await prisma.task.count({ where: { entityType: 'data_subject_request', entityId: dsr.id } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: 'DATA_REQUEST_DELETE', entityId: candidate.id },
      }),
    ).toBe(1);
  });

  it('limits applications to 5 per hour per IP (429)', async () => {
    const job = await newJob();
    const before = process.env.THROTTLE_IN_TESTS;
    process.env.THROTTLE_IN_TESTS = 'true';
    try {
      // The limit is checked before validation, so quick invalid requests count too.
      for (let i = 0; i < 5; i += 1) await apply(job.slug, { consent: 'no' }).expect(400);
      await apply(job.slug, { consent: 'no' }).expect(429);
    } finally {
      process.env.THROTTLE_IN_TESTS = before;
    }
  });
});
