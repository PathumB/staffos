import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// One .env at the repo root serves every app (CLAUDE.md §17). Prisma commands run from apps/api.
loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: {
    path: '../../prisma/migrations',
    seed: 'tsx ../../prisma/seed.ts',
  },
  datasource: {
    // Empty is allowed so `prisma generate` works before a database exists; migrate will fail loudly.
    url: process.env.DATABASE_URL ?? '',
  },
});
