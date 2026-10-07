import { execSync } from 'node:child_process';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Once per `pnpm test` run: apply pending migrations to the test database and sync roles and
 * permissions, so integration tests see the current schema. Skipped without a test database.
 */
export default async function globalSetup(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    return;
  }
  const run = (command: string, env: NodeJS.ProcessEnv = {}) =>
    execSync(command, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
      env: { ...process.env, ...env },
    });
  try {
    run('pnpm exec prisma migrate deploy --config prisma.test.config.ts');
    // Runs outside Jest's module system (the generated Prisma client uses .js specifiers).
    run('pnpm exec tsx --conditions=source ../../prisma/seed.ts', {
      DATABASE_URL: url,
      SEED_SCOPE: 'rbac',
    });
  } catch (error) {
    // Only surface Prisma's output when something actually went wrong.
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    console.error(stdout?.toString(), stderr?.toString());
    throw error;
  }
}
