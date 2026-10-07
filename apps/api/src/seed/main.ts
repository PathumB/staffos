import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../generated/prisma/client';
import { seedDemo } from './demo';
import { seedRbac } from './rbac';

/**
 * `pnpm db:seed`: roles/permissions always; demo accounts outside production or in DEMO_MODE.
 * SEED_SCOPE=rbac seeds roles/permissions only (used by the test setup).
 */
export async function runSeed(): Promise<void> {
  loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await seedRbac(prisma);
    console.warn('Seeded roles and permissions.');
    const demoAllowed = process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true';
    if (demoAllowed && process.env.SEED_SCOPE !== 'rbac') {
      await seedDemo(prisma);
      console.warn('Seeded demo accounts (see README → Demo accounts).');
    }
  } finally {
    await prisma.$disconnect();
  }
}
