import type { JobCategory, OnboardingTaskType, RoleCode } from '@staffos/shared';
import type { PrismaClient } from '../generated/prisma/client';

type Task = [title: string, type: OnboardingTaskType, role: RoleCode, dueOffsetDays: number];

// UAE onboarding steps (fictional company process). Negative offsets happen before the start date.
const COMMON: Task[] = [
  ['Collect passport, photo and Emirates ID copies', 'DOCUMENTS', 'HR_MANAGER', -14],
  ['Medical fitness test', 'MEDICAL', 'HR_MANAGER', -10],
  ['Entry permit / residence visa processing', 'VISA', 'HR_MANAGER', -10],
  ['Sign employment contract (MOHRE offer letter)', 'DOCUMENTS', 'EMPLOYEE', -7],
  ['Site safety induction', 'INDUCTION', 'HR_MANAGER', 0],
  ['Submit bank details for WPS payroll', 'DOCUMENTS', 'EMPLOYEE', 3],
  ['Emirates ID biometrics', 'VISA', 'HR_MANAGER', 7],
  ['Labour card / work permit issued', 'VISA', 'HR_MANAGER', 14],
];

const TEMPLATES: { name: string; category: JobCategory | null; extra: Task[] }[] = [
  { name: 'Standard onboarding', category: null, extra: [] },
  {
    name: 'Drivers',
    category: 'DRIVER',
    extra: [
      ['Verify UAE driving licence', 'DOCUMENTS', 'HR_MANAGER', -7],
      ['Vehicle and route familiarisation', 'INDUCTION', 'HR_MANAGER', 1],
    ],
  },
  {
    name: 'Healthcare staff',
    category: 'HEALTHCARE',
    extra: [['Verify DHA/DOH professional licence', 'DOCUMENTS', 'HR_MANAGER', -14]],
  },
  {
    name: 'Construction and electrical trades',
    category: 'CONSTRUCTION',
    extra: [['Issue PPE and site access card', 'OTHER', 'HR_MANAGER', 0]],
  },
];

/**
 * Onboarding templates (US-ONB-01). Reference data, seeded everywhere; only created when missing
 * so HR's later edits are never overwritten.
 */
export async function seedOnboardingTemplates(prisma: PrismaClient): Promise<void> {
  for (const t of TEMPLATES) {
    const exists = await prisma.onboardingTemplate.findFirst({ where: { category: t.category } });
    if (exists) continue;
    await prisma.onboardingTemplate.create({
      data: {
        name: t.name,
        category: t.category,
        tasks: {
          create: [...COMMON, ...t.extra]
            .sort((a, b) => a[3] - b[3])
            .map(([title, type, assigneeRole, dueOffsetDays], sortOrder) => ({
              title,
              type,
              assigneeRole,
              dueOffsetDays,
              sortOrder,
            })),
        },
      },
    });
  }
}
