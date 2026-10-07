import { execSync } from 'node:child_process';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Applies pending migrations to the test database once per `pnpm test` run, so integration
 * tests always see the current schema. Skipped when no test database is configured.
 */
export default function globalSetup(): void {
  loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
  if (!process.env.DATABASE_URL_TEST) {
    return;
  }
  try {
    execSync('pnpm exec prisma migrate deploy --config prisma.test.config.ts', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
    });
  } catch (error) {
    // Only surface Prisma's output when something actually went wrong.
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    console.error(stdout?.toString(), stderr?.toString());
    throw error;
  }
}
