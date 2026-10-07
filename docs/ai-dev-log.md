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
