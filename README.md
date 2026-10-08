# StaffOS

[![CI](https://github.com/PathumB/staffos/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/PathumB/staffos/actions/workflows/ci.yml) [![CodeQL](https://github.com/PathumB/staffos/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/PathumB/staffos/actions/workflows/codeql.yml)

**An AI-powered workforce and recruitment platform for a staffing company** — one connected system from a client's manpower request to a hired worker deployed on site, timesheeted and invoiced.

```
Client request (CRM) → approval → job published → AI screening → interviews → offer / hired
  → onboarding (HR) → deployment → timesheets → invoice (ERP-lite)
```

> Status: **foundation, access control and CRM**. Sign-in, roles and permissions, user administration, the audit log, clients and manpower requests with HR approval, recruitment (jobs, candidates, Kanban pipeline, interviews, offers and hiring), employees, onboarding checklists, documents with expiry alerts, notifications and the public careers site (/careers) are live. Business modules land one at a time; see [CHANGELOG.md](CHANGELOG.md).

## Tech stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript (strict) everywhere |
| Front end | React 18, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, React Router |
| Back end | Node.js 24 LTS, NestJS 12 (modular monolith), Swagger at `/api/docs` |
| Data | PostgreSQL on Neon (free), Prisma 7 |
| Jobs | pg-boss (Postgres-backed, no Redis) |
| AI | `LlmProvider` interface: Gemini (default, free tier), Claude, OpenAI, Mock |
| Tests | Jest + Supertest (API), Vitest + RTL (web), Playwright (E2E) |
| Hosting | Vercel (web) · Render free (API, native Node build) · Neon (DB) |

Zero budget, no Docker, no vendor lock-in. Rules for contributors (human or AI) are in [CLAUDE.md](CLAUDE.md).

## Run locally

Prerequisites: Node.js 24+ and pnpm 10 (`npm i -g pnpm@10`).

```bash
pnpm install
cp .env.example .env      # then fill in DATABASE_URL (see below)
pnpm dev                  # web on http://localhost:5173, API on http://localhost:3000
```

- API health: http://localhost:3000/api/v1/health
- Swagger: http://localhost:3000/api/docs
- The web app calls `/api/*` on its own origin; Vite proxies it to the API, just as Vercel does in production.

Without a database, everything still starts: `/health` reports `db: error` (HTTP 503) and the home page shows the database as unavailable.

### Demo accounts

After `pnpm db:seed` (fictional data). Every account uses the password **`StaffOS-Demo-2026!`**. With `VITE_DEMO_MODE=true`, the login page shows one-click shortcuts.

| Role | Email |
| --- | --- |
| Super Admin | admin@staffos.demo |
| HR Manager | hr@staffos.demo |
| Recruiter | recruiter@staffos.demo |
| Account Manager | am@staffos.demo |
| Hiring Manager | hm@staffos.demo |
| Finance | finance@staffos.demo |
| Employee | employee@staffos.demo |
| Client user (Gulf Build Contracting LLC) | client@staffos.demo |

Invitation and password-reset emails are printed in the API log while `MAIL_PROVIDER=console`.

### Database (Neon, free)

1. Create a project at [neon.tech](https://neon.tech). The project uses AWS us-east-2 (Ohio), Postgres 18; Render (`render.yaml`) runs in the same region.
2. Create branches `dev` and `test` from the default (production) branch.
3. Copy each branch's **direct** (non-pooled) connection string into `.env`: `dev` → `DATABASE_URL`, `test` → `DATABASE_URL_TEST`. Use `sslmode=verify-full`.
4. `pnpm db:migrate` then `pnpm db:seed`.

`pnpm test` reads `DATABASE_URL_TEST` from `.env` and never touches the dev database. The free tier suspends idle compute, so the first query after a pause takes about 3 s.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Shared package (watch) + API + web together |
| `pnpm --filter api dev` / `pnpm --filter web dev` | One app only |
| `pnpm lint` | ESLint, zero warnings allowed |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | Unit + integration tests (API integration tests against Postgres need `DATABASE_URL_TEST`) |
| `pnpm test:e2e` | Playwright against the built apps (run `pnpm build` first; first time: `pnpm --filter e2e install-browsers`). Locally it uses the `test` database branch and seeds the demo accounts there |
| `pnpm build` | Build shared, API and web |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Prisma client, migrations (dev branch), seed data |
| `pnpm db:migrate:test` | Apply migrations to the test database (`pnpm test` does this automatically) |
| `pnpm db:studio` | Browse the dev database in Prisma Studio (http://localhost:5555) |

## Repository layout

```
apps/web          React app: internal app, /careers, /client-portal
apps/api          NestJS API: src/common (filters, pipes, decorators), src/infra (prisma, …), src/modules
packages/shared   Zod schemas and types shared by web + api
prisma/           schema.prisma, migrations, seed.ts
e2e/              Playwright tests
docs/             PRD, user stories, API contract, security, master plan
.github/workflows CI, CodeQL, deploy
```

## Documentation

- [Master plan](docs/00-master-plan.md)
- [PRD](docs/01-PRD.md)
- [User stories and acceptance criteria](docs/02-user-stories.md)
- [API contract](docs/api-contract.md)
- [Security](docs/security.md)
- [ERD / data model](docs/erd.md)
- [AI development log](docs/ai-dev-log.md)

## Deployment

- **API → Render:** create the service from [render.yaml](render.yaml) (Blueprint). Set `DATABASE_URL`, `CORS_ORIGINS` and `APP_URL`. Auto-deploy is off; [deploy.yml](.github/workflows/deploy.yml) migrates the database and triggers Render's deploy hook after CI passes on `main`.
- **Web → Vercel:** import the repo with Root Directory `apps/web`. [vercel.json](apps/web/vercel.json) rewrites `/api/*` to the Render URL, which keeps the refresh cookie first-party. Update the Render hostname there if yours differs.
- **Uptime:** an UptimeRobot HTTP monitor on `/api/v1/health` every 5 minutes (it also keeps the free Render instance awake).

All data in this project is fictional.
