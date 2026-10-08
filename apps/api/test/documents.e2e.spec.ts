import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { documentSchema, type RoleCode } from '@staffos/shared';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { StorageService } from '../src/infra/storage/storage.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(120_000);

type U = { id: string; token: string };
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 0x20)]);
const day = 86_400_000;
const isoIn = (days: number) => new Date(Date.now() + days * day).toISOString().slice(0, 10);

describeWithDb('Documents', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let hr: U, rec: U, rec2: U;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    const make = async (role: RoleCode): Promise<U> => {
      const user = await createUser(app, { roles: [role] });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    [hr, rec, rec2] = (await Promise.all(
      (['HR_MANAGER', 'RECRUITER', 'RECRUITER'] as const).map(make),
    )) as [U, U, U];
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
  const upload = (
    u: U,
    fields: Record<string, string>,
    file: { data: Buffer; name: string } | null = { data: PDF, name: 'scan.pdf' },
  ) => {
    const req = http.post('/api/v1/documents').set(auth(u));
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return file ? req.attach('file', file.data, file.name) : req;
  };
  const candidateOf = async (u: U) =>
    prisma.candidate.create({
      data: {
        firstName: 'Lina',
        lastName: 'Haddad',
        email: `lina-${randomUUID()}@candidate.test`,
        source: 'MANUAL',
        createdById: u.id,
      },
    });
  const employeeWithLogin = async () => {
    const user = await createUser(app, { roles: ['EMPLOYEE'] });
    const employee = await prisma.employee.create({
      data: {
        employeeNumber: `EMP-D${randomUUID().slice(0, 8)}`,
        userId: user.id,
        firstName: 'Samir',
        lastName: 'Aziz',
        email: `samir-${randomUUID()}@test.staffos`,
        hireDate: new Date('2026-06-01T00:00:00Z'),
        status: 'ACTIVE',
      },
    });
    return { employee, me: { id: user.id, token: (await login(app, user.email)).accessToken } };
  };

  it('stores an identity document for HR, masks its number and warns when already expired', async () => {
    const { employee } = await employeeWithLogin();
    const res = await upload(hr, {
      ownerType: 'EMPLOYEE',
      ownerId: employee.id,
      type: 'PASSPORT',
      number: 'N12345678',
      issueDate: '2016-01-01',
      expiryDate: '2026-01-01',
    }).expect(201);
    const doc = documentSchema.parse(res.body);
    expect(doc).toMatchObject({
      type: 'PASSPORT',
      number: '••••5678',
      expiryStatus: 'EXPIRED',
      warnings: ['ALREADY_EXPIRED'],
      mimeType: 'application/pdf',
      fileName: 'scan.pdf',
    });
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row.storageKey).toMatch(new RegExp(`^employee/${employee.id}/[0-9a-f-]{36}\\.pdf$`));
  });

  it('keeps identity documents away from recruiters (403) but lets them handle CVs', async () => {
    const candidate = await candidateOf(rec);
    const cv = await upload(rec, {
      ownerType: 'CANDIDATE',
      ownerId: candidate.id,
      type: 'CV',
    }).expect(201);
    expect(
      (
        await upload(rec, {
          ownerType: 'CANDIDATE',
          ownerId: candidate.id,
          type: 'PASSPORT',
        }).expect(403)
      ).body.code,
    ).toBe('IDENTITY_DOCUMENT_FORBIDDEN');
    const passport = await upload(hr, {
      ownerType: 'CANDIDATE',
      ownerId: candidate.id,
      type: 'PASSPORT',
    }).expect(201);

    const list = await http
      .get(`/api/v1/documents?ownerType=CANDIDATE&ownerId=${candidate.id}`)
      .set(auth(rec))
      .expect(200);
    expect(list.body.map((d: { id: string }) => d.id)).toEqual([cv.body.id]);
    await http.get(`/api/v1/documents/${passport.body.id}/url`).set(auth(rec)).expect(403);
    // Another recruiter can't see this candidate at all.
    await http.get(`/api/v1/documents/${cv.body.id}/url`).set(auth(rec2)).expect(404);
    await upload(rec2, { ownerType: 'CANDIDATE', ownerId: candidate.id, type: 'CV' }).expect(404);
  });

  it('rejects files that are not what they claim, and missing files (422)', async () => {
    const candidate = await candidateOf(rec);
    const fields = { ownerType: 'CANDIDATE', ownerId: candidate.id, type: 'CV' };
    const exe = await upload(rec, fields, { data: Buffer.from('MZ\x90\x00 fake'), name: 'cv.pdf' });
    expect(exe.status).toBe(422);
    expect(exe.body.code).toBe('INVALID_FILE');
    expect((await upload(rec, fields, null).expect(422)).body.code).toBe('INVALID_FILE');
    await upload(rec, { ...fields, type: 'SELFIE' }).expect(400);
  });

  it('issues a 5-minute signed URL, audits the view, and refuses tampered or expired links', async () => {
    const { employee } = await employeeWithLogin();
    const doc = (
      await upload(hr, { ownerType: 'EMPLOYEE', ownerId: employee.id, type: 'VISA' }).expect(201)
    ).body;
    const res = await http.get(`/api/v1/documents/${doc.id}/url`).set(auth(hr)).expect(200);
    const ttl = Date.parse(res.body.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000);

    const file = await http
      .get(res.body.url)
      .buffer(true)
      .parse((stream, done) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="scan\.pdf"$/);
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(file.body).subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      await prisma.auditLog.count({
        where: { action: 'DOCUMENT_VIEWED', entityId: doc.id, actorId: hr.id },
      }),
    ).toBe(1);

    await http.get(`${res.body.url.slice(0, -3)}abc`).expect(404);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    const expired = await app.get(StorageService).provider.signedUrl(row.storageKey, -1, 'x.pdf');
    await http.get(expired).expect(404);
  });

  it("lets an employee see their own documents (identity included) but nobody else's", async () => {
    const { employee, me } = await employeeWithLogin();
    const other = await employeeWithLogin();
    await upload(hr, { ownerType: 'EMPLOYEE', ownerId: employee.id, type: 'EMIRATES_ID' }).expect(
      201,
    );
    const theirs = await upload(hr, {
      ownerType: 'EMPLOYEE',
      ownerId: other.employee.id,
      type: 'CONTRACT',
    }).expect(201);

    const mine = await http
      .get(`/api/v1/documents?ownerType=EMPLOYEE&ownerId=${employee.id}`)
      .set(auth(me))
      .expect(200);
    expect(mine.body.map((d: { type: string }) => d.type)).toEqual(['EMIRATES_ID']);
    await http.get(`/api/v1/documents/${theirs.body.id}/url`).set(auth(me)).expect(404);
    await upload(me, { ownerType: 'EMPLOYEE', ownerId: other.employee.id, type: 'OTHER' }).expect(
      404,
    );
    await upload(me, { ownerType: 'EMPLOYEE', ownerId: employee.id, type: 'MEDICAL' }).expect(201);
  });

  it('alerts HR once per threshold and opens a renewal task (nightly job)', async () => {
    const { employee } = await employeeWithLogin();
    const doc = (
      await upload(hr, {
        ownerType: 'EMPLOYEE',
        ownerId: employee.id,
        type: 'VISA',
        expiryDate: isoIn(20),
      }).expect(201)
    ).body;
    const service = app.get(DocumentsService);
    const alertsFor = () =>
      prisma.documentExpiryAlert.findMany({
        where: { documentId: doc.id },
        orderBy: { thresholdDays: 'desc' },
      });

    await service.runExpiryCheck();
    expect((await alertsFor()).map((a) => a.thresholdDays)).toEqual([30]);
    expect(await prisma.task.count({ where: { entityType: 'document', entityId: doc.id } })).toBe(
      1,
    );
    expect(
      await prisma.notification.count({
        where: { userId: hr.id, type: 'document.expiring', link: `/employees/${employee.id}` },
      }),
    ).toBe(1);

    await service.runExpiryCheck(); // next night: nothing new
    expect(await alertsFor()).toHaveLength(1);

    await prisma.document.update({
      where: { id: doc.id },
      data: { expiryDate: new Date(`${isoIn(5)}T00:00:00Z`) },
    });
    await service.runExpiryCheck();
    expect((await alertsFor()).map((a) => a.thresholdDays)).toEqual([30, 7]);
    expect(await prisma.task.count({ where: { entityType: 'document', entityId: doc.id } })).toBe(
      2,
    );
  });

  it('soft-deletes and lists expiring documents for HR', async () => {
    const { employee } = await employeeWithLogin();
    const soon = (
      await upload(hr, {
        ownerType: 'EMPLOYEE',
        ownerId: employee.id,
        type: 'PASSPORT',
        expiryDate: isoIn(10),
      }).expect(201)
    ).body;
    const expiring = await http
      .get('/api/v1/documents/expiring?withinDays=30')
      .set(auth(hr))
      .expect(200);
    expect(expiring.body.find((d: { id: string }) => d.id === soon.id)).toMatchObject({
      ownerName: 'Samir Aziz',
      expiryStatus: 'EXPIRING',
    });
    await http.get('/api/v1/documents/expiring').set(auth(rec)).expect(403);

    await http.delete(`/api/v1/documents/${soon.id}`).set(auth(hr)).expect(204);
    const list = await http
      .get(`/api/v1/documents?ownerType=EMPLOYEE&ownerId=${employee.id}`)
      .set(auth(hr))
      .expect(200);
    expect(list.body).toEqual([]);
    expect(
      await prisma.auditLog.count({
        where: { action: 'DELETE', entity: 'document', entityId: soon.id },
      }),
    ).toBe(1);
  });
});
