# Changelog

All notable user-visible changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Planning documents: PRD, user stories with acceptance criteria, API contract, security model.
- Monorepo scaffold: `apps/api` (NestJS), `apps/web` (React + Vite), `packages/shared`, `e2e` (Playwright).
- `GET /api/v1/health`: public health check with database status, used by uptime monitoring.
- One standard API error shape `{ code, message, details, traceId }` and strict request validation.
- Web home page showing live system status, with light and dark mode.
- CI pipeline (lint, format, typecheck, tests, build, audit, E2E), CodeQL, Dependabot, and the Render/Vercel deploy configuration.
