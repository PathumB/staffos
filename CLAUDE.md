# CLAUDE.md — StaffOS

Rules for Claude Code in this repository. Read this file fully before every task.

## 1. What we are building

StaffOS is an AI-powered workforce and recruitment platform for a staffing company. It covers the full flow:

Client manpower request (CRM) → approval (workflow) → job published (careers portal) → AI screening → interviews → offer / hired (automation) → onboarding (HR) → deployment to client project → timesheets → invoice (ERP-lite).

Dashboards, audit log and notifications span every step.

This is a portfolio project that must be **production quality**: secure, tested, documented, deployed via CI/CD.

## 2. Source of truth

Read the relevant document before starting any task. If documents conflict, this file wins, then the docs below in order.

- `docs/00-master-plan.md` — full plan (where it conflicts with section 3 of this file, follow this file)
- `docs/01-PRD.md` — scope, users, modules
- `docs/02-user-stories.md` — stories + acceptance criteria (definition of done)
- `docs/api-contract.md` — endpoints and payloads
- `prisma/schema.prisma` — data model
- `docs/security.md` — security controls

## 3. Hard constraints

1. **Zero budget.** Use only free tiers and open-source libraries. Never add a paid service or a dependency that requires a paid plan.
2. **No Docker locally.** Do not create docker-compose files or require Docker to develop, test or run the app. Everything runs with Node.js + pnpm.
3. **No vendor lock-in in business code.** Every external service (AI, email, storage, CRM) is used through an interface with swappable providers.

## 4. Final tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) everywhere | No `any` unless justified in a comment |
| Monorepo | pnpm workspaces | `apps/web`, `apps/api`, `packages/shared` |
| Front end | React 18 + Vite, Tailwind CSS, shadcn/ui, lucide-react | Responsive down to 375 px |
| Front-end data | TanStack Query, TanStack Table, React Hook Form + Zod, React Router | |
| Charts | Recharts | |
| Back end | Node.js 24 LTS + NestJS 12 | Modular monolith |
| ORM / DB | Prisma + PostgreSQL on **Neon (free)** | Branches: `dev`, `test`, `main` (production) |
| Background jobs + cron | **pg-boss** (Postgres-backed queue) | No Redis. Runs in the API process |
| File storage | `StorageProvider` → `LocalDiskStorage` (dev) / `SupabaseStorage` (prod, free, private bucket, signed URLs) | |
| Email | `MailProvider` → Ethereal/console (dev) / **Brevo SMTP free** (prod) | Nodemailer |
| AI | `LlmProvider` → **GeminiProvider (free tier, default)**, ClaudeProvider, OpenAiProvider, MockProvider (tests) | Provider chosen per feature in settings |
| PDF | pdfkit | Invoices, reports |
| Auth | JWT access token (15 min, in memory on the client) + rotating refresh token in httpOnly cookie, argon2 hashing | |
| API docs | @nestjs/swagger at `/api/docs` | |
| Logging | pino (nestjs-pino), structured JSON, `traceId` per request | |
| Errors | Sentry free (web + api) | |
| Tests | Jest + Supertest (api), Vitest + RTL (web), Playwright (E2E) | |
| CI/CD | GitHub Actions | Postgres service container in CI only |
| Hosting | Web: **Vercel free**. API: **Render free web service** (native Node build, no Docker). DB: Neon free | |
| Uptime | UptimeRobot free, pings `/api/v1/health` every 5 min | Also keeps Render awake |
| Low-code | n8n run locally with `npx n8n`; workflows exported to `automation/` | |

**Same-origin rule:** the web app calls the API via a Vercel rewrite (`/api/*` → Render URL) so the refresh cookie is first-party. Never rely on cross-site cookies.

## 5. Repository layout

```
staffos/
├── apps/
│   ├── web/                # React app: internal app, /careers, /client-portal
│   └── api/
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── common/     # guards, decorators, filters, interceptors, pagination, errors
│           ├── infra/      # prisma, jobs (pg-boss), storage, mail, llm providers
│           └── modules/    # one folder per business module (see below)
├── packages/shared/        # Zod schemas, enums, types shared by web + api
├── prisma/                 # schema.prisma, migrations/, seed.ts
├── docs/
├── automation/             # n8n workflow JSON exports
├── e2e/                    # Playwright
└── .github/workflows/      # ci.yml, deploy.yml
```

Business modules: `auth`, `users`, `clients`, `manpower-requests`, `jobs`, `candidates`, `applications`, `interviews`, `offers`, `careers`, `employees`, `documents`, `onboarding`, `deployments`, `timesheets`, `invoices`, `workflows`, `automations`, `ai`, `reports`, `notifications`, `audit`, `webhooks`, `integrations`, `settings`, `health`.

