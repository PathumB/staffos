# Changelog

All notable user-visible changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
