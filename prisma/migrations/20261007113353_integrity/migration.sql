-- Integrity rules that Prisma's schema language cannot express (CLAUDE.md §9).
-- Business rules still live in services; these are the last line of defence so that a bug,
-- a manual SQL session or a future module can't corrupt history, money or ownership.
-- Prisma ignores CHECK constraints, triggers and exclusion constraints when diffing, so later
-- `prisma migrate dev` runs leave them in place.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Append-only tables: audit_logs, application_stage_history
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION staffos_reject_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION staffos_reject_modification();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION staffos_reject_modification();

CREATE TRIGGER application_stage_history_append_only
  BEFORE UPDATE OR DELETE ON "application_stage_history"
  FOR EACH ROW EXECUTE FUNCTION staffos_reject_modification();

CREATE TRIGGER application_stage_history_no_truncate
  BEFORE TRUNCATE ON "application_stage_history"
  FOR EACH STATEMENT EXECUTE FUNCTION staffos_reject_modification();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Issued invoices are immutable (docs/01-PRD.md §6)
--    After DRAFT only the lifecycle fields may change: status, paid_on, void_reason,
--    pdf_storage_key, version, updated_at. Lines can only change while the invoice is DRAFT.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION staffos_invoice_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'invoice % is % and cannot be deleted', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND (
       NEW.client_id, NEW.number, NEW.period_start, NEW.period_end, NEW.issue_date, NEW.due_date,
       NEW.currency, NEW.subtotal_fils, NEW.vat_rate_bps, NEW.vat_fils, NEW.total_fils
     ) IS DISTINCT FROM (
       OLD.client_id, OLD.number, OLD.period_start, OLD.period_end, OLD.issue_date, OLD.due_date,
       OLD.currency, OLD.subtotal_fils, OLD.vat_rate_bps, OLD.vat_fils, OLD.total_fils
     ) THEN
    RAISE EXCEPTION 'invoice % is % and can no longer be changed', OLD.id, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_immutable_after_issue
  BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION staffos_invoice_immutable();

