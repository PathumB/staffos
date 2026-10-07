import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

/**
 * Real-database tests for the rules in prisma/migrations/*_integrity and CLAUDE.md §9.
 * Every test runs inside a transaction that is rolled back, so the test database stays clean.
 */
const describeWithDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;

jest.setTimeout(60_000);

// Postgres SQLSTATE codes asserted below.
const CHECK_VIOLATION = '23514';
const EXCLUSION_VIOLATION = '23P01';
const RESTRICT_VIOLATION = '23001';

describeWithDb('database integrity rules', () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: process.env.DATABASE_URL_TEST });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query('BEGIN');
  });

  afterEach(async () => {
    await db.query('ROLLBACK');
  });

  /** Runs a statement expected to fail, inside a savepoint so the outer transaction survives. */
  async function expectSqlError(sql: string, params: unknown[], code: string): Promise<void> {
    await db.query('SAVEPOINT expect_error');
    try {
      await db.query(sql, params);
    } catch (error) {
      expect((error as { code?: string }).code).toBe(code);
      return;
    } finally {
      await db.query('ROLLBACK TO SAVEPOINT expect_error');
    }
    throw new Error(`Expected SQLSTATE ${code}, but the statement succeeded: ${sql}`);
  }

  // ── Minimal fixtures (raw SQL: updated_at has no DB default because Prisma sets it) ──

  async function insertUser(): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO users (id, email, first_name, last_name, updated_at)
       VALUES ($1, $2, 'Test', 'User', now())`,
      [id, `user-${id}@example.test`],
    );
    return id;
  }

  async function insertClient(): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO clients (id, name, industry, city, emirate, account_manager_id, updated_at)
       VALUES ($1, 'Gulf Build Contracting (test)', 'CONSTRUCTION', 'Dubai', 'DUBAI', $2, now())`,
      [id, await insertUser()],
    );
    return id;
  }

  async function insertEmployee(): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO employees (id, employee_number, first_name, last_name, email, hire_date, updated_at)
       VALUES ($1, $2, 'Omar', 'Test', 'omar@example.test', '2026-01-01', now())`,
      [id, `EMP-${id.slice(0, 8)}`],
    );
    return id;
  }

  async function insertDeployment(
    employeeId: string,
    clientId: string,
    start: string,
    end: string | null,
    status = 'ACTIVE',
  ): Promise<string> {
    const projectId = randomUUID();
    await db.query(
      `INSERT INTO projects (id, client_id, name, updated_at) VALUES ($1, $2, $3, now())`,
      [projectId, clientId, `Project ${projectId}`],
    );
    const id = randomUUID();
    await db.query(
      `INSERT INTO deployments (id, employee_id, project_id, client_id, start_date, end_date,
                                bill_rate_fils, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 4500, $7, now())`,
      [id, employeeId, projectId, clientId, start, end, status],
    );
    return id;
  }

  async function insertApplication(): Promise<string> {
    const clientId = await insertClient();
    const hiringManagerId = await insertUser();
    const requestId = randomUUID();
    await db.query(
      `INSERT INTO manpower_requests (id, client_id, role_title, category, headcount, location,
                                      emirate, start_date, updated_at)
       VALUES ($1, $2, 'Heavy Driver', 'DRIVER', 10, 'Jebel Ali', 'DUBAI', '2026-11-01', now())`,
      [requestId, clientId],
    );
    const jobId = randomUUID();
    await db.query(
      `INSERT INTO jobs (id, manpower_request_id, client_id, title, slug, category, location,
                         emirate, headcount, hiring_manager_id, updated_at)
       VALUES ($1, $2, $3, 'Heavy Driver', $4, 'DRIVER', 'Jebel Ali', 'DUBAI', 10, $5, now())`,
      [jobId, requestId, clientId, `heavy-driver-${jobId}`, hiringManagerId],
    );
    const candidateId = randomUUID();
    await db.query(
      `INSERT INTO candidates (id, first_name, last_name, email, source, updated_at)
       VALUES ($1, 'Aisha', 'Test', 'aisha@example.test', 'MANUAL', now())`,
      [candidateId],
    );
    const id = randomUUID();
    await db.query(
      `INSERT INTO applications (id, candidate_id, job_id, updated_at) VALUES ($1, $2, $3, now())`,
      [id, candidateId, jobId],
    );
    return id;
  }

  async function insertDraftInvoice(clientId: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO invoices (id, client_id, period_start, period_end, subtotal_fils, vat_rate_bps,
                             vat_fils, total_fils, updated_at)
       VALUES ($1, $2, '2026-09-01', '2026-09-30', 100000, 500, 5000, 105000, now())`,
      [id, clientId],
    );
    return id;
  }

  // ── Conventions (CLAUDE.md §9) ──

  it('has an index whose leading column covers every foreign key', async () => {
    const { rows } = await db.query<{ table: string; column: string }>(`
      SELECT c.conrelid::regclass::text AS table, a.attname AS column
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND c.connamespace = 'public'::regnamespace
         AND NOT EXISTS (
           SELECT 1 FROM pg_index i
            WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
         )
       ORDER BY 1, 2`);
    expect(rows).toEqual([]);
  });

  it('uses uuid primary keys on every table with a surrogate id', async () => {
    const { rows } = await db.query<{ table_name: string; data_type: string }>(`
      SELECT table_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'id' AND data_type <> 'uuid'
         AND table_name <> '_prisma_migrations'`);
    expect(rows).toEqual([]);
  });

  // ── Append-only history ──

  it('rejects UPDATE, DELETE and TRUNCATE on audit_logs', async () => {
    const id = randomUUID();
    await db.query(`INSERT INTO audit_logs (id, action, entity) VALUES ($1, 'CREATE', 'client')`, [
      id,
    ]);

    await expectSqlError(
      `UPDATE audit_logs SET action = 'X' WHERE id = $1`,
      [id],
      RESTRICT_VIOLATION,
    );
    await expectSqlError(`DELETE FROM audit_logs WHERE id = $1`, [id], RESTRICT_VIOLATION);
    await expectSqlError(`TRUNCATE audit_logs`, [], RESTRICT_VIOLATION);
  });

  it('rejects changes to application_stage_history and no-op transitions', async () => {
    const applicationId = await insertApplication();
    const id = randomUUID();
    await db.query(
      `INSERT INTO application_stage_history (id, application_id, to_stage) VALUES ($1, $2, 'APPLIED')`,
      [id, applicationId],
    );

    await expectSqlError(
      `UPDATE application_stage_history SET to_stage = 'HIRED' WHERE id = $1`,
      [id],
      RESTRICT_VIOLATION,
    );
    await expectSqlError(
      `INSERT INTO application_stage_history (id, application_id, from_stage, to_stage)
       VALUES ($1, $2, 'SCREENING', 'SCREENING')`,
      [randomUUID(), applicationId],
      CHECK_VIOLATION,
    );
  });

  // ── Ownership ──

  it('requires a document to have exactly one owner', async () => {
    const employeeId = await insertEmployee();
    const insertDocument = `
      INSERT INTO documents (id, candidate_id, employee_id, type, file_name, storage_key,
                             mime_type, size_bytes, updated_at)
      VALUES ($1, $2, $3, 'PASSPORT', 'passport.pdf', $4, 'application/pdf', 1024, now())`;

    await expectSqlError(insertDocument, [randomUUID(), null, null, randomUUID()], CHECK_VIOLATION);
    await db.query(insertDocument, [randomUUID(), null, employeeId, randomUUID()]);
  });

  it('rejects documents over 10 MB', async () => {
    await expectSqlError(
      `INSERT INTO documents (id, employee_id, type, file_name, storage_key, mime_type, size_bytes, updated_at)
       VALUES ($1, $2, 'CV', 'cv.pdf', $3, 'application/pdf', 10485761, now())`,
      [randomUUID(), await insertEmployee(), randomUUID()],
      CHECK_VIOLATION,
    );
  });

  // ── Workforce ──

  it('rejects overlapping active deployments for the same employee', async () => {
    const employeeId = await insertEmployee();
    const clientId = await insertClient();
    await insertDeployment(employeeId, clientId, '2026-10-01', '2026-12-31');

    await expectSqlError(
      `INSERT INTO deployments (id, employee_id, project_id, client_id, start_date, end_date,
                                bill_rate_fils, status, updated_at)
       SELECT $1, employee_id, project_id, client_id, '2026-12-01', NULL, 4500, 'PLANNED', now()
         FROM deployments WHERE employee_id = $2 LIMIT 1`,
      [randomUUID(), employeeId],
      EXCLUSION_VIOLATION,
    );
    // Back-to-back and ended deployments are fine.
    await insertDeployment(employeeId, clientId, '2027-01-01', null);
    await insertDeployment(employeeId, clientId, '2026-11-01', '2026-11-30', 'ENDED');
  });

  it('enforces timesheet week start on Monday and 0–16 h per day', async () => {
    const employeeId = await insertEmployee();
    const clientId = await insertClient();
    const deploymentId = await insertDeployment(employeeId, clientId, '2026-10-01', null);
    const insertTimesheet = `
      INSERT INTO timesheets (id, deployment_id, employee_id, client_id, week_start, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())`;

    // 2026-10-07 is a Wednesday; 2026-10-05 is a Monday.
    await expectSqlError(
      insertTimesheet,
      [randomUUID(), deploymentId, employeeId, clientId, '2026-10-07'],
      CHECK_VIOLATION,
    );
    const timesheetId = randomUUID();
    await db.query(insertTimesheet, [
      timesheetId,
      deploymentId,
      employeeId,
      clientId,
      '2026-10-05',
    ]);

    const insertEntry = `INSERT INTO timesheet_entries (id, timesheet_id, date, minutes) VALUES ($1, $2, $3, $4)`;
    await expectSqlError(
      insertEntry,
      [randomUUID(), timesheetId, '2026-10-05', 961],
      CHECK_VIOLATION,
    );
    await db.query(insertEntry, [randomUUID(), timesheetId, '2026-10-05', 600]);
  });

  // ── Money ──

  it('requires invoice total = subtotal + VAT', async () => {
    await expectSqlError(
      `INSERT INTO invoices (id, client_id, period_start, period_end, subtotal_fils, vat_rate_bps,
                             vat_fils, total_fils, updated_at)
       VALUES ($1, $2, '2026-09-01', '2026-09-30', 100000, 500, 5000, 999999, now())`,
      [randomUUID(), await insertClient()],
      CHECK_VIOLATION,
    );
  });

  it('freezes an invoice and its lines once issued', async () => {
    const clientId = await insertClient();
    const deploymentId = await insertDeployment(
      await insertEmployee(),
      clientId,
      '2026-09-01',
      null,
    );
    const invoiceId = await insertDraftInvoice(clientId);
    const insertLine = `
      INSERT INTO invoice_lines (id, invoice_id, deployment_id, description, minutes, rate_fils, amount_fils)
      VALUES ($1, $2, $3, 'Heavy driver — Sep 2026', 1200, 5000, 100000)`;
    await db.query(insertLine, [randomUUID(), invoiceId, deploymentId]);

    // Issuing (DRAFT → ISSUED with number and dates) is allowed.
    await db.query(
      `UPDATE invoices SET status = 'ISSUED', number = $2, issue_date = '2026-10-01',
                          due_date = '2026-10-31' WHERE id = $1`,
      [invoiceId, `INV-TEST-${invoiceId.slice(0, 8)}`],
    );

    await expectSqlError(
      `UPDATE invoices SET subtotal_fils = 1, vat_fils = 0, total_fils = 1 WHERE id = $1`,
      [invoiceId],
      RESTRICT_VIOLATION,
    );
    await expectSqlError(insertLine, [randomUUID(), invoiceId, deploymentId], RESTRICT_VIOLATION);
    await expectSqlError(`DELETE FROM invoices WHERE id = $1`, [invoiceId], RESTRICT_VIOLATION);

    // Lifecycle changes are still allowed.
    await db.query(`UPDATE invoices SET status = 'PAID', paid_on = '2026-10-20' WHERE id = $1`, [
      invoiceId,
    ]);
  });

  // ── Identity ──

  it('stores emails in lower case only', async () => {
    await expectSqlError(
      `INSERT INTO users (id, email, first_name, last_name, updated_at)
       VALUES ($1, 'Mixed.Case@Example.test', 'A', 'B', now())`,
      [randomUUID()],
      CHECK_VIOLATION,
    );
  });
});