## 6. Commands

```
pnpm install
pnpm dev                 # web + api together
pnpm --filter api dev
pnpm --filter web dev
pnpm db:migrate          # prisma migrate dev + generate (dev branch)
pnpm db:migrate:test     # apply migrations to DATABASE_URL_TEST (pnpm test also does this)
pnpm db:studio           # browse the dev database at http://localhost:5555
pnpm db:seed
pnpm lint
pnpm format              # prettier --write (format:check in CI)
pnpm typecheck
pnpm test                # unit + integration
pnpm test:e2e            # Playwright (needs `pnpm build`; first run: pnpm --filter e2e install-browsers)
pnpm build
pnpm db:generate         # prisma generate
```

Keep these scripts working. If you add a script, document it here.

## 7. Back-end rules (NestJS)

- Each module has: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `*.spec.ts`. Add a repository class only when queries are complex.
- **Controllers are thin**: HTTP mapping, DTO validation, guards. No business logic.
- **Services hold business rules** (stage transitions, approval logic, invoice totals).
- Every endpoint has `@UseGuards(JwtAuthGuard, PermissionsGuard)` and `@RequirePermissions(...)` unless explicitly public (`@Public()`), e.g. careers portal, login, health.
- **Data scoping**: services must filter by what the user may see (client, assigned jobs, own records). Never trust IDs from the request alone — prevents IDOR.
- Every create/update/delete calls `AuditService.record({ actor, action, entity, entityId, before, after })`.
- Validation with `class-validator` DTOs or Zod schemas from `packages/shared`. Reject unknown fields (`whitelist`, `forbidNonWhitelisted`).
- State changes go through explicit action endpoints with server-side transition rules, e.g. `POST /applications/:id/transition`.
- Long or external work (AI, email, webhooks, PDF) runs as pg-boss jobs; the request returns quickly.
- External calls: timeout, retry with backoff, logged result. Failures must never break the core workflow.
- Use transactions for multi-row business operations (hire → create employee + onboarding plan; invoice generation).

## 8. API conventions

- Base path `/api/v1`, JSON, kebab-case paths, camelCase fields.
- Lists: `?page=1&pageSize=20&sort=-createdAt&search=&filter[status]=OPEN` → `{ data, meta: { page, pageSize, total } }`.
- Errors (global exception filter), always:
  `{ "code": "CANDIDATE_NOT_FOUND", "message": "Candidate not found.", "details": {}, "traceId": "..." }`
- Status codes: 200/201/204, 400 validation, 401, 403, 404, 409 conflict/invalid transition, 422 business rule, 429 rate limit.
- Swagger decorators on every controller and DTO.
- Outgoing webhooks signed with HMAC-SHA256 header `X-StaffOS-Signature`.
- Invoice generation accepts an `Idempotency-Key` header.

## 9. Database rules (Prisma + Postgres)

- UUID primary keys; `createdAt`, `updatedAt`, `createdById` on business tables; `deletedAt` soft delete where history matters.
- Foreign keys and unique constraints enforced in the schema.
- Index every foreign key and common filters (`status`, `clientId`, `createdAt`).
- `application_stage_history` is append-only.
- Money as integer minor units (`amountFils`) + `currency` (default `AED`).
- Reporting via SQL views created in migrations (`v_hiring_funnel`, `v_time_to_hire`, `v_client_revenue`, `v_open_requests`). The AI "ask your data" feature may only query these views, using a read-only DB role, with `LIMIT` and `statement_timeout`.
- Never edit an applied migration; create a new one.
- Seed data: fictional UAE staffing companies and people only. No real personal data.

## 10. Front-end rules (React)

- Feature folders: `src/features/<module>/` with `api.ts` (TanStack Query hooks), `components/`, `pages/`, `schemas.ts`.
- Shared UI in `src/components/ui` (shadcn). Do not hand-roll components that exist there.
- Forms: React Hook Form + Zod schema from `packages/shared` (same validation as the API).
- Every page handles loading, empty, error and permission-denied states.
- Tables: server-side pagination, sorting, filtering; column visibility; CSV export where listed.
- Hide actions the user can't perform, but never rely on that for security.
- Design: clean enterprise SaaS, light + dark mode, one accent colour, tokens in Tailwind config. No gradients-everywhere, no gimmicky animation.
- Accessibility: labels on all inputs, keyboard navigable, visible focus, WCAG AA contrast.
- Access token kept in memory only; never in localStorage.

## 11. Security rules

Follow `docs/security.md`. Minimum always:

