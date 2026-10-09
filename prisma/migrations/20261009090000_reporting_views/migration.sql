-- Reporting views (CLAUDE.md §9). Dashboards, reports and "Ask your data" read only these.
-- Scope columns (client_id, account_manager_id, recruiter_ids) let the API apply data scoping.

CREATE VIEW v_hiring_funnel AS
SELECT a.id AS application_id,
       j.id AS job_id,
       j.title AS job_title,
       c.id AS client_id,
       c.name AS client_name,
       c.account_manager_id,
       ARRAY(SELECT jr.user_id FROM job_recruiters jr WHERE jr.job_id = j.id) AS recruiter_ids,
       s.stage::text AS stage,
       s.reached_at,
       a.applied_at
FROM applications a
JOIN jobs j ON j.id = a.job_id AND j.deleted_at IS NULL
JOIN clients c ON c.id = j.client_id
JOIN LATERAL (
  SELECT 'APPLIED'::application_stage AS stage, a.applied_at AS reached_at
  UNION
  SELECT h.to_stage, MIN(h.changed_at) FROM application_stage_history h
  WHERE h.application_id = a.id GROUP BY h.to_stage
) s ON TRUE;

CREATE VIEW v_time_to_hire AS
SELECT a.id AS application_id,
       j.id AS job_id,
       j.title AS job_title,
       j.category::text AS category,
       c.id AS client_id,
       c.name AS client_name,
       c.account_manager_id,
       ARRAY(SELECT jr.user_id FROM job_recruiters jr WHERE jr.job_id = j.id) AS recruiter_ids,
       a.applied_at,
       a.hired_at,
       ROUND(EXTRACT(EPOCH FROM (a.hired_at - a.applied_at)) / 86400.0, 1)::float8 AS days_to_hire
FROM applications a
JOIN jobs j ON j.id = a.job_id
JOIN clients c ON c.id = j.client_id
WHERE a.stage = 'HIRED' AND a.hired_at IS NOT NULL;

CREATE VIEW v_client_revenue AS
SELECT i.id AS invoice_id,
       i.number AS invoice_number,
       c.id AS client_id,
       c.name AS client_name,
       c.account_manager_id,
       i.status::text AS status,
       i.issue_date,
       date_trunc('month', i.issue_date)::date AS month,
       i.due_date,
       i.paid_on,
       i.subtotal_fils,
       i.vat_fils,
       i.total_fils,
       i.currency
FROM invoices i
JOIN clients c ON c.id = i.client_id
WHERE i.status IN ('ISSUED', 'PAID');

CREATE VIEW v_open_requests AS
SELECT m.id AS manpower_request_id,
       c.id AS client_id,
       c.name AS client_name,
       c.account_manager_id,
       m.role_title,
       m.category::text AS category,
       m.headcount,
       m.status::text AS status,
       m.emirate::text AS emirate,
       m.start_date,
       m.created_at,
       (CURRENT_DATE - m.created_at::date) AS age_days,
       (SELECT COUNT(*)::int FROM applications a JOIN jobs j ON j.id = a.job_id
        WHERE j.manpower_request_id = m.id AND a.stage = 'HIRED') AS hired
FROM manpower_requests m
JOIN clients c ON c.id = m.client_id AND c.deleted_at IS NULL
WHERE m.status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED');

-- Read-only role for "Ask your data": SELECT on the views only. The API switches to it with
-- SET LOCAL ROLE inside a READ ONLY transaction. Skipped (with a notice) where the migrating
-- user may not create roles; the API then still runs read-only with a timeout.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staffos_report_reader') THEN
    CREATE ROLE staffos_report_reader NOLOGIN;
  END IF;
  GRANT USAGE ON SCHEMA public TO staffos_report_reader;
  GRANT SELECT ON v_hiring_funnel, v_time_to_hire, v_client_revenue, v_open_requests
    TO staffos_report_reader;
  EXECUTE format('GRANT staffos_report_reader TO %I', current_user);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'staffos_report_reader not created: %', SQLERRM;
END $$;
