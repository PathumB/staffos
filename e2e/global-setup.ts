import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Locally, E2E runs against the Neon `test` branch (never the dev database) and needs the demo
 * accounts there. CI uses its own throwaway Postgres and seeds it in the workflow.
 */
export default function globalSetup(): void {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (process.env.CI || process.env.E2E_BASE_URL || !testUrl) return;
  execSync('pnpm --filter api exec tsx --conditions=source ../../prisma/seed.ts', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
