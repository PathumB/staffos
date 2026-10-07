# StaffOS — Entity Relationship Diagram

Version 0.1 · 2026-10-07 · Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma)

The database has **55 tables in 9 areas**, PostgreSQL 18 on Neon. The diagrams below show keys and the columns that drive business rules; the full column list is in the schema. GitHub renders these Mermaid diagrams natively.

Conventions (CLAUDE.md §9):
- UUID v7 primary keys.
- `snake_case` tables and columns.
- `created_at` / `updated_at` / `created_by_id` on business tables; `deleted_at` soft delete on clients, contacts, jobs, candidates, employees, documents, automation rules and webhooks.
- Money as integer `*_fils` plus `currency` (default `AED`); durations as integer minutes.
- `version` for optimistic locking on records with state transitions.
- Every foreign key is indexed (asserted by a test).

## 1. Overview: the business flow across areas

```mermaid
flowchart LR
  subgraph CRM
    C[clients] --> MR[manpower_requests]
  end
  subgraph Recruitment
    J[jobs] --> A[applications]
    CA[candidates] --> A
    A --> SH[application_stage_history]
    A --> I[interviews]
    A --> O[offers]
  end
  subgraph HR
    E[employees] --> D[documents]
    E --> OP[onboarding_plans]
  end
  subgraph ERP-lite
    P[projects] --> DEP[deployments]
    DEP --> T[timesheets]
    T --> INV[invoices]
  end
  MR --> J
  A -- hired --> E
  C --> P
  E --> DEP
  C --> INV
```

## 2. Identity and access

```mermaid
erDiagram
  users ||--o{ user_roles : has
  roles ||--o{ user_roles : grants
  roles ||--o{ role_permissions : has
  permissions ||--o{ role_permissions : in
  users ||--o{ refresh_tokens : owns
  refresh_tokens |o--o| refresh_tokens : "replaced_by (rotation)"
  users ||--o{ auth_tokens : owns
  clients |o--o{ users : "client portal users"

  users {
    uuid id PK
    text email UK "lower-case (CHECK)"
    text password_hash "argon2id, null until invited user sets it"
    user_status status
    uuid client_id FK "CLIENT_USER only"
    int failed_login_count
    timestamptz locked_until
  }
  roles {
    uuid id PK
    role_code code UK
  }
  permissions {
    uuid id PK
    text code UK "resource:action"
  }
  refresh_tokens {
    uuid id PK
    uuid user_id FK
    uuid family_id "reuse detection"
    text token_hash UK
    timestamptz expires_at
    timestamptz revoked_at
  }
  auth_tokens {
    uuid id PK
    uuid user_id FK
    auth_token_type type
    text token_hash UK
    timestamptz used_at
  }
```

## 3. CRM

```mermaid
erDiagram
  users ||--o{ clients : "account manager"
  clients ||--o{ client_contacts : has
  clients ||--o{ activities : timeline
  client_contacts |o--o{ activities : about
  client_contacts |o--o| users : "portal user"
  clients ||--o{ manpower_requests : raises
  projects |o--o{ manpower_requests : for

  clients {
    uuid id PK
    text name
    industry industry
    text trn UK "15 digits (CHECK)"
    int vat_rate_bps "500 = 5%"
    emirate emirate
    client_status status
    uuid account_manager_id FK
    text zoho_id UK
  }
  client_contacts {
    uuid id PK
    uuid client_id FK
    uuid portal_user_id FK, UK
  }
  activities {
    uuid id PK
    uuid client_id FK
    uuid contact_id FK
    activity_type type
    timestamptz occurred_at
  }
  manpower_requests {
    uuid id PK
    uuid client_id FK
    uuid project_id FK
    text role_title
    job_category category
    int headcount "≥ 1 (CHECK)"
    date start_date
    int bill_rate_min_fils
    int bill_rate_max_fils
    manpower_request_status status
    int version
  }
```

## 4. Recruitment (ATS)

