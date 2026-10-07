# StaffOS — Product Requirements Document

Version 0.1 · 2026-10-07 · Owner: @pathum · Status: Draft for review

Related: [00-master-plan.md](00-master-plan.md) · [02-user-stories.md](02-user-stories.md) · [api-contract.md](api-contract.md) · [security.md](security.md)

---

## 1. Problem

A UAE staffing company (recruitment, contract staffing, manpower supply) runs its business across spreadsheets, email threads, a generic job board and a separate accounting tool. The result:

- Client manpower requests get lost in email; nobody knows which requests are approved, open or overdue.
- Recruiters retype CVs by hand and screen hundreds of applicants without a consistent ranking.
- Stage changes are not recorded, so time-to-hire and funnel numbers are guesses.
- Hired workers' passports, visas and medicals expire without warning, which creates compliance risk and fines.
- Timesheets are collected on paper or WhatsApp, and invoices are built manually from them. Errors cost money and delay payment.
- Management has no single view of open demand, pipeline health or revenue per client.

## 2. Product vision

**StaffOS is one connected system that takes a client's manpower request all the way to a hired worker who is deployed on site, timesheeted and invoiced.** AI helps with repetitive judgement work (CV parsing, ranking, drafting), but people make every decision.

End-to-end flow:

```
Client manpower request (CRM)
  → approval (workflow)
  → job published (careers portal)
  → AI screening
  → interviews
  → offer / hired (automation)
  → onboarding (HR)
  → deployment to client project
  → timesheets
  → invoice (ERP-lite)
```

Dashboards, audit log and notifications span every step.

## 3. Users and roles

| Role | Code | Primary goals | Data visibility |
| --- | --- | --- | --- |
| Super Admin | `SUPER_ADMIN` | Configure users, roles, settings, automation rules; investigate the audit log | Everything |
| HR Manager | `HR_MANAGER` | Approve requests and offers, oversee recruitment and HR, see reports | All recruitment + HR data, including identity documents |
| Recruiter | `RECRUITER` | Fill assigned jobs fast with good candidates | Jobs assigned to them and their applications/candidates |
| Account Manager | `ACCOUNT_MANAGER` | Win and serve clients; raise requests; track deployments and invoices | Clients they own and everything under them |
| Hiring Manager | `HIRING_MANAGER` | Review shortlisted candidates, give interview feedback, approve offers | Jobs where they are the hiring manager, from Shortlisted onwards |
| Finance | `FINANCE` | Approve timesheets, generate and track invoices | All deployments, timesheets, invoices; no candidate CVs |
| Employee | `EMPLOYEE` | Complete onboarding, keep documents current, submit timesheets | Own records only |
| Client user | `CLIENT_USER` | Raise requests, view shortlisted CVs, approve timesheets | Own client company only |
| Candidate | (public, no account) | Find jobs, apply, track status | Own application via a signed tracking link |

