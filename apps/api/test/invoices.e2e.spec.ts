import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { invoiceSchema, type RoleCode } from '@staffos/shared';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { DomainEventsService } from '../src/infra/events/domain-events.service';
import { createTestApp } from './utils/create-test-app';
import { createUser, login } from './utils/fixtures';

const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;
jest.setTimeout(180_000);

type U = { id: string; token: string };
/** Supertest parser that keeps a binary body (PDF) as a Buffer. */
const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream; // superagent passes the raw stream
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
};

describeWithDb('Invoices', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let finance: U, am: U;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    const make = async (role: RoleCode, clientId?: string): Promise<U> => {
      const user = await createUser(app, { roles: [role], clientId });
      return { id: user.id, token: (await login(app, user.email)).accessToken };
    };
    [finance, am] = (await Promise.all([make('FINANCE'), make('ACCOUNT_MANAGER')])) as [U, U];
    makeUser = make;
  });
  let makeUser: (role: RoleCode, clientId?: string) => Promise<U>;

  afterAll(async () => {
    await app.close();
  });

  const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

  /**
   * A client (5% VAT, 30-day terms) with two deployed workers and timesheets:
   * September: worker A 2 approved weeks (2 × 40 h at AED 45), worker B 1 approved week
   * (20 h at AED 50), plus one submitted week; October: one approved week (outside the period).
   */
  async function billingFixture() {
    const client = await prisma.client.create({
      data: {
        name: `Billing Client ${randomUUID().slice(0, 6)}`,
        industry: 'CONSTRUCTION',
        city: 'Dubai',
        emirate: 'DUBAI',
        vatRateBps: 500,
        paymentTermsDays: 30,
        accountManagerId: am.id,
      },
    });
    const project = await prisma.project.create({
      data: { clientId: client.id, name: 'Marina Tower' },
    });
    const sheet = async (
      deploymentId: string,
      employeeId: string,
      weekStart: string,
      minutes: number,
      status: 'APPROVED' | 'SUBMITTED',
    ) =>
      prisma.timesheet.create({
        data: {
          deploymentId,
          employeeId,
          clientId: client.id,
          weekStart: new Date(`${weekStart}T00:00:00Z`),
          totalMinutes: minutes,
          status,
        },
      });
    const deployWorker = async (rate: number) => {
      const employee = await prisma.employee.create({
        data: {
          employeeNumber: `EMP-I${randomUUID().slice(0, 8)}`,
          firstName: 'Worker',
          lastName: randomUUID().slice(0, 6),
          email: `w-${randomUUID()}@test.staffos`,
          hireDate: new Date('2026-08-01T00:00:00Z'),
          status: 'ACTIVE',
        },
      });
      const deployment = await prisma.deployment.create({
        data: {
          employeeId: employee.id,
          projectId: project.id,
          clientId: client.id,
          startDate: new Date('2026-09-01T00:00:00Z'),
          billRateFils: rate,
          status: 'ACTIVE',
        },
      });
      return { employee, deployment };
    };
    const a = await deployWorker(4_500);
    const b = await deployWorker(5_000);
    const sheets = [
      await sheet(a.deployment.id, a.employee.id, '2026-09-07', 2_400, 'APPROVED'),
      await sheet(a.deployment.id, a.employee.id, '2026-09-14', 2_400, 'APPROVED'),
      await sheet(b.deployment.id, b.employee.id, '2026-09-07', 1_200, 'APPROVED'),
      await sheet(b.deployment.id, b.employee.id, '2026-09-14', 600, 'SUBMITTED'),
      await sheet(a.deployment.id, a.employee.id, '2026-10-05', 2_400, 'APPROVED'),
    ];
    return { client, sheets };
  }

  const generate = (
    clientId: string,
    key?: string,
    period = { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
  ) => {
    const req = http.post('/api/v1/invoices/generate').set(auth(finance));
    if (key) req.set('Idempotency-Key', key);
    return req.send({ clientId, ...period });
  };

  it('bills approved weeks in the period: one line per deployment, 5% VAT, integer fils', async () => {
    const { client, sheets } = await billingFixture();
    const res = await generate(client.id).expect(201);
    const invoice = invoiceSchema.parse(res.body);
    expect(invoice).toMatchObject({
      status: 'DRAFT',
      number: null,
      subtotalFils: 460_000, // 80 h × 4,500 + 20 h × 5,000
      vatRateBps: 500,
      vatFils: 23_000,
      totalFils: 483_000,
      timesheetCount: 3,
    });
    expect(invoice.lines?.map((l) => [l.minutes, l.rateFils, l.amountFils]).sort()).toEqual(
      [
        [1_200, 5_000, 100_000],
        [4_800, 4_500, 360_000],
      ].sort(),
    );
    const statuses = await prisma.timesheet.findMany({
      where: { id: { in: sheets.map((s) => s.id) } },
      select: { id: true, status: true },
    });
    const byId = Object.fromEntries(statuses.map((s) => [s.id, s.status]));
    expect(sheets.map((s) => byId[s.id])).toEqual([
      'INVOICED',
      'INVOICED',
      'INVOICED',
      'SUBMITTED',
      'APPROVED',
    ]);

    await http
      .post('/api/v1/invoices/generate')
      .set(auth(am))
      .send({ clientId: client.id, periodStart: '2026-10-01', periodEnd: '2026-10-31' })
      .expect(403);
    const clientUser = await makeUser('CLIENT_USER', client.id);
    await http.get(`/api/v1/invoices/${invoice.id}`).set(auth(clientUser)).expect(404); // drafts are internal
    await http.get(`/api/v1/invoices/${invoice.id}`).set(auth(am)).expect(200);
  });

  it('returns the same invoice for a repeated Idempotency-Key and refuses key reuse', async () => {
    const { client } = await billingFixture();
    const key = `gen-${randomUUID()}`;
    const first = await generate(client.id, key).expect(201);
    const second = await generate(client.id, key).expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.invoice.count({ where: { clientId: client.id } })).toBe(1);
    expect(
      (
        await generate(client.id, key, {
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
        }).expect(409)
      ).body.code,
    ).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('refuses an empty period (422)', async () => {
    const { client } = await billingFixture();
    expect(
      (
        await generate(client.id, undefined, {
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
        }).expect(422)
      ).body.code,
    ).toBe('NOTHING_TO_INVOICE');
  });

  it('issues: numbers it, emits invoice.issued, builds the PDF and freezes the amounts', async () => {
    const emit = jest.spyOn(app.get(DomainEventsService), 'emit');
    const { client } = await billingFixture();
    const draft = (await generate(client.id).expect(201)).body;
    const issued = await http
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set(auth(finance))
      .send({ version: draft.version })
      .expect(200);
    expect(issued.body.number).toMatch(/^INV-\d{4}-\d{6}$/);
    const days = (Date.parse(issued.body.dueDate) - Date.parse(issued.body.issueDate)) / 86_400_000;
    expect(days).toBe(30);
    expect(emit).toHaveBeenCalledWith(
      'INVOICE_ISSUED',
      expect.objectContaining({ invoiceId: draft.id, totalFils: 483_000 }),
    );

    const link = await http.get(`/api/v1/invoices/${draft.id}/pdf`).set(auth(finance)).expect(200);
    const pdf = await http.get(link.body.url).buffer(true).parse(binary).expect(200);
    expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');

    // The database refuses changes to an issued invoice's amounts (immutability trigger).
    await expect(
      prisma.invoice.update({ where: { id: draft.id }, data: { totalFils: 1 } }),
    ).rejects.toThrow();
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } })).totalFils).toBe(
      483_000,
    );
    const clientUser = await makeUser('CLIENT_USER', client.id);
    await http.get(`/api/v1/invoices/${draft.id}`).set(auth(clientUser)).expect(200);
  });

  it('voids with a reason and releases its timesheets; then it cannot be paid', async () => {
    const { client } = await billingFixture();
    const draft = (await generate(client.id).expect(201)).body;
    const issued = (
      await http
        .post(`/api/v1/invoices/${draft.id}/issue`)
        .set(auth(finance))
        .send({ version: draft.version })
        .expect(200)
    ).body;
    await http
      .post(`/api/v1/invoices/${draft.id}/void`)
      .set(auth(finance))
      .send({ version: issued.version })
      .expect(400);
    const voided = await http
      .post(`/api/v1/invoices/${draft.id}/void`)
      .set(auth(finance))
      .send({ version: issued.version, reason: 'Wrong period' })
      .expect(200);
    expect(voided.body).toMatchObject({
      status: 'VOID',
      voidReason: 'Wrong period',
      timesheetCount: 0,
    });
    expect(
      await prisma.timesheet.count({ where: { clientId: client.id, status: 'APPROVED' } }),
    ).toBe(4);
    expect(
      (
        await http
          .post(`/api/v1/invoices/${draft.id}/mark-paid`)
          .set(auth(finance))
          .send({ version: voided.body.version, paidOn: '2026-12-01' })
          .expect(409)
      ).body.code,
    ).toBe('INVALID_INVOICE_TRANSITION');
    // Released hours can be billed again.
    await generate(client.id).expect(201);
  });

  it('marks an issued invoice paid, not before its issue date', async () => {
    const { client } = await billingFixture();
    const draft = (await generate(client.id).expect(201)).body;
    const issued = (
      await http
        .post(`/api/v1/invoices/${draft.id}/issue`)
        .set(auth(finance))
        .send({ version: draft.version })
        .expect(200)
    ).body;
    await http
      .post(`/api/v1/invoices/${draft.id}/mark-paid`)
      .set(auth(finance))
      .send({ version: issued.version, paidOn: '2020-01-01' })
      .expect(400);
    const paid = await http
      .post(`/api/v1/invoices/${draft.id}/mark-paid`)
      .set(auth(finance))
      .send({ version: issued.version, paidOn: issued.issueDate })
      .expect(200);
    expect(paid.body).toMatchObject({ status: 'PAID', paidOn: issued.issueDate });
  });
});