```mermaid
erDiagram
  manpower_requests ||--o{ jobs : opens
  clients ||--o{ jobs : for
  users ||--o{ jobs : "hiring manager"
  jobs ||--o{ job_recruiters : "assigned to"
  users ||--o{ job_recruiters : recruiter
  jobs ||--o{ job_skills : requires
  candidates ||--o{ candidate_skills : has
  candidates ||--o{ applications : submits
  jobs ||--o{ applications : receives
  applications ||--o{ application_stage_history : "append-only"
  applications ||--o{ interviews : has
  interviews ||--o{ interview_interviewers : with
  interviews ||--o{ interview_feedback : gets
  applications ||--o{ offers : gets
  applications ||--o{ match_results : "AI score"

  jobs {
    uuid id PK
    uuid manpower_request_id FK
    uuid client_id FK "denormalised for scoping"
    text slug UK "careers URL"
    job_status status
    uuid hiring_manager_id FK
    int version
  }
  job_skills {
    uuid id PK
    uuid job_id FK
    text name
    skill_weight weight "MUST | NICE"
    int min_years
  }
  candidates {
    uuid id PK
    text email "not unique: duplicates detected in service"
    int total_experience_months
    candidate_source source
    timestamptz consent_at
    timestamptz anonymised_at "retention job"
  }
  applications {
    uuid id PK
    uuid candidate_id FK
    uuid job_id FK "UK with candidate_id"
    application_stage stage
    int version
    text tracking_token_hash UK
  }
  application_stage_history {
    uuid id PK
    uuid application_id FK
    application_stage from_stage
    application_stage to_stage
    uuid changed_by_id FK
    timestamptz changed_at
  }
  interviews {
    uuid id PK
    uuid application_id FK
    timestamptz scheduled_at
    interview_mode mode
  }
  interview_feedback {
    uuid id PK
    uuid interview_id FK "UK with interviewer_id"
    uuid interviewer_id FK
    jsonb scores
    recommendation recommendation
  }
  offers {
    uuid id PK
    uuid application_id FK
    int salary_fils
    offer_status status
    uuid approved_by_id FK
    int version
  }
```

## 5. HR core and onboarding

```mermaid
erDiagram
  candidates |o--o| employees : "hired as"
  applications |o--o| employees : "hired from"
  users |o--o| employees : "login"
  departments |o--o{ employees : in
  positions |o--o{ employees : holds
  departments |o--o{ positions : has
  employees |o--o{ documents : owns
  candidates |o--o{ documents : owns
  documents ||--o{ document_expiry_alerts : "alerted at"
  onboarding_templates ||--o{ onboarding_template_tasks : defines
  onboarding_templates |o--o{ onboarding_plans : "copied into"
  employees ||--o| onboarding_plans : has
  onboarding_plans ||--o{ onboarding_tasks : contains
  documents |o--o{ onboarding_tasks : evidence

  employees {
    uuid id PK
    text employee_number UK
    uuid user_id FK, UK
    uuid candidate_id FK, UK
    uuid application_id FK, UK
    employee_status status
    date hire_date
  }
  documents {
    uuid id PK
    uuid candidate_id FK "exactly one owner (CHECK)"
    uuid employee_id FK "exactly one owner (CHECK)"
    document_type type
    text storage_key UK "private bucket"
    int size_bytes "≤ 10 MB (CHECK)"
    date expiry_date
  }
  document_expiry_alerts {
    uuid id PK
    uuid document_id FK "UK with threshold_days"
    int threshold_days
  }
  onboarding_templates {
    uuid id PK
    job_category category UK
  }
  onboarding_plans {
    uuid id PK
    uuid employee_id FK, UK
    onboarding_plan_status status
  }
  onboarding_tasks {
    uuid id PK
    uuid plan_id FK
    role_code assignee_role
    uuid assignee_id FK
    date due_date
    onboarding_task_status status
  }
```

## 6. Workforce / ERP-lite

```mermaid
erDiagram
  clients ||--o{ projects : runs
  projects ||--o{ deployments : staffs
  employees ||--o{ deployments : "deployed on"
  deployments ||--o{ timesheets : "weekly"
  timesheets ||--o{ timesheet_entries : "daily"
  clients ||--o{ invoices : billed
  invoices ||--o{ invoice_lines : has
  deployments ||--o{ invoice_lines : "billed for"
  invoices |o--o{ timesheets : covers

  deployments {
    uuid id PK
    uuid employee_id FK "no overlap while PLANNED/ACTIVE (EXCLUDE)"
    uuid project_id FK
    uuid client_id FK
    date start_date
    date end_date
    int bill_rate_fils
    deployment_status status
  }
  timesheets {
    uuid id PK
    uuid deployment_id FK "UK with week_start"
    date week_start "Monday (CHECK)"
    timesheet_status status
    int total_minutes
    uuid invoice_id FK
    int version
  }
  timesheet_entries {
    uuid id PK
    uuid timesheet_id FK "UK with date"
    date date
    int minutes "0–960 (CHECK)"
  }
  invoices {
    uuid id PK
    text number UK "INV-YYYY-NNNNNN on issue"
    uuid client_id FK
    invoice_status status "immutable after DRAFT (trigger)"
    int subtotal_fils
    int vat_fils
    int total_fils "= subtotal + vat (CHECK)"
  }
  invoice_lines {
    uuid id PK
    uuid invoice_id FK
    uuid deployment_id FK
    int minutes
    int rate_fils
    int amount_fils
  }
  invoice_number_sequences {
    int year PK
    int last_value
  }
```

