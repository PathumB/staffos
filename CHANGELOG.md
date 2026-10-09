# Changelog

All notable user-visible changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Approval chains: Super Admins define ordered approval steps (one role each) for manpower requests and offers. Each step's role approves in turn; a rejection at any step ends it. "My approvals" lists what is waiting on you.
- Automations: rules built without code (When an event happens, If conditions match, Then create a task, send an email, notify, assign a user, start an approval or call a webhook). Every run is logged with its input, result and error; failed runs can be retried and rules can be tested with sample data. Seeded rules: hire follow-ups, passport expiring in 30 days, and HR approval for requests over 20 people.
- Webhooks: register https endpoints for application stage changes, hires and issued invoices. Deliveries are signed (`X-StaffOS-Signature`), retried up to 5 times with backoff, logged, and can be redelivered; secrets are shown once and can be rotated.
- AI assistance (labelled "AI-assisted suggestion"; a person always confirms): create a candidate from a CV (fields pre-filled, unsure ones highlighted, CV attached), rank applicants by match score with reasons (skills check plus a small AI adjustment; name, age, gender and nationality are never used), draft a job description with an inclusive-language check, generate an interview kit and summarise interview feedback. When AI is unavailable everything still works manually. Admins see every AI call and the monthly cost.
- Invoices: Finance generates a draft invoice per client and period from approved timesheets (one line per worker, hours × rate, VAT at the client's rate, all in whole fils), then issues it with a yearly number (INV-2026-000123) and a downloadable PDF tax invoice. Issued invoices cannot be changed; they can be voided with a reason (their hours become invoiceable again) or marked paid. Repeated generate requests are safe (Idempotency-Key).
- Deployments: account managers (or HR) deploy employees to client projects with dates and an hourly bill rate. Overlapping deployments are refused; deploying before onboarding is finished needs an HR Manager and a reason. Statuses move from planned to active to ended automatically.
- Timesheets: employees (or HR on their behalf) enter daily hours for a week and submit them; the client and Finance are notified. The client approves or returns them with a comment; returned timesheets can be corrected and resubmitted. Bulk approve for approvers.
- Careers site (public): browse open roles by keyword, emirate and category (client names only when allowed), apply with a CV and consent (bot check with Cloudflare Turnstile, 5 applications per hour per network), get a confirmation email with a private tracking link showing a simple status, and request a copy or deletion of your data. New applicants appear in the job's pipeline and the recruiter is notified.
- Documents: upload CVs, passports, visas, Emirates IDs, labour cards, medicals and contracts for candidates and employees (PDF, Word, JPG, PNG up to 10 MB). Files are private; downloads use a link valid for 5 minutes and every view is recorded. Identity documents are visible only to HR and the employee. Numbers are masked.
- Expiry alerts: every morning HR is alerted (in the app and by email) 30 and 7 days before a passport, visa, Emirates ID, labour card or medical expires, and a renewal task is created. An "Expiring documents" page lists what needs renewing.
- Employees: list and profile for every hired person (department, position, status, start date, pay for HR/Finance), edits with a full audit trail, and "Invite to StaffOS" so a new hire can sign in. Employees see only their own profile and can update their own contact details. Terminating someone cancels their open onboarding and closes their login.
- Onboarding: each new hire gets a checklist (documents, medical, visa, induction) with due dates from their start date. HR and the employee tick off their own tasks; HR can reassign, reschedule or reopen. When every required task is done, the employee becomes active and HR is notified. HR maintains the checklists per job category.
- Notifications: a bell with unread count and the latest notifications; each is also emailed.
- Departments and positions for HR.
- Interviews: schedule, reschedule or cancel from the application page; the candidate and each interviewer get an email with a calendar invite in Dubai time. Interviewers submit a scorecard (1–5 per criterion, a recommendation and notes) that they can edit for 24 hours; recruiters are notified when the whole panel has scored. New "Interviews" list.
- Offers: create an offer (salary, start date, contract), approval by the job's hiring manager or HR, then sent, accepted or declined, or withdrawn.
- Hire: once the offer is accepted, "Hire" creates the employee record and an onboarding plan from the job category's checklist in one step, marks the job filled when its headcount is reached, and notifies the account manager.
- Default UAE onboarding checklists (documents, medical, visa, Emirates ID, induction), with versions for drivers, healthcare and construction.
- Recruitment (ATS): open jobs from approved requests (recruiters, hiring manager, skills), publish/hold/close; candidates with skills and duplicate detection; applications on a Kanban pipeline (drag-and-drop or "Move to" menu) where candidates move one stage at a time, with reasons for rejections and a full stage history. Hiring managers and clients only see shortlisted candidates; clients never see contact details.
- Demo recruitment data: three open jobs with candidates at every stage.
- CRM: clients (TRN, VAT, payment terms), contacts with client-portal invitations, activity timeline and projects. Account managers see only their own clients; client users only their own company.
- Manpower requests: draft → submit → automatic approval up to 20 people, HR Manager approval above that (threshold configurable), reject with reason, cancel. Client users raise requests that their account manager reviews.
- Demo CRM data: four fictional client companies with contacts, a project and requests in each state.
- Sign-in with lockout after 5 failed attempts, password reset by email, invitations, and sessions that survive reloads (rotating refresh cookie) and sign out everywhere on password change.
- Roles and permissions for 8 roles, enforced on every API route; admin pages for users (invite, edit roles, deactivate), the permission matrix and the audit log.
- App shell with sidebar navigation (drawer on mobile), account menu, light/dark mode and a role-aware dashboard.
- Demo accounts for every role (fictional).
- Data model: 55 tables across identity, CRM, recruitment, HR, onboarding, ERP-lite, workflow, AI and platform, with an ERD in `docs/erd.md`.
- Database-level integrity: append-only audit log and stage history, immutable issued invoices, no overlapping deployments, and value checks on money, hours and ranges.
- Planning documents: PRD, user stories with acceptance criteria, API contract, security model.
- Monorepo scaffold: `apps/api` (NestJS), `apps/web` (React + Vite), `packages/shared`, `e2e` (Playwright).
- `GET /api/v1/health`: public health check with database status, used by uptime monitoring.
- One standard API error shape `{ code, message, details, traceId }` and strict request validation.
- Web home page showing live system status, with light and dark mode.
- CI pipeline (lint, format, typecheck, tests, build, audit, E2E), CodeQL, Dependabot, and the Render/Vercel deploy configuration.
