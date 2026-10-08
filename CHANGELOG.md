# Changelog

All notable user-visible changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