## 7. Workflow engine and automation

```mermaid
erDiagram
  workflow_definitions ||--o{ workflow_steps : "ordered steps"
  workflow_definitions ||--o{ approval_requests : runs
  manpower_requests |o--o{ approval_requests : "subject"
  offers |o--o{ approval_requests : "subject"
  approval_requests ||--o{ approval_decisions : records
  automation_rules ||--o{ automation_runs : logs

  workflow_steps {
    uuid id PK
    uuid workflow_id FK "UK with step_order"
    role_code approver_role
  }
  approval_requests {
    uuid id PK
    workflow_subject subject "exactly one subject FK (CHECK)"
    uuid manpower_request_id FK
    uuid offer_id FK
    int current_step
    approval_status status
  }
  approval_decisions {
    uuid id PK
    uuid approval_request_id FK
    approval_decision_type decision
    uuid decided_by_id FK
  }
  automation_rules {
    uuid id PK
    automation_event event
    jsonb conditions
    jsonb actions
    boolean active
  }
  automation_runs {
    uuid id PK
    uuid rule_id FK
    run_status status
    jsonb payload
    int attempts
  }
  tasks {
    uuid id PK
    uuid assignee_id FK
    role_code assignee_role
    text entity_type "display link, no FK"
    uuid entity_id
    task_status status
  }
```

## 8. AI

```mermaid
erDiagram
  users |o--o{ ai_requests : "made by"
  ai_requests ||--o{ ai_results : produced
  ai_requests |o--o{ match_results : produced
  applications ||--o{ match_results : scored

  ai_requests {
    uuid id PK
    ai_feature feature
    text provider
    text model
    text prompt_version
    int input_tokens
    int output_tokens
    int estimated_cost_micro_usd
    int latency_ms
    ai_request_status status
  }
  ai_results {
    uuid id PK
    uuid ai_request_id FK
    jsonb output "AI-assisted suggestion"
    timestamptz confirmed_at "human confirmation"
  }
  match_results {
    uuid id PK
    uuid application_id FK "UK with prompt_version"
    int pre_score "deterministic"
    int adjustment "LLM, -10..10 (CHECK)"
    int score "0..100"
  }
```

## 9. Platform

```mermaid
erDiagram
  users ||--o{ notifications : receives
  users |o--o{ audit_logs : "actor"
  webhooks ||--o{ webhook_deliveries : sends
  candidates ||--o{ data_subject_requests : requests

  audit_logs {
    uuid id PK "append-only (trigger)"
    uuid actor_id FK "null = system / public"
    text action
    text entity
    text entity_id
    jsonb before
    jsonb after
    text trace_id
  }
  notifications {
    uuid id PK
    uuid user_id FK
    timestamptz read_at
  }
  webhooks {
    uuid id PK
    text url "https only (CHECK)"
    webhook_event[] events
    text secret "encrypted at rest"
  }
  webhook_deliveries {
    uuid id PK
    uuid webhook_id FK
    delivery_status status
    int attempts
    timestamptz next_attempt_at
  }
  settings {
    text key PK
    jsonb value
  }
  idempotency_keys {
    text scope PK
    text key PK
    text request_hash
    jsonb response_body
    timestamptz expires_at
  }
  data_subject_requests {
    uuid id PK
    uuid candidate_id FK
    data_request_type type
    data_request_status status
  }
```

## 10. Rules enforced by the database (`*_integrity` migration)

| Rule | Mechanism |
| --- | --- |
| `audit_logs` and `application_stage_history` are append-only | `BEFORE UPDATE/DELETE/TRUNCATE` triggers |
| Issued invoices and their lines can't change; only lifecycle fields (status, paid_on, void_reason, PDF key) | Triggers on `invoices` and `invoice_lines` |
| One employee can't have overlapping planned/active deployments | `EXCLUDE USING gist` on employee + date range (`btree_gist`) |
| A document has exactly one owner; an approval has exactly one subject | `CHECK (num_nonnulls(...) = 1)` |
| Headcount ≥ 1, money ≥ 0, ranges ordered, VAT 0–100%, invoice total = subtotal + VAT | `CHECK` constraints |
| Timesheet weeks start on Monday; 0–16 h per day | `CHECK` constraints |
| Match score 0–100 with an AI adjustment of at most ±10 | `CHECK` constraint |
| Emails stored lower-case; webhook URLs are HTTPS | `CHECK` constraints |

All of these are covered by `apps/api/test/schema.db.spec.ts` against a real Postgres.

**Not yet in the database (planned):**
- The reporting views (`v_hiring_funnel`, `v_time_to_hire`, `v_client_revenue`, `v_open_requests`) and the read-only role are added with the reports module.
- pg-boss creates its own `pgboss` schema at runtime.
