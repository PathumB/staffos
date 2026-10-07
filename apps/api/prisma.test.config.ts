import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same as prisma.config.ts but targets the test database (Neon `test` branch locally,
// the Postgres service container in CI). Used by `pnpm db:migrate:test` and the Jest global setup.
loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: '../../prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL_TEST ?? '' },
});
