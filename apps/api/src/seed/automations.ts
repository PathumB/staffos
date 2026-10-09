import type { AutomationAction, Condition } from '@staffos/shared';
import type { PrismaClient } from '../generated/prisma/client';

const LARGE_REQUEST_WORKFLOW = 'Large manpower request approval';

/**
 * US-AUTO-02 seeded rules plus the approval chain rule 3 starts. Idempotent by name, and an
 * admin's later edits are kept (existing rows are never overwritten).
 *
 * The onboarding plan and the account manager's "Hired" alert are created inside the hire
 * transaction (so they can't be lost), and the nightly expiry job always alerts HR; these rules
 * add the configurable follow-ups on top.
 */
export async function seedAutomations(prisma: PrismaClient): Promise<void> {
  let workflow = await prisma.workflowDefinition.findFirst({
    where: { name: LARGE_REQUEST_WORKFLOW },
  });
  workflow ??= await prisma.workflowDefinition.create({
    data: {
      name: LARGE_REQUEST_WORKFLOW,
      subject: 'MANPOWER_REQUEST',
      steps: {
        create: [{ stepOrder: 1, name: 'HR Manager approval', approverRole: 'HR_MANAGER' }],
      },
    },
  });

  const rules: {
    name: string;
    event: 'EMPLOYEE_HIRED' | 'DOCUMENT_EXPIRING' | 'MANPOWER_REQUEST_CREATED';
    conditions: Condition[];
    actions: AutomationAction[];
  }[] = [
    {
      name: 'When hired → onboarding plan + notify account manager',
      event: 'EMPLOYEE_HIRED',
      conditions: [],
      actions: [
        {
          type: 'create_task',
          title: 'Plan deployment for {{candidateName}} ({{clientName}})',
          assigneeRole: 'ACCOUNT_MANAGER',
          dueInDays: 3,
        },
        {
          type: 'notify',
          to: 'recruiter',
          message: '{{candidateName}} was hired; onboarding has started.',
        },
      ],
    },
    {
      name: 'When a passport expires in 30 days → email HR + task',
      event: 'DOCUMENT_EXPIRING',
      conditions: [
        { field: 'documentType', op: 'eq', value: 'PASSPORT' },
        { field: 'thresholdDays', op: 'eq', value: 30 },
      ],
      actions: [
        { type: 'send_email', template: 'document_expiring', to: 'hr' },
        {
          type: 'create_task',
          title: 'Book passport renewal appointment for {{employeeName}}',
          assigneeRole: 'HR_MANAGER',
          dueInDays: 7,
        },
      ],
    },
    {
      name: 'When a manpower request has headcount > 20 → require HR Manager approval',
      event: 'MANPOWER_REQUEST_CREATED',
      conditions: [{ field: 'headcount', op: 'gt', value: 20 }],
      actions: [{ type: 'start_approval', workflowId: workflow.id }],
    },
  ];
  for (const rule of rules) {
    const exists = await prisma.automationRule.findFirst({ where: { name: rule.name } });
    if (exists) continue;
    await prisma.automationRule.create({
      data: {
        name: rule.name,
        event: rule.event,
        conditions: rule.conditions,
        actions: rule.actions,
      },
    });
  }
}
