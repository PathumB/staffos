import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Root .env (DATABASE_URL_TEST etc.) via Node's built-in loader.
if (existsSync('../.env')) process.loadEnvFile('../.env');

const isCI = Boolean(process.env.CI);
const WEB_PORT = 4173;
// Override when port 3000 is taken by another local app.
const API_PORT = Number(process.env.E2E_API_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;

/**
 * Runs against the built apps (`pnpm build` first): the API on :3000 (or E2E_API_PORT) and
 * `vite preview` on :4173, which proxies /api like production.
 * Set E2E_BASE_URL to test a deployed environment instead.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // 'list' in CI too, so the log shows per-test durations.
  reporter: isCI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  // Locally the API talks to a remote Neon database (cold starts ~3.5 s); CI uses a local Postgres.
  expect: { timeout: isCI ? 5_000 : 15_000 },
  timeout: isCI ? 30_000 : 90_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // CLAUDE.md §10: every screen must work down to 375 px.
    {
      name: 'mobile-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter api start',
          // Wait on the port, not /health: without a database /health answers 503, which
          // Playwright would treat as "not ready".
          port: API_PORT,
          // The refresh endpoint checks Origin (CSRF), so the preview origin must be allowed.
          env: {
            PORT: String(API_PORT),
            CORS_ORIGINS: baseURL,
            APP_URL: baseURL,
            // The suite signs in many times from one IP; production keeps 10/min.
            LOGIN_RATE_LIMIT_PER_MIN: '200',
            // Every page load refreshes the session; the whole suite shares one IP.
            REFRESH_RATE_LIMIT_PER_MIN: '600',
            CAREERS_APPLY_RATE_LIMIT_PER_HOUR: '200',
            // Locally E2E writes to the test branch, never the dev database.
            ...(process.env.DATABASE_URL_TEST && !isCI
              ? { DATABASE_URL: process.env.DATABASE_URL_TEST }
              : {}),
          },
          reuseExistingServer: !isCI,
          timeout: 60_000,
          // CI: API logs go to the job output so ci.yml can surface server errors.
          stdout: isCI ? 'pipe' : 'ignore',
        },
        {
          command: `pnpm --filter web preview --port ${WEB_PORT} --strictPort`,
          url: baseURL,
          env: { API_URL: `http://127.0.0.1:${API_PORT}` },
          reuseExistingServer: !isCI,
          timeout: 60_000,
        },
      ],
});
