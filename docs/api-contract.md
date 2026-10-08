# StaffOS — API Contract

Version 0.1 · 2026-10-07 · Status: Draft for review

This contract is the agreement between `apps/web` and `apps/api`. The live, generated reference is Swagger at `/api/docs`. **If the two differ, this document is the intended behaviour, and the code or this document must be fixed in the same PR.**

Permissions are defined in [security.md §3](security.md#3-permission-matrix). Business rules are in [01-PRD.md §6](01-PRD.md#6-key-business-rules).

---

## 1. Conventions

### 1.1 Basics

- Base URL: `/api/v1`. In the browser it is always same-origin (Vite proxy in dev, Vercel rewrite in prod).
- JSON only (`Content-Type: application/json`), except file uploads (`multipart/form-data`) and file downloads.
- Paths are kebab-case and plural (`/manpower-requests`); fields are camelCase.
- IDs are UUID v4. Timestamps are ISO 8601 UTC (`2026-10-07T08:30:00.000Z`). Dates without time are `YYYY-MM-DD`.
- Money: `{ "amountFils": 125000, "currency": "AED" }`, or a field named `<x>Fils` alongside a `currency` field on the parent. Never decimals.
- Auth header: `Authorization: Bearer <accessToken>`.
- Every response carries an `X-Request-Id` header (= `traceId`).

### 1.2 Lists

```
GET /api/v1/candidates?page=1&pageSize=20&sort=-createdAt,lastName&search=driver&filter[status]=ACTIVE&filter[createdAt][gte]=2026-01-01
```

| Param | Rules |
| --- | --- |
| `page` | ≥ 1, default 1 |
| `pageSize` | 1–100, default 20 |
| `sort` | Comma-separated whitelisted fields; `-` prefix = descending; default `-createdAt` |
| `search` | Free text over the module's search fields, max 100 chars |
| `filter[field]` | Equality; `filter[field][in]=A,B`; `filter[field][gte|lte]=` for dates/numbers. Only whitelisted fields are accepted; others return 400. |

Response:

```json
{
  "data": [ { "id": "…" } ],
  "meta": { "page": 1, "pageSize": 20, "total": 134 }
}
```

### 1.3 Errors

Always this shape (global exception filter):

```json
{
  "code": "INVALID_TRANSITION",
  "message": "Cannot move application from APPLIED to HIRED.",
  "details": { "from": "APPLIED", "to": "HIRED", "allowed": ["SCREENING", "REJECTED", "WITHDRAWN"] },
  "traceId": "9f2c4e1a6b7d4c1e"
}
```

Validation errors (400) use `code: "VALIDATION_FAILED"`, and `details.fields` maps each field to a list of messages:

```json
{ "code": "VALIDATION_FAILED", "message": "Request validation failed.", "details": { "fields": { "headcount": ["must be at least 1"] } }, "traceId": "…" }
```

| Status | Use |
| --- | --- |
| 200 / 201 / 202 / 204 | OK / created / accepted (queued) / no content |
| 400 | `VALIDATION_FAILED`, unknown fields, bad query params, `INVALID_UPLOAD` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `TOKEN_REUSED`, `TOKEN_ROTATED` |
| 403 | `FORBIDDEN` (missing permission) |
| 404 | `<ENTITY>_NOT_FOUND` (also used for out-of-scope records) |
| 409 | `INVALID_TRANSITION`, `STALE_VERSION`, `<ENTITY>_DUPLICATE`, `ALREADY_APPLIED`, `DEPLOYMENT_OVERLAP` |
| 422 | Business rule: `REQUEST_NOT_APPROVED`, `OFFER_NOT_ACCEPTED`, `NOTHING_TO_INVOICE`, `UNSAFE_QUERY`, `AI_UNAVAILABLE` … |
| 429 | `RATE_LIMITED`, `ACCOUNT_LOCKED` (with `Retry-After`) |
| 500 | `INTERNAL_ERROR`. The message is generic in production; no stack traces. |

### 1.4 Concurrency and idempotency

- Mutable aggregates expose `version` (integer). Write and transition requests that change state must send `version`; a mismatch returns 409 `STALE_VERSION`.
- `POST /invoices/generate` requires an `Idempotency-Key` header (UUID). The same key and body within 24 h returns the original response; the same key with a different body returns 409 `IDEMPOTENCY_KEY_REUSED`.

### 1.5 Async work

Endpoints that start background work (AI, PDF, email) return **202** with `{ "jobId": "…", "status": "QUEUED" }`. Poll `GET /background-jobs/:jobId` for `{ status: QUEUED|RUNNING|SUCCEEDED|FAILED, result?, error? }`. Pollers can only read their own jobs.

### 1.6 Webhooks (outgoing)

```
POST <subscriber url>
Content-Type: application/json
X-StaffOS-Event: application.stage_changed
X-StaffOS-Delivery: <uuid>
X-StaffOS-Timestamp: 1791369000
X-StaffOS-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>

{ "id": "<delivery uuid>", "event": "application.stage_changed", "occurredAt": "…", "data": { … } }
```

Events: `application.stage_changed`, `employee.hired`, `invoice.issued`. Subscribers should reject timestamps older than 5 minutes. Retries: 5, exponential backoff (1 m, 5 m, 30 m, 2 h, 12 h).

---

## 2. Endpoints

Notation: `perm:` is the required permission. **(P)** = public. **(S)** = response is data-scoped (security.md §4).

### 2.1 Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | (P) | `200 { status: "ok", uptimeS, version, checks: { db: "ok" } }`; `503` with the same shape and failing checks |
| GET | `/health/detail` | `system:health-detail` | Adds queue depth, AI provider status, last job runs |

### 2.2 Auth

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | (P) | `{ email, password }` | `200 { accessToken, expiresIn: 900, user: Me }` + `Set-Cookie: sr_rt` |
| POST | `/auth/refresh` | (P, cookie) | — | `200 { accessToken, expiresIn, user: Me }` + rotated cookie. `401 TOKEN_ROTATED` = another tab just rotated it: retry once |
| POST | `/auth/logout` | (P, cookie) | — | `204`, cookie cleared |
| POST | `/auth/password-reset/request` | (P) | `{ email }` | `202` always |
| POST | `/auth/password-reset/confirm` | (P) | `{ token, newPassword }` | `204` |
| POST | `/auth/invitations/accept` | (P) | `{ token, password }` | `204` |
| GET | `/auth/me` | any authenticated | — | `200 Me` |

```ts
type Me = {
  id: string; email: string; firstName: string; lastName: string;
  roles: RoleCode[]; permissions: Permission[]; clientId: string | null; employeeId: string | null;
};
```

### 2.3 Users and roles

| Method | Path | perm |
| --- | --- | --- |
| GET | `/users` | `users:read` |
| POST | `/users` | `users:manage`. Body `{ email, firstName, lastName, roles[], clientId? }` → `201`, sends an invite |
| GET | `/users/:id` | `users:read` |
| PATCH | `/users/:id` | `users:manage` (name, roles) |
| POST | `/users/:id/deactivate` | `users:manage` |
| POST | `/users/:id/reactivate` | `users:manage` |
| POST | `/users/:id/resend-invitation` | `users:manage`. `202`; only for `INVITED` users |
| GET | `/roles` | `users:read`. Roles with permissions (matrix screen) |

### 2.4 Clients (CRM)

| Method | Path | perm |
| --- | --- | --- |
| GET | `/clients` (S) | `clients:read`. Filters: `industry`, `accountManagerId`, `status` |
| POST | `/clients` | `clients:write` |
| GET | `/clients/:id` (S) | `clients:read` |
| PATCH | `/clients/:id` (S) | `clients:write` |
| DELETE | `/clients/:id` (S) | `clients:write`. Soft delete; 409 if there are active deployments |
| GET/POST | `/clients/:id/contacts` (S) | `clients:read` / `clients:write` |
| PATCH/DELETE | `/clients/:id/contacts/:contactId` (S) | `clients:write` |
| POST | `/clients/:id/contacts/:contactId/invite` (S) | `clients:write`. Creates a `CLIENT_USER` |
| GET/POST | `/clients/:id/activities` (S) | `clients:read` / `clients:write` |
| GET | `/clients/:id/projects` (S) | `clients:read` |
| POST | `/clients/:id/projects` (S) | `deployments:write` |

```ts
type ClientInput = {
  name: string; industry: 'CONSTRUCTION'|'LOGISTICS'|'FACILITIES'|'HEALTHCARE'|'HOSPITALITY'|'TECHNOLOGY'|'OTHER';
  trn?: string;              // 15-digit UAE Tax Registration Number
  vatRateBps?: number;       // default 500 = 5%
  addressLine1?: string; city: string; emirate: Emirate; country?: 'AE';
  paymentTermsDays?: number; // default 30
  accountManagerId?: string; // HR_MANAGER/SUPER_ADMIN only; defaults to the creator
};
```

### 2.5 Manpower requests

| Method | Path | perm |
| --- | --- | --- |
| GET | `/manpower-requests` (S) | `manpower-requests:read`. Filters: `status`, `clientId`, `createdAt` |
| POST | `/manpower-requests` (S) | `manpower-requests:write`. `CLIENT_USER`: `clientId` is taken from the token |
| GET | `/manpower-requests/:id` (S) | `manpower-requests:read` |
| PATCH | `/manpower-requests/:id` (S) | `manpower-requests:write`. Only in `DRAFT` / `SUBMITTED` |
| POST | `/manpower-requests/:id/submit` (S) | `manpower-requests:write` (internal users only; `CLIENT_USER` → 403). `{ version }` → `APPROVED` (auto, headcount ≤ `manpowerApprovalThreshold`) or `PENDING_APPROVAL` |
| POST | `/manpower-requests/:id/approve` | `manpower-requests:approve`. `{ comment?, version }` |
| POST | `/manpower-requests/:id/reject` | `manpower-requests:approve`. `{ comment, version }` |
| POST | `/manpower-requests/:id/cancel` (S) | `manpower-requests:write`. `{ reason, version }` |

```ts
type ManpowerRequestInput = {
  clientId: string; projectId?: string;
  roleTitle: string; category: JobCategory; headcount: number;   // ≥ 1
  location: string; emirate: Emirate;
  startDate: string;          // YYYY-MM-DD, today or later
  durationMonths?: number;
  billRateMinFils?: number; billRateMaxFils?: number; currency?: 'AED';
  requirements?: string;      // ≤ 5000 chars
};
// status: DRAFT | SUBMITTED | PENDING_APPROVAL | APPROVED | REJECTED | FULFILLED | CANCELLED
```

### 2.6 Jobs

| Method | Path | perm |
| --- | --- | --- |
| GET | `/jobs` (S) | `jobs:read`. Filters: `status`, `clientId`, `category`, `recruiterId` |
| POST | `/jobs` | `jobs:write`. `{ manpowerRequestId, title?, description?, recruiterIds[], hiringManagerId, skills[] }` |
| GET | `/jobs/:id` (S) | `jobs:read` |
| PATCH | `/jobs/:id` | `jobs:write` |
| POST | `/jobs/:id/publish` | `jobs:publish`. `{ version }`. `DRAFT/ON_HOLD → OPEN` |
| POST | `/jobs/:id/hold` · `/close` | `jobs:publish` |
| GET | `/jobs/:id/pipeline` (S) | `applications:read`. `{ job, columns: [{ stage, count, applications: [{ id, version, stage, candidate, daysInStage }] }] }`. Hiring managers and client users get only the shortlisted columns |

```ts
type JobSkill = { name: string; weight: 'MUST' | 'NICE'; minYears?: number };
// status: DRAFT | OPEN | ON_HOLD | CLOSED | FILLED
```

### 2.7 Candidates

| Method | Path | perm |
| --- | --- | --- |
| GET | `/candidates` (S) | `candidates:read`. Search: name, email, skills |
| POST | `/candidates` (S) | `candidates:write`. `?force=true` (HR_MANAGER) overrides duplicate detection |
| GET | `/candidates/:id` (S) | `candidates:read`. `CLIENT_USER` gets masked contact fields |
| PATCH | `/candidates/:id` (S) | `candidates:write` |
| DELETE | `/candidates/:id` | `candidates:write` (HR_MANAGER). Soft delete |
| POST | `/candidates/cv-upload` | `candidates:write`. Multipart `file` → `202 { jobId, candidateDraftId }` (CV-parse job) |
| POST | `/candidates/:id/anonymise` | `candidates:write` (HR_MANAGER). Data-subject request |

### 2.8 Applications

| Method | Path | perm |
| --- | --- | --- |
| GET | `/applications` (S) | `applications:read`. Filters: `jobId`, `stage`, `candidateId` |
| POST | `/applications` (S) | `applications:transition`. `{ candidateId, jobId }`, created in `APPLIED` |
| GET | `/applications/:id` (S) | `applications:read`. Includes stage history and the latest match |
| POST | `/applications/:id/transition` (S) | `applications:transition` |
| GET | `/applications/:id/history` (S) | `applications:read` |

```ts
// POST /applications/:id/transition
type TransitionInput = {
  to: 'SCREENING'|'SHORTLISTED'|'INTERVIEW'|'OFFER'|'HIRED'|'REJECTED'|'WITHDRAWN';
  version: number;
  reason?: string;            // required for REJECTED / WITHDRAWN
};
// 200 → Application; 409 INVALID_TRANSITION | STALE_VERSION; 422 OFFER_NOT_ACCEPTED
// On HIRED → response includes { employeeId, onboardingPlanId }
```

### 2.9 Interviews

| Method | Path | perm |
| --- | --- | --- |
| GET | `/interviews` (S) | `applications:read`. Filters: `applicationId`, `interviewerId`, `status`; sort `scheduledAt`. Visible to admins, the job's recruiters and hiring manager, and panel members; never to client users |
| GET | `/interviews/panel-options` | `interviews:write`. Active users who can interview: `[{ id, name, role }]` (recruiters can't list users) |
| GET | `/interviews/:id` (S) | `applications:read` |
| POST | `/interviews` (S) | `interviews:write`. `{ applicationId, scheduledAt (ISO with offset), durationMin 15–480, mode: ONSITE|VIDEO|PHONE, location? (required ONSITE), meetingUrl?, interviewerIds[1–10] }`. 422 `APPLICATION_NOT_IN_INTERVIEW`, `INVALID_INTERVIEWER`, `INTERVIEW_IN_PAST`. Emails each person their own `.ics` (Asia/Dubai) |
| PATCH | `/interviews/:id` (S) | `interviews:write`. Full schedule (same fields minus `applicationId`); re-sends .ics, removed interviewers get a CANCEL. 409 `INTERVIEW_NOT_SCHEDULED` |
| POST | `/interviews/:id/cancel` (S) | `interviews:write`. `{ reason }`; sends calendar CANCEL |
| POST | `/interviews/:id/feedback` (S) | `interview-feedback:write`. `{ scores: [{ criterion, score: 1-5 }], recommendation: STRONG_YES|YES|NO|STRONG_NO, notes }`. Panel members only (403 `NOT_AN_INTERVIEWER`); the author may resubmit within 24 h (409 `FEEDBACK_LOCKED`). When the whole panel has scored: interview `COMPLETED`, recruiters notified |
| GET | `/interviews/:id/feedback` (S) | `applications:read`. Admins, the job's recruiters and hiring manager see all scorecards; other panel members only their own |

### 2.10 Offers

| Method | Path | perm |
| --- | --- | --- |
| POST | `/offers` (S) | `offers:write`. `{ applicationId, salaryFils, currency, startDate, contractType: PERMANENT|FIXED_TERM|PROJECT, contractMonths?, notes? }` |
| GET | `/offers` (S) | `offers:read`. Filters: `applicationId`, `status` |
| GET | `/offers/:id` (S) | `offers:read` |
| POST | `/offers/:id/approve` · `/reject` (S) | `offers:approve`. `{ version, reason? }`. Only the job's hiring manager or HR (403 `NOT_OFFER_APPROVER`) |
| POST | `/offers/:id/send` · `/accept` · `/decline` · `/withdraw` (S) | `offers:write`. `{ version, reason? }`. 409 `INVALID_OFFER_TRANSITION` / `STALE_VERSION` |

Create: application must be in `OFFER` (422 `APPLICATION_NOT_IN_OFFER`), start date not in the past (422 `START_DATE_IN_PAST`), one open or accepted offer per application (409 `OFFER_EXISTS`, also a database exclusion constraint). Moving the application to `HIRED` needs an `ACCEPTED` offer and, in the same transaction, creates the employee (`EMP-001001…`), the onboarding plan from the job category's template (or the default one), marks the job `FILLED` when hires reach the headcount, and notifies the account manager. 409 `ALREADY_EMPLOYED` rolls everything back.

Offer status: `PENDING_APPROVAL → APPROVED → SENT → ACCEPTED | DECLINED`; `WITHDRAWN` from any non-terminal state; `REJECTED` from `PENDING_APPROVAL`.

### 2.11 Careers portal (public)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/careers/jobs` (P) | `OPEN` jobs only. Filters: `search`, `emirate`, `category`. Public fields only. |
| GET | `/careers/jobs/:slug` (P) | |
| POST | `/careers/jobs/:slug/apply` (P) | Multipart: `firstName, lastName, email, phone, coverNote?, consent=true, turnstileToken, file` → `201 { message, trackingUrl }`. 409 `ALREADY_APPLIED`; 429 |
| GET | `/careers/applications/:token` (P) | `{ jobTitle, appliedAt, publicStatus: RECEIVED|IN_REVIEW|INTERVIEW|OFFER|CLOSED }` |
| POST | `/careers/applications/:token/data-request` (P) | `{ type: EXPORT|DELETE }` → `202` |

### 2.12 Employees

| Method | Path | perm |
| --- | --- | --- |
| GET | `/employees` (S) | `employees:read`. Filters: `departmentId`, `status`, `clientId` (active deployment); `search` (name, email, number). `salaryFils` is null unless the caller is HR, Finance or the employee |
| GET | `/employees/:id` (S) | `employees:read` |
| PATCH | `/employees/:id` (S) | `employees:write`. `{ version, firstName?, lastName?, email?, phone?, departmentId?, positionId?, status?, salaryFils? }`. `EMPLOYEE` may only change `email`/`phone` on their own record (403 `EMPLOYEE_FIELDS_RESTRICTED`). 409 `STALE_VERSION`, `EMPLOYEE_TERMINATED`. Setting `TERMINATED` cancels an unfinished onboarding plan and deactivates the linked login |
| POST | `/employees/:id/invite` (S) | `employees:write` (HR). Creates the EMPLOYEE login linked to the record and emails an invitation. 409 `EMPLOYEE_HAS_ACCOUNT`, `USER_EMAIL_EXISTS` |
| GET | `/departments` · `/positions` | `employees:read` |
| POST/PATCH | `/departments` · `/positions` | `employees:write` (HR only; 403 otherwise). 409 `DEPARTMENT_EXISTS` / `POSITION_EXISTS` |

Employees are created only by the hire transition (or by the seed).

### 2.13 Documents

| Method | Path | perm |
| --- | --- | --- |
| GET | `/documents?ownerType=EMPLOYEE&ownerId=…` (S) | `documents:read`. Identity types are filtered out without `documents:read-identity` |
| POST | `/documents` (S) | `documents:write`. Multipart: `ownerType, ownerId, type, number?, issueDate?, expiryDate?, file` |
| GET | `/documents/:id/url` (S) | `documents:read` (+ `documents:read-identity` for identity types) → `{ url, expiresAt }` (5 min); audited |
| PATCH | `/documents/:id` (S) | `documents:write` (metadata only) |
| DELETE | `/documents/:id` (S) | `documents:write`. Soft delete |
| GET | `/documents/expiring?withinDays=30` | `documents:read-identity`. Tracked employee documents (identity + medical) expiring within N days or already expired, with `ownerName` |
| GET | `/files/:token` (P) | Local storage provider only: the signed link from `/documents/:id/url` (HMAC, 5 min). Always `Content-Disposition: attachment`, `Cache-Control: private, no-store` |

Upload: the real type is detected from the file's first bytes (pdf, docx, jpg, png; max 10 MB) → 422 `INVALID_FILE`; identity types without `documents:read-identity` → 403 `IDENTITY_DOCUMENT_FORBIDDEN`; an already-expired document is saved with `warnings: ['ALREADY_EXPIRED']`. Numbers are masked (`••••5678`) in every response. Nightly at 06:00 Dubai, HR gets an in-app + email alert and a renewal task when a document reaches 30 or 7 days (or has expired), once per threshold.

Document type: `CV | PASSPORT | VISA | EMIRATES_ID | LABOUR_CARD | MEDICAL | CERTIFICATE | CONTRACT | OTHER`.

### 2.14 Onboarding

| Method | Path | perm |
| --- | --- | --- |
| GET/POST | `/onboarding-templates` | `onboarding-templates:manage` |
| GET/PATCH/DELETE | `/onboarding-templates/:id` | `onboarding-templates:manage`. Body: `{ name, category (null = default), active, tasks: [{ title, description?, type, assigneeRole: HR_MANAGER|EMPLOYEE, dueOffsetDays -90..180, required }] }`. PATCH replaces the tasks; existing plans keep their copies. 409 `TEMPLATE_CATEGORY_EXISTS`; DELETE 409 `TEMPLATE_IN_USE` (deactivate instead) |
| GET | `/onboarding-plans` (S) | `onboarding:read`. Filters: `status`, `employeeId` |
| GET | `/onboarding-plans/:id` (S) | `onboarding:read`. With tasks; each task has `canComplete` for the caller |
| POST | `/onboarding-tasks/:id/complete` (S) | `onboarding:write`. `{ note?, documentId? }`. HR Managers, the named assignee, or (unassigned) the employee for EMPLOYEE tasks; 403 `TASK_NOT_ASSIGNED_TO_YOU`, 409 `TASK_ALREADY_DONE` / `PLAN_NOT_ACTIVE`. The last required task completes the plan, sets the employee `ACTIVE` and notifies HR Managers |
| POST | `/onboarding-tasks/:id/reopen` | `onboarding:write` (HR_MANAGER) |
| PATCH | `/onboarding-tasks/:id` | `onboarding:write` (HR). Reassign / due date |

### 2.15 Deployments

| Method | Path | perm |
| --- | --- | --- |
| GET | `/deployments` (S) | `deployments:read`. Filters: `clientId`, `projectId`, `employeeId`, `status` |
| POST | `/deployments` (S) | `deployments:write`. `{ employeeId, projectId, startDate, endDate?, billRateFils, currency, overrideReason? }` |
| PATCH | `/deployments/:id` (S) | `deployments:write` |
| POST | `/deployments/:id/end` (S) | `deployments:write`. `{ endDate, reason }` |

Status: `PLANNED | ACTIVE | ENDED | CANCELLED`.

### 2.16 Timesheets

| Method | Path | perm |
| --- | --- | --- |
| GET | `/timesheets` (S) | `timesheets:read`. Filters: `status`, `clientId`, `employeeId`, `weekStart` |
| POST | `/timesheets` (S) | `timesheets:write`. `{ deploymentId, weekStart (Monday), entries: [{ date, hours, note? }] }` |
| PATCH | `/timesheets/:id` (S) | `timesheets:write`. Only in `DRAFT`/`REJECTED` |
| POST | `/timesheets/:id/submit` (S) | `timesheets:write` |
| POST | `/timesheets/:id/approve` (S) | `timesheets:approve`. `{ version }` |
| POST | `/timesheets/:id/reject` (S) | `timesheets:approve`. `{ comment, version }` |
| POST | `/timesheets/bulk-approve` (S) | `timesheets:approve`. `{ ids[] }`; returns per-id results |

Hours are sent as **minutes** (`minutes: 480`) to avoid decimals. The UI shows hours.

### 2.17 Invoices

| Method | Path | perm |
| --- | --- | --- |
| GET | `/invoices` (S) | `invoices:read`. Filters: `clientId`, `status`, `issueDate` |
| POST | `/invoices/generate` | `invoices:write`. Header `Idempotency-Key`. `{ clientId, periodStart, periodEnd }` → `201 Invoice` (DRAFT) |
| GET | `/invoices/:id` (S) | `invoices:read` |
| POST | `/invoices/:id/issue` | `invoices:write` → `ISSUED`; number assigned (`INV-2026-000123`); PDF job queued |
| POST | `/invoices/:id/void` | `invoices:write`. `{ reason }` |
| POST | `/invoices/:id/mark-paid` | `invoices:write`. `{ paidOn }` |
| GET | `/invoices/:id/pdf` (S) | `invoices:read` → signed URL |

```ts
type Invoice = {
  id: string; number: string | null; clientId: string;
  status: 'DRAFT'|'ISSUED'|'PAID'|'VOID';
  periodStart: string; periodEnd: string; issueDate: string | null; dueDate: string | null;
  currency: 'AED'; subtotalFils: number; vatRateBps: number; vatFils: number; totalFils: number;
  lines: { deploymentId: string; employeeName: string; description: string; minutes: number; rateFils: number; amountFils: number }[];
};
// amountFils = round(minutes * rateFils / 60); vatFils = round(subtotalFils * vatRateBps / 10000) — half-up, computed server-side
```

### 2.18 Workflows and automations

| Method | Path | perm |
| --- | --- | --- |
| GET/POST | `/workflows` | `workflows:manage`. Approval chain definitions |
| GET/PATCH | `/workflows/:id` | `workflows:manage` |
| GET | `/approvals?assignedTo=me` | any authenticated (own approvals only) |
| GET/POST | `/automation-rules` | `automations:manage` |
| GET/PATCH/DELETE | `/automation-rules/:id` | `automations:manage` |
| POST | `/automation-rules/:id/test` | `automations:manage`. Dry run with a sample payload |
| GET | `/automation-runs` | `automations:manage`. Filters: `ruleId`, `status` |
| POST | `/automation-runs/:id/retry` | `automations:manage` |

```ts
type AutomationRule = {
  name: string; active: boolean;
  event: 'application.stage_changed'|'employee.hired'|'document.expiring'|'timesheet.submitted'|'manpower_request.created';
  conditions: { field: string; op: 'eq'|'neq'|'gt'|'lt'|'in'; value: unknown }[];   // AND
  actions: (
    | { type: 'create_task'; title: string; assigneeRole?: RoleCode; dueInDays?: number }
    | { type: 'send_email'; template: string; to: 'account_manager'|'hr'|'recruiter'|string }
    | { type: 'notify'; to: 'account_manager'|'hr'|'recruiter'; message: string }
    | { type: 'assign_user'; userId: string }
    | { type: 'start_approval'; workflowId: string }
    | { type: 'call_webhook'; webhookId: string }
  )[];
};
```

### 2.19 AI

All AI endpoints are rate limited, logged to `ai_requests`, and return `422 AI_UNAVAILABLE` (friendly message) on provider failure or exhausted budget.

| Method | Path | perm | Response |
| --- | --- | --- | --- |
| POST | `/ai/cv-parse` | `ai:use` | `{ documentId }` → `202 { jobId }`; result `ParsedCv` |
| POST | `/ai/match/:jobId` | `ai:use` (S) | `202 { jobId }`; results stored per application |
| GET | `/ai/match/:jobId` | `ai:use` (S) | `[{ applicationId, score, preScore, adjustment, matched[], partial[], missing[], explanation, promptVersion }]` |
| POST | `/ai/jd-draft` | `ai:use` | `{ title, industry, location, salaryBand?, skills[] }` → `200 { draft, inclusiveLanguageFlags[] }` |
| POST | `/ai/interview-kit` | `ai:use` (S) | `{ jobId }` → `200 { technical[], behavioural[], rubric[] }` |
| POST | `/ai/interview-summary/:applicationId` | `ai:use` (S) | `200 { summary, strengths[], concerns[] }` |
| POST | `/ai/ask` | `ai:ask-data` | `{ question }` → `200 { answer, sql, columns[], rows[], chart?: { type, x, y } }` |
| GET | `/ai/requests` | `ai:usage-read` | List of AI calls |
| GET | `/ai/usage` | `ai:usage-read` | Month-to-date cost per feature vs budget |

```ts
type ParsedCv = {
  firstName?: Field<string>; lastName?: Field<string>; email?: Field<string>; phone?: Field<string>;
  totalYearsExperience?: Field<number>;
  skills: { name: string; years?: number; confidence: number }[];
  education: { degree: string; institution?: string; year?: number }[];
  certifications: string[]; languages: string[];
};
type Field<T> = { value: T; confidence: number };  // 0–1; < 0.7 highlighted in the UI
```

### 2.20 Reports and dashboards

| Method | Path | perm |
| --- | --- | --- |
| GET | `/reports/dashboard` (S) | `reports:read`. Role-specific widgets |
| GET | `/reports/hiring-funnel` (S) | `reports:read`. `?from&to&jobId&clientId` |
| GET | `/reports/time-to-hire` (S) | `reports:read` |
| GET | `/reports/client-revenue` (S) | `reports:read` |
| GET | `/reports/open-requests` (S) | `reports:read` |
| GET | `/reports/:name/export?format=csv\|xlsx\|pdf` (S) | `reports:export` |

### 2.21 Notifications

| Method | Path | perm |
| --- | --- | --- |
| GET | `/notifications?unread=true` | `notifications:read` (own), newest first, paginated |
| GET | `/notifications/unread-count` | `notifications:read` (own). `{ count }` for the bell |
| POST | `/notifications/:id/read` | `notifications:read` (own) |
| POST | `/notifications/read-all` | `notifications:read` (own) |

### 2.22 Webhooks and integrations

| Method | Path | perm |
| --- | --- | --- |
| GET/POST | `/webhooks` | `webhooks:manage`. `{ url (https), events[], active }` → the secret is shown once |
| PATCH/DELETE | `/webhooks/:id` | `webhooks:manage` |
| POST | `/webhooks/:id/rotate-secret` | `webhooks:manage` |
| GET | `/webhooks/:id/deliveries` | `webhooks:manage` |
| POST | `/webhooks/deliveries/:id/redeliver` | `webhooks:manage` |
| GET | `/integrations` | `integrations:manage`. Status of Zoho, mail, storage, LLM providers |
| POST | `/integrations/zoho/sync` | `integrations:manage` → `202 { jobId }` |

### 2.23 Audit, settings, admin, jobs

| Method | Path | perm |
| --- | --- | --- |
| GET | `/audit-logs` | `audit:read`. Filters: `actorId`, `entity`, `entityId`, `action`, `createdAt` |
| GET | `/settings` | `settings:manage` |
| PATCH | `/settings` | `settings:manage`. Keys: `manpowerApprovalThreshold`, `documentExpiryAlertDays`, `retention.candidateMonths`, `ai.providerByFeature`, `ai.monthlyBudgetUsd`, `vat.defaultRateBps` |
| POST | `/admin/demo-reset` | `settings:manage`, only when `DEMO_MODE=true` |
| GET | `/background-jobs/:jobId` | any authenticated (own jobs only). Background job status (named to avoid clashing with recruitment `/jobs`) |
