# AI Development Log

How AI tools were used to build StaffOS: what was asked, what the AI produced, what it got wrong, and what was changed after human review. One entry per task or module (CLAUDE.md §14).

Entry template:

```
## <date> — <task / module>
Tool:
Asked:
AI produced:
Decisions / deviations (and why):
Review notes (owner): what AI got wrong, what I changed
```

---

## 2026-10-07 — Planning documents + scaffold

**Tool:** Claude Code (Opus 5.5)

**Asked:** Read CLAUDE.md and the master plan. Draft the source-of-truth docs, then scaffold the monorepo (build-order step 1).

**AI produced:**

- `docs/01-PRD.md`, `docs/02-user-stories.md`, `docs/api-contract.md`, `docs/security.md`, derived from the master plan and CLAUDE.md
- pnpm monorepo with `apps/api` (NestJS 12), `apps/web` (React 18 + Vite 8 + Tailwind v4), `packages/shared` (Zod) and `e2e` (Playwright)
- API: `/api/v1` prefix, Helmet, CORS allow-list, global validation (rejects unknown fields), global exception filter with the standard error shape + `traceId`, pino logging, Swagger, Zod-validated env, `PrismaService`, public `GET /api/v1/health`
- CI (GitHub Actions + Postgres service container), CodeQL, Dependabot, `render.yaml`, `vercel.json`, deploy workflow

**Decisions / deviations (and why):**

- **Conflicts with the master plan were resolved in favour of CLAUDE.md:**
  - no Docker
  - pg-boss instead of BullMQ/Redis
  - Supabase Storage instead of S3/R2
  - Brevo instead of Resend
  - Gemini as the default LLM
  - Neon/Render/Vercel instead of AWS
- **Node 24 instead of 22:** the owner chose the installed current LTS.
- **TypeScript 6.0, not 7.0:** `ts-jest`, `typescript-eslint` and `@nestjs/swagger` don't support TS 7 yet.
- **React 18.3 (CLAUDE.md) with React Router 7:** React Router 8 requires React 19.
- **ESLint 9, not 10:** `eslint-plugin-react` (needed for the `no-danger` rule) doesn't support ESLint 10 yet.
- **NestJS 12 is ESM-only.** The API follows Nest's official CJS template (`module: nodenext`, loading ESM via Node's `require(esm)`, Jest with `--experimental-vm-modules`).
- **Tailwind v4 keeps design tokens in `src/index.css` (`@theme`)** rather than `tailwind.config` (approved by the owner).
- **Lockout returns 429 `ACCOUNT_LOCKED`** (not 423), to stay within the status codes in CLAUDE.md §8.
- **The background-job status endpoint is `/background-jobs/:id`**, to avoid clashing with recruitment `/jobs/:id`.
- **The Prisma schema has no models yet.** The data model is a separate design task.

**Review notes (owner):** _to be written by @pathum_

---

## 2026-10-07 — Data model (`feat/data-model`)

**Tool:** Claude Code (Opus 5.5)

**Asked:** Design the full schema from master plan §4.3 following CLAUDE.md §9; owner approved the recommended defaults (documents with two real FKs + exactly-one CHECK, 32-bit integer money, full schema now).

**AI produced:**

- `prisma/schema.prisma`: 55 tables, 39 enums, UUID v7 keys, snake_case mapping, every FK indexed
- Migration `init` (Prisma-generated) and `integrity` (hand-written SQL):
  - append-only triggers on `audit_logs` and `application_stage_history`
  - immutable issued invoices and their lines
  - a `btree_gist` exclusion constraint against overlapping deployments
  - exactly-one-owner checks, and value checks (headcount, money, Monday weeks, 0–16 h/day, AI score bounds)
- `packages/shared/src/enums.ts` (mirrors the DB enums) and `domain.ts` (pipeline order, `allowedNextStages`, identity document types)
- Tests:
  - an enum drift test (shared ↔ Prisma)
  - 11 real-Postgres integrity tests, each in a rolled-back transaction, including "every FK has an index"
  - Jest global setup that migrates the test DB
- `docs/erd.md`: overview plus 8 Mermaid area diagrams, all parsed with Mermaid 11

**Decisions / deviations (and why):**

