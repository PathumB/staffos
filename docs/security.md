# StaffOS — Security

Version 0.1 · 2026-10-07 · Status: Draft for review

StaffOS holds passports, visas, salaries and client financials. The guiding rules:

1. **Enforce access in the backend.** The UI only hides what the user can't do.
2. **Log every sensitive access.**
3. **Keep secrets out of the code.**

This document is binding for all modules (CLAUDE.md §11).

---

## 1. Threat model summary

| Asset | Threat | Primary controls |
| --- | --- | --- |
| Identity documents (passport, visa, Emirates ID, labour card) | Unauthorised viewing, bulk download, public link leak | Private bucket, 5-min signed URLs, HR-only permission, view audit, no listing endpoint without scope |
| Candidate PII and CVs | IDOR across clients/recruiters, scraping, retention beyond purpose | Service-level scoping, 404 on out-of-scope, rate limits, retention/anonymisation job |
| Salaries, bill rates, invoices | Tampering, wrong totals | Server-side totals in integer fils, immutable issued invoices, idempotency, audit before/after |
| Accounts | Credential stuffing, token theft | argon2id, lockout, rate limit, short access JWT, rotating refresh with reuse detection |
| AI features | Prompt injection, data leakage to the provider, SQL injection through "ask your data" | Delimited untrusted input, schema-validated output, bounded score adjustment, PII stripping, read-only role + view whitelist + SQL parser check |
| Outgoing webhooks | Spoofing, SSRF | HMAC signatures, HTTPS-only targets, private/loopback IP ranges blocked |
| Public careers portal | Spam, malicious uploads, bots | Rate limit, CAPTCHA (free: Cloudflare Turnstile), type/size/magic-byte checks, renamed files |

## 2. Authentication

