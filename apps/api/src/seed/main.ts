import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../generated/prisma/client';
import {
  seedDemo,
  seedDemoCrm,
  seedDemoHiring,
  seedDemoHr,
  seedDemoRecruitment,
  seedDemoWorkforce,
} from './demo';
import { seedAutomations } from './automations';
import { seedOnboardingTemplates } from './onboarding';
import { seedRbac } from './rbac';

/**
 * `pnpm db:seed`: roles/permissions and onboarding templates always; demo data outside production
 * or in DEMO_MODE.
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
    if (process.env.SEED_SCOPE !== 'rbac') {
      await seedOnboardingTemplates(prisma);
      await seedAutomations(prisma);
    }
    const demoAllowed = process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true';
    if (demoAllowed && process.env.SEED_SCOPE !== 'rbac') {
      await seedDemo(prisma);
      await seedDemoCrm(prisma);
      await seedDemoRecruitment(prisma);
      await seedDemoHiring(prisma);
      await seedDemoHr(prisma);
      await seedDemoWorkforce(prisma);
      console.warn('Seeded demo accounts (see README → Demo accounts).');
    }
  } finally {
    await prisma.$disconnect();
  }
}