- **No date of birth, gender or photo columns on candidates:** data minimisation, and they must never reach a matching prompt.
- **`client_id` / `employee_id` are copied onto jobs, deployments and timesheets** so data-scoping queries don't need joins. Services set them from the parent record.
- **Generic links without FKs:** `tasks`, `ai_requests`, `ai_results` and `audit_logs` use `entity_type` / `entity_id` with no FK, because they can point at any table. Documented in the schema.
- **Owner-less one-time setup tables have no `created_by_id`:** departments, positions, settings, sequences.
- **AI cost is stored as integer micro-dollars,** so there are no floats anywhere.
- **Prisma 7 `migrate dev` no longer runs `generate`,** so `pnpm db:migrate` now runs both.
- **Prisma ignores triggers, checks and exclusion constraints when diffing** (verified with `migrate diff`: empty), so future migrations keep them.

**Review notes (owner):** _to be written by @pathum_

---

## 2026-10-07 — Auth, users, roles, audit log, app shell

**Tool:** Claude Code (Opus 5.5)

**Asked:** Build authentication and access control (build order step 2), working directly on `main`.

**AI produced:**

- **API:**
  - login, rotating refresh cookie with reuse detection, logout, password reset, invitations
  - lockout after 5 failures, rate limits, common-password check (SecLists NCSC list)
  - global guards: rate limit → JWT → permissions, deny by default
  - request context (AsyncLocalStorage) and `AuditService` with secret redaction
  - users/roles/audit endpoints
  - pg-boss job queue and a mail provider (console/Ethereal/SMTP), with inline fallback
- **Shared:** the permission matrix as code, plus the auth/user Zod schemas (also used by the API through a small `createZodDto` pipe).
- **Seed:** roles and permissions synced from code, plus 8 fictional demo accounts.
- **Web:**
  - access token in memory with single-flight refresh, multi-tab logout via `BroadcastChannel`
  - login, forgot/reset password, accept-invite pages
  - sidebar shell and dashboard; users table (URL-driven filters, sorting, column toggle), role matrix, audit log
- **Tests:**
  - API: 129 tests, including per-role 403s, cross-session refresh-reuse, lockout, CSRF origin, a route-policy test and seed drift
  - web: 22 tests
  - E2E: 14 (desktop and 375 px)

**Decisions / deviations (and why):**

- **Guards are registered globally (`APP_GUARD`) rather than per controller**, and deny by default. CLAUDE.md §7 asks for `@UseGuards(...)` on every endpoint; global registration gives the same protection and can't be forgotten. A test enforces a policy on every route.
- **Wrote a ~60-line Zod DTO pipe** instead of `nestjs-zod`, which doesn't support Nest 12 yet.
- **TanStack Table pinned to v8:** v9 is a full API rewrite.
- **A refresh token replayed within 15 s of rotation returns `TOKEN_ROTATED`** instead of revoking the family. Two tabs refreshing at once is normal; real reuse after the window still revokes everything.
- **Client users are not created from the Users page.** They'll be invited from the client's CRM page, where the company is known.
- **Locally, E2E assertions wait up to 15 s:** the API talks to Neon in us-east-2 (cold start ~3.5 s). CI uses a local Postgres with a 5 s timeout.

**What AI got wrong and fixed during the task:**

- A heading nested inside another heading on the auth pages (caught by a test).
- Jest global setup couldn't import the Prisma client; it now runs the seed through `tsx`.
- The E2E origin was missing from `CORS_ORIGINS`, so refresh was rejected by the CSRF check.
- Wrong email Zod ordering (validated before trimming).
- A process filter that stopped the Playwright MCP helper processes along with the test servers.

**Review notes (owner):** _to be written by @pathum_

---

## 2026-10-07 — CRM: clients and manpower requests

**Tool:** Claude Code (Opus 5.5)

**Asked:** Build the CRM module (build order step 3) with the recommended defaults. No GitHub remote yet, so commits stay local.

**AI produced:**

- **API, clients:**
  - clients (TRN unique, archive blocked while deployments are active), contacts (single primary, portal invitation that creates a `CLIENT_USER`), activities and projects
  - scoping helpers in `common/scoping/crm-scope.ts`
- **API, manpower requests:**
  - a pure state machine (`manpower-request.rules.ts`), the headcount threshold from `settings` (default 20)
  - optimistic locking (`version` → 409 `STALE_VERSION`), and HR-only approval
  - client users always raise requests for their own company, as `SUBMITTED`
- **Web:**
  - clients list and detail (requests, activity timeline, account card, contacts, projects)
  - requests list and detail, with action dialogs and a request form (`MoneyInput` keeps money in fils)
- **Seed:** four fictional clients, including "Gulf Build Contracting LLC" with 25 heavy drivers pending HR approval (the master-plan demo).
- **Tests:** API 196 (+67), web 27 (+5), shared 23 (+5), E2E 18 (+2: request → HR approval, client isolation).