| Control | Implementation |
| --- | --- |
| Password hashing | `argon2id` (library `argon2`), memory 19 MiB, t=2, p=1 (OWASP minimum). Rehash on login if parameters change. |
| Password policy | Minimum 12 characters, max 128; rejected if in a bundled list of 10k common passwords; no composition rules (NIST 800-63B). |
| Lockout | 5 failed attempts in 15 min → locked 15 min (429 `ACCOUNT_LOCKED`). Counter per account and per IP. Audited. |
| Rate limits | `@nestjs/throttler`: login 10/min/IP, password reset 5/hour/IP, careers apply 5/hour/IP, AI endpoints 20/min/user. |
| Access token | JWT HS256, 15 min, claims `sub`, `roles`, `clientId?`, `jti`. Kept in memory on the client only; never in `localStorage`/`sessionStorage`. |
| Refresh token | 256-bit random opaque value; only its SHA-256 hash is stored. 7-day lifetime. Cookie `sr_rt`: `httpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. |
| Rotation and reuse detection | Each refresh issues a new token in the same family and revokes the old one. Presenting a revoked token revokes the whole family and audits `REFRESH_TOKEN_REUSE`, except within 15 s of its rotation, when it is treated as a multi-tab race (`401 TOKEN_ROTATED`; the client retries with the new cookie). |
| Token hashing | Refresh, reset, invitation and tracking tokens are stored as HMAC-SHA256 with `JWT_REFRESH_SECRET` as the key, so a database leak alone cannot be used to check or forge tokens. |
| Password reset | Single-use token, hashed at rest, 30 min, always 202 response. Success revokes all refresh tokens. |
| Session invalidation | Deactivating a user or changing their password or roles revokes refresh tokens. Access tokens expire within 15 min (accepted risk). |
| 2FA (stretch) | TOTP (RFC 6238) via `otplib`, optional per user, enforced for `SUPER_ADMIN` when enabled. |
| Candidate tracking links | 32-byte random token, hashed at rest, scoped to one application, read-only status view. |

## 3. Permission matrix

Permissions are strings `resource:action`. Every endpoint declares them with `@RequirePermissions(...)` and is protected by `JwtAuthGuard` + `PermissionsGuard`. Endpoints marked `@Public()` are listed in §3.2.

**Having a permission is necessary but not sufficient.** Services also apply the data scope in §4.

Legend: ✓ = granted. **S** = granted but scoped (see §4).

| Permission | SUPER_ADMIN | HR_MANAGER | RECRUITER | ACCOUNT_MANAGER | HIRING_MANAGER | FINANCE | EMPLOYEE | CLIENT_USER |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `users:read` | ✓ | ✓ | | | | | | |
| `users:manage` | ✓ | | | | | | | |
| `audit:read` | ✓ | | | | | | | |
| `settings:manage` | ✓ | | | | | | | |
| `clients:read` | ✓ | ✓ | | S | | ✓ | | S |
| `clients:write` | ✓ | | | S | | | | |
| `manpower-requests:read` | ✓ | ✓ | S | S | | | | S |
| `manpower-requests:write` | ✓ | ✓ | | S | | | | S |
| `manpower-requests:approve` | ✓ | ✓ | | | | | | |
| `jobs:read` | ✓ | ✓ | S | S | S | | | |
| `jobs:write` | ✓ | ✓ | | | | | | |
| `jobs:publish` | ✓ | ✓ | | | | | | |
| `candidates:read` | ✓ | ✓ | S | | S | | | S |
| `candidates:write` | ✓ | ✓ | S | | | | | |
| `applications:read` | ✓ | ✓ | S | | S | | | S |
| `applications:transition` | ✓ | ✓ | S | | | | | |
| `interviews:write` | ✓ | ✓ | S | | | | | |
| `interview-feedback:write` | ✓ | ✓ | | | S | | | |
| `offers:read` | ✓ | ✓ | S | | S | | | |
| `offers:write` | ✓ | ✓ | S | | | | | |
| `offers:approve` | ✓ | ✓ | | | S | | | |
| `employees:read` | ✓ | ✓ | | S | | ✓ | S | |
| `employees:write` | ✓ | ✓ | | | | | S | |
| `documents:read` | ✓ | ✓ | S | | | | S | |
| `documents:read-identity` | ✓ | ✓ | | | | | S | |
| `documents:write` | ✓ | ✓ | S | | | | S | |
| `onboarding:read` | ✓ | ✓ | | S | | | S | |
| `onboarding:write` | ✓ | ✓ | | | | | S | |
| `onboarding-templates:manage` | ✓ | ✓ | | | | | | |
| `deployments:read` | ✓ | ✓ | | S | | ✓ | S | S |
| `deployments:write` | ✓ | ✓ | | S | | | | |
| `timesheets:read` | ✓ | ✓ | | S | | ✓ | S | S |
| `timesheets:write` | ✓ | ✓ | | | | | S | |
| `timesheets:approve` | ✓ | | | | | ✓ | | S |
| `invoices:read` | ✓ | | | S | | ✓ | | S |
| `invoices:write` | ✓ | | | | | ✓ | | |
| `workflows:manage` | ✓ | | | | | | | |
| `automations:manage` | ✓ | | | | | | | |
| `ai:use` | ✓ | ✓ | S | | S | | | |
| `ai:ask-data` | ✓ | ✓ | | | | ✓ | | |
| `ai:usage-read` | ✓ | | | | | | | |
| `reports:read` | ✓ | ✓ | S | S | | ✓ | | |
| `reports:export` | ✓ | ✓ | | S | | ✓ | | |
| `webhooks:manage` | ✓ | | | | | | | |
| `integrations:manage` | ✓ | | | | | | | |
| `system:health-detail` | ✓ | | | | | | | |
| `notifications:read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Roles and permissions are seeded from a single source (`packages/shared/src/permissions.ts`) so the API, the web app and this table stay consistent. A test fails if the seed and the shared constant drift.

### 3.1 Notes

- `SUPER_ADMIN` is an administrator, not a data owner. Their reads of identity documents are audited exactly like everyone else's.
- `FINANCE` never receives CV files or candidate data, only employees, deployments, timesheets and invoices.
- `CLIENT_USER` sees shortlisted candidates (stage ≥ `SHORTLISTED`) for their own client's jobs, with **email and phone masked**.

### 3.2 Public endpoints (`@Public()`)

`POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`, `POST /auth/invitations/accept`, `GET /careers/jobs`, `GET /careers/jobs/:slug`, `POST /careers/jobs/:slug/apply`, `GET /careers/applications/:token`, `POST /careers/applications/:token/data-request`, `GET /health`.

Every other route requires authentication. Guards are global and **deny by default**: a route without `@Public()`, `@AuthenticatedOnly()` or `@RequirePermissions()` returns 403. `apps/api/test/routes.spec.ts` enumerates every route and fails on a missing policy or an unlisted public route.

## 4. Data scoping (IDOR prevention)

Scoping is applied **inside the service query** (a Prisma `where` built from the actor), never by fetching and then checking. Out-of-scope records return **404** (`<ENTITY>_NOT_FOUND`), so callers can't probe whether an ID exists.