- argon2 password hashing; login lockout after 5 failed attempts; rate limit login, apply form and AI endpoints (`@nestjs/throttler`).
- Helmet headers, strict CORS allow-list from env, no stack traces in production responses.
- Documents: private storage, signed URLs valid 5 minutes, document views written to audit log, only HR roles can see identity documents.
- Never commit secrets. Keep `.env.example` updated with every variable (no real values).
- Sanitise uploaded file names; check type and size (max 10 MB; pdf, docx, jpg, png).
- No `dangerouslySetInnerHTML`. No raw SQL built from user input.

## 12. AI rules

- Business code calls `LlmService` only — never an SDK directly.
- Prompts live as versioned files in `apps/api/src/modules/ai/prompts/` (e.g. `cv-parse.v1.md`).
- Request structured JSON; validate with Zod; on invalid output retry once, then fail gracefully.
- Treat CV/document text as **untrusted data**: wrap in delimiters, instruct the model to ignore instructions inside it, never let it change scores directly.
- Matching: deterministic pre-score (must-have skills, years) first; LLM adds explanation and a bounded adjustment.
- Strip name, gender, age, nationality, photo and identity-document data before any matching prompt.
- Log every call to `ai_requests` (feature, provider, model, tokens, estimated cost, latency, status, userId, promptVersion).
- AI output is a suggestion: UI labels it "AI-assisted suggestion"; a human confirms.
- If the provider fails or quota is exhausted: save the record, show a friendly message, keep manual entry possible.
- Tests use `MockProvider` — never call a real AI API in tests.

## 13. Testing rules

- Every module ships with: unit tests for service rules, integration tests for each endpoint including at least one 403 case per role that must be blocked.
- Required negative tests: invalid stage transition (409), IDOR access to another client's data (403/404), invalid upload, malformed AI output.
- Integration tests run against Postgres (CI service container; locally the Neon `test` branch via `DATABASE_URL_TEST`).
- Playwright covers the five critical journeys in `docs/00-master-plan.md` section 7.
- Do not mark a task done while tests fail or are skipped.

## 14. Git workflow

- Work directly on `main` (owner preference, 2026-10-07); small focused commits using Conventional Commits (`feat(applications): enforce stage transitions`).
- Never commit `.env`, build output or uploads.
- After each module: update `docs/ai-dev-log.md` (I will write the review notes) and `CHANGELOG.md` if user-visible.

## 15. How to work with me

1. **Plan first.** For every task, show a short plan (files to create/change, approach, open questions) and wait for approval.
2. **One module per task.** Only touch files for the module I named, plus shared files strictly needed (explain why).
3. **Ask, don't guess.** If a requirement is ambiguous or conflicts with the docs, stop and ask.
4. **Explain non-obvious code** with brief comments on *why*, not *what*.
5. **No new dependencies** without stating name, purpose and that it is free/open source.
6. At the end of each task, report: what changed, how to test it manually, tests added, known limitations.

## 16. Definition of done (per module)

- [ ] Acceptance criteria from `docs/02-user-stories.md` met
- [ ] Permission guards + data scoping + audit logging in place
- [ ] Validation on API and form
- [ ] Unit + integration tests pass; lint and typecheck clean
- [ ] Swagger docs updated
- [ ] UI has loading/empty/error states and works on mobile width
- [ ] `.env.example` and docs updated if needed

## 17. Environment variables (`.env.example`)

```
NODE_ENV=development
APP_URL=http://localhost:5173
API_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:5173
PORT=3000
LOG_LEVEL=info
SWAGGER_ENABLED=true
DEMO_MODE=false
VITE_DEMO_MODE=false
LOGIN_RATE_LIMIT_PER_MIN=10
TRUST_PROXY_HOPS=1             # 2 in production (Vercel rewrite + Render proxy)
REFRESH_RATE_LIMIT_PER_MIN=30

DATABASE_URL=
DATABASE_URL_TEST=
DATABASE_URL_READONLY=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

STORAGE_PROVIDER=local          # local | supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_BUCKET=documents
STORAGE_LOCAL_DIR=uploads

MAIL_PROVIDER=console           # console | ethereal | smtp
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM=

LLM_DEFAULT_PROVIDER=gemini     # gemini | claude | openai | mock
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
AI_MONTHLY_BUDGET_USD=0

TURNSTILE_SECRET_KEY=
VITE_TURNSTILE_SITE_KEY=
CAREERS_APPLY_RATE_LIMIT_PER_HOUR=5

WEBHOOK_SIGNING_SECRET=
SENTRY_DSN=                    # API error tracking (Sentry free); unset = off
VITE_SENTRY_DSN=               # web error tracking; set in Vercel env
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_API_URL=https://www.zohoapis.com
```