**Decisions / deviations (and why):**

- **Approval uses the request's own status, not the generic `approval_requests` table.** The configurable approval-chain engine is the workflow module (build order step 9); it will take over the decision step.
- **Client users can create, edit and cancel their own `SUBMITTED` requests but not submit them.** Their account manager reviews and submits (US-MR-03).
- **The login rate limit is now `LOGIN_RATE_LIMIT_PER_MIN`** (default 10, as security.md requires), raised only for the E2E servers.
- **E2E now runs against the Neon `test` branch and seeds it**, after E2E runs had written into the dev database (cleaned up).
- **Local Playwright test timeout is 90 s:** each API call makes several round trips to Neon in us-east-2. CI uses a local Postgres with 30 s.
- **Root `pnpm typecheck` builds `packages/shared` first:** a fresh CI checkout has no `dist/`.

**What AI got wrong and fixed during the task:**

- PATCH schemas built with `.partial()` on fields with defaults would have reset untouched values; the base fields no longer carry defaults.
- Money inputs would have shown fils as AED when editing; now handled by `MoneyInput` and a VAT select.
- Shell-escaping mangled a regex and a template string twice; edits now use the editor for code with backslashes or backticks.

**Known gaps:**

- "HR is notified" / "account manager is notified" (US-MR-01/03) wait for the notifications module; the events are audited meanwhile.
- `pg` logs a deprecation warning from a library dependency (concurrent `client.query`); our code is unaffected.

**Review notes (owner):** _to be written by @pathum_

---

## 2026-10-08 — Recruitment (ATS) part 1: jobs, candidates, applications, pipeline

**Tool:** Claude Code (Opus 5.5)

**Asked:** Build recruitment part 1 with the recommended defaults. The repo is now on GitHub (`PathumB/staffos`), so CI runs on every push.

**AI produced:**

- **API:**
  - jobs (open from an APPROVED request only; validated recruiters and hiring manager; skills; DRAFT → OPEN ⇄ ON_HOLD → CLOSED with optimistic locking)
  - candidates (duplicate detection by email/phone that only reveals the match to someone allowed to see it; HR-only `force` and delete)
  - applications (add to OPEN jobs; `POST /applications/:id/transition` with the shared `allowedNextStages` rule, a reason for exits, accepted offer required for HIRED, append-only history in the same transaction)
  - a pipeline endpoint, and `common/scoping/recruitment-scope.ts`
- **Web:**
  - jobs list and detail with the Kanban (`@dnd-kit/core`, MIT, for pointer, touch and keyboard drag, plus a "Move to" menu); only legal columns light up
  - job form (recruiters, hiring manager, skills editor, salary as `MoneyInput`), "Open job" on approved requests
  - candidates list and detail, the add-to-job and add-candidate dialogs
- **Seed:** 10 fictional candidates across 3 open jobs, with stage history spread over time.
- **Tests:**
  - API 234 (+38): stage rules, job lifecycle, per-role 403s, recruiter/account-manager IDOR 404s, the illegal jump APPLIED → HIRED returning 409, stale versions, masking for client users, shortlist-only visibility for hiring managers
  - web 30 (+3)
  - E2E 20 (+2: request → job → candidate → Screening, plus the API refusing APPLIED → HIRED)

**Decisions / deviations (and why):**

- **Hiring managers and client users see only SHORTLISTED+ applications and pipeline columns** (security.md §4). Client users get masked email and no phone or nationality.
- **Duplicate-candidate errors include the existing id only when the caller can open that record**, so the check can't be used to probe other recruiters' candidates.
- **The candidate audit snapshot stores name, title and skills, not contact details**, to avoid making the audit log a second PII store.
- **HIRED is enforced now (requires an ACCEPTED offer)**, even though offers and the hire transaction (employee + onboarding) arrive in part 2.

**What AI got wrong and fixed during the task:**

- The experience field would have shown months as years after a form reset (now a controlled years↔months field).
- Test fixtures used non-hex "UUIDs"; the app's response validation correctly rejected them.
- After creating a candidate from the pipeline, the search dialog reopened over the board (now the whole flow closes).
- E2E assumed demo rows on page 1 of shared test-database lists (now searches).

**Known gaps:**

- Interviews, offers and the hire transaction are part 2.
- CV upload and parsing come with documents and AI.
- The careers portal (public apply) comes later.
- Stage-change events for automations and webhooks are emitted once those modules exist.

**Review notes (owner):** _to be written by @pathum_