| Role | Scope rule |
| --- | --- |
| `SUPER_ADMIN`, `HR_MANAGER` | Unscoped |
| `RECRUITER` | Jobs where they are in `job.recruiters`; applications on those jobs; candidates with an application on those jobs or created by them; documents of those candidates (non-identity only) |
| `ACCOUNT_MANAGER` | Clients where `client.accountManagerId = me`, and everything under them (requests, jobs read-only, deployments, timesheets, invoices); employees currently or previously deployed to those clients |
| `HIRING_MANAGER` | Jobs where `job.hiringManagerId = me`; applications at stage ≥ `SHORTLISTED` on those jobs; offers on those applications |
| `FINANCE` | Unscoped within finance resources (deployments, timesheets, invoices, clients read) |
| `EMPLOYEE` | `employee.userId = me`: own profile, documents, onboarding tasks, deployments, timesheets |
| `CLIENT_USER` | `clientId` taken **from the token**, never from the request: own client's requests, shortlisted applications, deployments, timesheets, invoices |

Implementation: `common/scoping/` exposes `scopeFor(actor, entity)`, which returns a Prisma `where` fragment. Every module has an integration test that logs in as a user of client A and requests a record of client B (journey 5).

## 5. OWASP Top 10 (2021) mapping

| # | Risk | Control in StaffOS | Verified by |
| --- | --- | --- | --- |
| A01 | Broken access control | Global guards; `@RequirePermissions` on every route; service-level scoping (§4); 404 on out-of-scope; route-enumeration test | Integration tests per role, E2E journey 5 |
| A02 | Cryptographic failures | HTTPS only (HSTS); argon2id; tokens hashed at rest; secrets from env; documents in a private bucket | Config review, ZAP baseline |
| A03 | Injection | Prisma parameterised queries; no raw SQL from user input; reporting views created in migrations; AI SQL restricted (§7) | Unit tests on the SQL guard, Semgrep |
| A04 | Insecure design | State machines in services; transactions for hire/invoice; idempotency key; threat model (§1) | Unit tests on transitions and totals |
| A05 | Security misconfiguration | Helmet (CSP, HSTS, frame-ancestors none, noSniff); strict CORS allow-list from `CORS_ORIGINS`; no stack traces when `NODE_ENV=production`; Swagger disabled in production unless `SWAGGER_ENABLED=true` | Integration test on error shape, header test |
| A06 | Vulnerable components | Dependabot weekly; `pnpm audit --prod` and CodeQL in CI; lockfile committed | CI |
| A07 | Identification and authentication failures | §2 | Unit + integration tests |
| A08 | Software and data integrity failures | Signed webhooks; CI-only deploys; `pnpm install --frozen-lockfile`; no `eval`/dynamic `require` of user data | CI |
| A09 | Security logging and monitoring failures | Audit log for writes and sensitive reads; pino JSON logs with `traceId`; Sentry; login anomaly events (lockout, token reuse) | Integration tests on audit entries |
| A10 | SSRF | Webhook targets must be HTTPS and resolve to public IPs (private, loopback and link-local ranges rejected at registration and at delivery); the AI and integration clients only call fixed hosts | Unit tests on the URL validator |

### 5.1 XSS and CSRF

- React escapes output; `dangerouslySetInnerHTML` is banned (ESLint rule `react/no-danger`). AI-generated JD text is rendered as plain text or sanitised Markdown (`rehype-sanitize`).
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' <sentry>; frame-ancestors 'none'`.
- CSRF: the API uses bearer access tokens (not cookies) for all endpoints except `/auth/refresh` and `/auth/logout`. Those rely on `SameSite=Strict`, a `Path`-scoped cookie and an `Origin` header check against `CORS_ORIGINS`. The same-origin Vercel rewrite keeps the cookie first-party.

## 6. Files and documents

