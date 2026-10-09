import { guardSql, UnsafeQueryError } from './sql-guard';

describe('guardSql (US-AI-02)', () => {
  const ok = (sql: string) => expect(() => guardSql(sql)).not.toThrow();
  const refused = (sql: string) => expect(() => guardSql(sql)).toThrow(UnsafeQueryError);

  it('allows one SELECT over the reporting views and caps the rows', () => {
    const sql = guardSql(
      'SELECT client_name, COUNT(*) AS open FROM v_open_requests WHERE age_days > 30 GROUP BY client_name;',
    );
    expect(sql).toMatch(/^SELECT \* FROM \(SELECT client_name/);
    expect(sql).toMatch(/LIMIT 501$/);
    ok(
      'WITH m AS (SELECT month, SUM(total_fils) t FROM v_client_revenue GROUP BY month) SELECT * FROM m',
    );
    ok('SELECT EXTRACT(YEAR FROM hired_at) y, AVG(days_to_hire) FROM v_time_to_hire GROUP BY 1');
    ok(
      "SELECT stage FROM v_hiring_funnel f JOIN v_time_to_hire t ON t.job_id = f.job_id WHERE f.stage = 'delete'",
    );
    ok('SELECT * FROM (SELECT client_name FROM v_open_requests) x');
  });

  it('refuses other tables, writes, multiple statements and tricks', () => {
    refused('SELECT * FROM users');
    refused('SELECT * FROM public.users');
    refused('SELECT * FROM v_open_requests JOIN users ON true');
    refused('DELETE FROM v_open_requests');
    refused('SELECT 1; DROP TABLE users');
    refused('SELECT * FROM v_open_requests; SELECT 1');
    refused('SELECT * FROM v_open_requests -- comment');
    refused('SELECT * FROM v_open_requests /* x */');
    refused('SELECT pg_sleep(10) FROM v_open_requests');
    refused('SELECT * FROM generate_series(1, 10)');
    refused('SELECT * INTO copy_t FROM v_open_requests');
    refused('SELECT * FROM "users"');
    refused('WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x');
    refused('SELECT $$a$$ FROM v_open_requests');
    refused('SET ROLE postgres');
    refused('');
  });

  it('ignores forbidden words inside string literals', () => {
    ok("SELECT client_name FROM v_open_requests WHERE role_title = 'Update; DROP users'");
  });
});