CREATE OR REPLACE FUNCTION staffos_invoice_lines_draft_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  invoice_status invoice_status;
BEGIN
  SELECT status INTO invoice_status FROM "invoices"
   WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  -- invoice_status is NULL when the parent invoice is being deleted (cascade from a DRAFT).
  IF invoice_status IS NOT NULL AND invoice_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'lines of a % invoice cannot be changed', invoice_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER invoice_lines_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON "invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION staffos_invoice_lines_draft_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. No overlapping active deployments per employee (US-DEP-01)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A NULL end_date is an open-ended deployment (unbounded range).
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_no_overlap"
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status IN ('PLANNED', 'ACTIVE'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Exactly-one-owner rules (real FKs instead of polymorphic owners)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "documents" ADD CONSTRAINT "documents_one_owner"
  CHECK (num_nonnulls(candidate_id, employee_id) = 1);

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_one_subject"
  CHECK (
    num_nonnulls(manpower_request_id, offer_id) = 1
    AND (subject = 'MANPOWER_REQUEST') = (manpower_request_id IS NOT NULL)
    AND (subject = 'OFFER') = (offer_id IS NOT NULL)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Value checks
-- ─────────────────────────────────────────────────────────────────────────────

-- Identity
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK (email = lower(email));
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_count_non_negative" CHECK (failed_login_count >= 0);

-- CRM
ALTER TABLE "clients" ADD CONSTRAINT "clients_trn_format" CHECK (trn IS NULL OR trn ~ '^[0-9]{15}$');
ALTER TABLE "clients" ADD CONSTRAINT "clients_vat_rate_range" CHECK (vat_rate_bps BETWEEN 0 AND 10000);
ALTER TABLE "clients" ADD CONSTRAINT "clients_payment_terms_non_negative" CHECK (payment_terms_days >= 0);

ALTER TABLE "manpower_requests" ADD CONSTRAINT "manpower_requests_headcount_positive" CHECK (headcount >= 1);
ALTER TABLE "manpower_requests" ADD CONSTRAINT "manpower_requests_duration_positive"
  CHECK (duration_months IS NULL OR duration_months >= 1);
ALTER TABLE "manpower_requests" ADD CONSTRAINT "manpower_requests_bill_rate_range"
  CHECK (
    (bill_rate_min_fils IS NULL OR bill_rate_min_fils >= 0)
    AND (bill_rate_max_fils IS NULL OR bill_rate_max_fils >= 0)
    AND (bill_rate_min_fils IS NULL OR bill_rate_max_fils IS NULL OR bill_rate_max_fils >= bill_rate_min_fils)
  );

-- Recruitment
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_headcount_positive" CHECK (headcount >= 1);
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salary_range"
  CHECK (
    (salary_min_fils IS NULL OR salary_min_fils >= 0)
    AND (salary_max_fils IS NULL OR salary_max_fils >= 0)
    AND (salary_min_fils IS NULL OR salary_max_fils IS NULL OR salary_max_fils >= salary_min_fils)
  );
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_min_years_non_negative" CHECK (min_years IS NULL OR min_years >= 0);
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_experience_non_negative"
  CHECK (total_experience_months IS NULL OR total_experience_months >= 0);
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_years_non_negative" CHECK (years IS NULL OR years >= 0);
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_real_change"
  CHECK (from_stage IS NULL OR from_stage <> to_stage);
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_duration_range" CHECK (duration_min BETWEEN 5 AND 480);
ALTER TABLE "offers" ADD CONSTRAINT "offers_salary_non_negative" CHECK (salary_fils >= 0);
ALTER TABLE "offers" ADD CONSTRAINT "offers_contract_months_positive" CHECK (contract_months IS NULL OR contract_months >= 1);
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_score_bounds"
  CHECK (
    pre_score BETWEEN 0 AND 100
    AND adjustment BETWEEN -10 AND 10
    AND score BETWEEN 0 AND 100
  );

-- HR
ALTER TABLE "employees" ADD CONSTRAINT "employees_salary_non_negative" CHECK (salary_fils IS NULL OR salary_fils >= 0);
ALTER TABLE "documents" ADD CONSTRAINT "documents_size_range" CHECK (size_bytes BETWEEN 1 AND 10485760);
ALTER TABLE "documents" ADD CONSTRAINT "documents_dates_order"
  CHECK (issue_date IS NULL OR expiry_date IS NULL OR expiry_date >= issue_date);
ALTER TABLE "document_expiry_alerts" ADD CONSTRAINT "document_expiry_alerts_threshold_positive" CHECK (threshold_days >= 0);

-- ERP-lite
ALTER TABLE "projects" ADD CONSTRAINT "projects_dates_order"
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_bill_rate_non_negative" CHECK (bill_rate_fils >= 0);
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_dates_order" CHECK (end_date IS NULL OR end_date >= start_date);
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_week_starts_monday" CHECK (EXTRACT(ISODOW FROM week_start) = 1);
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_total_non_negative" CHECK (total_minutes >= 0);
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_minutes_range" CHECK (minutes BETWEEN 0 AND 960);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_consistent"
  CHECK (
    subtotal_fils >= 0 AND vat_fils >= 0
    AND vat_rate_bps BETWEEN 0 AND 10000
    AND total_fils = subtotal_fils + vat_fils
  );
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_period_order" CHECK (period_end >= period_start);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_amounts_non_negative"
  CHECK (minutes >= 0 AND rate_fils >= 0 AND amount_fils >= 0);
ALTER TABLE "invoice_number_sequences" ADD CONSTRAINT "invoice_number_sequences_last_value_non_negative" CHECK (last_value >= 0);

-- Workflow / AI / platform
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_order_positive" CHECK (step_order >= 1);
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_step_positive" CHECK (current_step >= 1);
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_attempts_non_negative" CHECK (attempts >= 0);
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_metrics_non_negative"
  CHECK (input_tokens >= 0 AND output_tokens >= 0 AND estimated_cost_micro_usd >= 0 AND latency_ms >= 0);
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_attempts_non_negative" CHECK (attempts >= 0);
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_https_only" CHECK (url ~ '^https://');