The full permission matrix is in [security.md §3](security.md#3-permission-matrix).

## 4. Scope (v1)

| # | Module | Includes |
| --- | --- | --- |
| 1 | Identity and access | Login, refresh, logout, password reset, lockout, roles, permissions, user admin. TOTP 2FA is optional (stretch). |
| 2 | CRM | Clients, contacts, activity notes, manpower requests with an approval rule |
| 3 | Recruitment (ATS) | Jobs, candidates, applications, Kanban pipeline with server-enforced transitions, interviews + feedback, offers |
| 4 | Careers portal | Public job board, apply form with CV upload, application tracking link |
| 5 | HR core | Employees, departments, positions, documents with expiry dates |
| 6 | Onboarding | Checklist templates (documents, medical, visa, IT, induction), plans auto-created on hire, task assignment |
| 7 | Workforce / ERP-lite | Client projects, deployments, weekly timesheets, invoices (PDF) generated from approved timesheets |
| 8 | Workflow engine | Approval chains; automation rules (When event → If conditions → Then actions) with a run log and retry |
| 9 | AI workspace | CV parsing, candidate matching, JD writer, interview kit, "ask your data" |
| 10 | Dashboards and reports | Role dashboards, hiring funnel, time-to-hire, client revenue, open requests; CSV/Excel/PDF export; weekly report email |
| 11 | Notifications | In-app bell, email, outgoing signed webhooks |
| 12 | Administration | Settings, audit log viewer, AI usage and cost log, system health, demo data reset |
| 13 | Client portal | Client users raise requests, view shortlists, approve timesheets, see invoices |
| 14 | Integrations | n8n flows (local), Zoho CRM client/contact sync |

## 5. Out of scope (v1)

- Payroll, WPS salary files and end-of-service calculation (see roadmap)
- Arabic UI / RTL (i18n keys are used so this can be added later)
- Native mobile apps (the web app is responsive to 375 px)
- SSO (Microsoft 365, Google)
- Real payment collection; invoices only track the status `PAID`
- Multi-tenancy (one staffing company per deployment)
- Candidate accounts and logins (candidates use a tracking link instead)
- Visa processing integrations with government portals

## 6. Key business rules

These rules live in services and are covered by unit tests.

| Area | Rule |
| --- | --- |
| Manpower requests | On submit, a request with headcount **> threshold (default 20, set in settings)** goes to `PENDING_APPROVAL` and needs HR Manager approval. Otherwise it is auto-approved. A job can only be opened from an `APPROVED` request. |
| Application stages | `APPLIED → SCREENING → SHORTLISTED → INTERVIEW → OFFER → HIRED`. Only one step forward at a time. `REJECTED` or `WITHDRAWN` can be reached from any non-terminal stage. `HIRED`, `REJECTED` and `WITHDRAWN` are terminal. Anything else returns **409**. |
| Hire | `OFFER → HIRED` requires an `ACCEPTED` offer. In one transaction it creates the employee, creates the onboarding plan from the template for the job's category, and emits `employee.hired`. |
| Stage history | Every transition appends a row to `application_stage_history`. Rows are never updated or deleted. |
| Offers | An offer needs Hiring Manager (or HR Manager) approval before it can be sent. |
| Documents | Identity documents (passport, visa, Emirates ID, labour card) are visible only to HR roles and the owning employee. Every view is audited. |
| Expiry alerts | A nightly job flags documents expiring in **30 days** (configurable). It notifies HR and creates a renewal task, once per document per threshold. |
| Timesheets | Weekly, per deployment. `DRAFT → SUBMITTED → APPROVED / REJECTED → INVOICED`. A client user (own client only) or Finance can approve. Daily hours are 0–16; the weekly total must be > 0. |
| Invoices | Generated per client per period, from `APPROVED` timesheets only. Line = hours × deployment bill rate (integer fils). VAT 5% (configurable). Uses an `Idempotency-Key` header. In one transaction it creates the invoice and lines and marks the timesheets `INVOICED`. An issued invoice is immutable; corrections go through `VOID` + regenerate. |
| Money | Integer minor units (`amountFils`) + `currency` (default `AED`). No floats. |
| AI | Suggestions only. A human confirms parsed fields and decides on candidates. Core flows work when AI is down. |
| Retention | Rejected candidates are anonymised after 12 months (configurable) by a scheduled job. |

## 7. Non-functional requirements

| Category | Requirement |
| --- | --- |
| Performance | Page load < 2 s on seed data; API p95 < 300 ms for list endpoints at 50 concurrent users (k6) |
| Lists | Every list endpoint is paginated, sortable and filterable |
| Audit | Every create/update/delete is audited (actor, action, entity, before/after, IP, timestamp), plus sensitive reads (document views) |
| Security | OWASP Top 10 controls in [security.md](security.md); no high findings in npm audit / CodeQL / ZAP baseline |
| Availability | Core workflow keeps working when AI, email or webhook targets fail; failures are logged and retryable |
| Accessibility | WCAG 2.2 AA contrast, labels on all inputs, keyboard navigation, visible focus; Lighthouse a11y ≥ 90 |
| Responsiveness | Usable down to 375 px |
| Observability | Structured JSON logs with `traceId`; Sentry on web + API; `/api/v1/health` monitored every 5 min |
| Cost | Zero budget: free tiers and open source only (see CLAUDE.md §3) |
| Locale | Times stored in UTC and displayed in `Asia/Dubai`; currency AED; dates DD MMM YYYY |

## 8. Success metrics (demo / portfolio)

- All five critical E2E journeys pass in CI ([00-master-plan.md §7](00-master-plan.md))
- At least 80% unit-test coverage on services
- Seeded demo: 12 clients, ~40 jobs, ~300 candidates, ~80 employees, 6 months of history
- Live URL on HTTPS, deployed only by the pipeline
- CV-parse eval: ≥ 85% field-level accuracy on the 10-CV eval set

## 9. Assumptions and constraints

- One staffing company; all internal users belong to it. Client users belong to exactly one client.
- Candidates do not log in. They receive a tracking link (opaque random token, stored hashed).
- Free-tier limits apply (Neon storage/compute hours, Render sleep, Gemini rate limits, Brevo 300 emails/day). The design keeps traffic low and handles quota errors gracefully.
- Node.js current LTS (24) runs locally and in CI and hosting.
- All seed data is fictional.

## 10. Open questions

| # | Question | Proposed default |
| --- | --- | --- |
| 1 | Can a recruiter move a candidate one stage *back* (e.g. Interview → Shortlisted)? | No in v1; HR Manager can reject instead |
| 2 | Do client users see candidate contact details on shortlisted CVs? | No: name, skills, experience and CV only; email/phone masked |
| 3 | Is VAT always 5%, or are some clients zero-rated (free zones)? | Per-client `vatRateBps` field, default 500 (5%) |
| 4 | Are timesheets weekly for all clients? | Yes in v1 (Mon–Sun weeks) |
| 5 | Does the hiring manager need a login, or is it sometimes a client user? | Internal user in v1; client users can only view shortlists |