| Control | Rule |
| --- | --- |
| Allowed types | `pdf`, `docx`, `jpg`/`jpeg`, `png`. Checked by extension **and** magic bytes (`file-type`). |
| Max size | 10 MB, enforced by the multipart limit before buffering |
| File names | Original name sanitised (`[^a-zA-Z0-9._-]` → `_`, max 100 chars) and stored as metadata only; the storage key is `/{ownerType}/{ownerId}/{uuid}.{ext}` |
| Storage | `StorageProvider`: `LocalDiskStorage` (outside the web root, dev only) or `SupabaseStorage` (private bucket, prod) |
| Access | `GET /documents/:id/url` returns a signed URL valid **5 minutes**, after the permission + scope check, and writes a `DOCUMENT_VIEWED` audit entry |
| Identity documents | Types `PASSPORT`, `VISA`, `EMIRATES_ID`, `LABOUR_CARD` need `documents:read-identity` (or ownership). Their numbers are masked in lists (`•••• 1234`). They are never sent to any LLM. |
| Malware | Optional ClamAV scan job (stretch). Until then, files are never executed or rendered server-side, except PDF text extraction in a job with a size/page limit. |

## 7. AI-specific controls

| Risk | Control |
| --- | --- |
| Prompt injection via CV text | CV text wrapped in `<untrusted_document>` delimiters; the system prompt says to treat it as data only; output must match a Zod schema; on invalid output, retry once, then fail gracefully |
| Score manipulation | Ranking starts from a deterministic pre-score; the LLM adjustment is clamped to ±10; a human decides |
| Bias | The matching prompt builder drops name, gender, date of birth/age, nationality, photo, marital status and any identity-document data; a unit test asserts this |
| Data minimisation | Only fields required by the feature are sent; identity documents never are |
| Unsafe SQL ("ask your data") | The LLM output is parsed (`pgsql-ast-parser`): exactly one `SELECT`; only views in the whitelist (`v_hiring_funnel`, `v_time_to_hire`, `v_client_revenue`, `v_open_requests`); `LIMIT` forced to ≤ 500. Runs on `DATABASE_URL_READONLY` (a role with `SELECT` on those views only) with `statement_timeout = 5s` in a read-only transaction. The SQL is shown to the user. |
| Cost / abuse | Per-user rate limit; monthly budget cap (`AI_MONTHLY_BUDGET_USD`); every call logged to `ai_requests` |
| Provider outage | Timeouts (30 s), retry with exponential backoff (max 2), then a graceful fallback to manual entry |

## 8. Secrets and configuration

- `.env` is never committed (`.gitignore`). `.env.example` lists every variable with no real values.
- Production secrets live in the Render and Vercel environment settings. CI secrets live in GitHub Actions secrets.
- The config is validated at boot with a Zod schema; the app refuses to start if a required variable is missing or weak (e.g. a JWT secret < 32 chars).
- Rotation: see `docs/runbook.md` (JWT secrets: deploy with old + new during the overlap window; webhook secret: per-endpoint secrets allow staggered rotation).

## 9. Logging, audit and monitoring

- **Audit log** (`audit_logs`): actor, action, entity, entityId, before, after, IP, user agent, traceId, timestamp. Append-only (no update/delete in code; DB trigger rejects UPDATE/DELETE). Sensitive fields (password hashes, tokens, document numbers) are redacted from before/after.
- **Application logs**: pino JSON, `traceId` per request (from `X-Request-Id` or generated), returned in error responses. Redaction paths: `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.token`.
- **Sentry**: errors from the web and API apps with release tags; PII scrubbing enabled (`sendDefaultPii: false`).
- **Security events**: `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `REFRESH_TOKEN_REUSE`, `PERMISSION_DENIED` (rate-limited logging), `DOCUMENT_VIEWED`, `UNSAFE_QUERY_REJECTED`.

## 10. Data protection (UAE PDPL awareness)

- **Purpose limitation**: the careers apply form states the purpose (recruitment for current and future roles) and the retention period, and requires consent.
- **Retention**: rejected or withdrawn candidates are anonymised after 12 months (`settings.retention.candidateMonths`). A scheduled job removes name, contact details and files, and keeps anonymised stage history for reporting.
- **Data subject requests**: a candidate can request export or deletion via their tracking link. This creates an HR task with an SLA, and is audited.
- **Least privilege**: the permission matrix and data scoping above; PII masked in lists.

## 11. Security testing

| Check | Where |
| --- | --- |
| Per-role 403 and cross-client 404 tests | Integration tests in every module |
| Route-enumeration test (no unguarded routes) | `apps/api/test/security/routes.spec.ts` |
| Upload negative tests (type, size, magic bytes, filename) | `documents`, `careers`, `candidates` |
| Refresh-token reuse, lockout | `auth` |
| Malformed AI output, injection CV, bias-field stripping | `ai` |
| `pnpm audit --prod`, CodeQL | CI on every PR |
| OWASP ZAP baseline | CI against staging (after deploy) |
