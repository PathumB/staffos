import { describe, expect, it } from 'vitest';
import {
  actionSchema,
  automationRuleInputSchema,
  conditionPasses,
  conditionsMatch,
  fillTemplate,
  nextApprovalState,
  webhookInputSchema,
  webhookRetryDelayMs,
} from './automation.js';

describe('nextApprovalState (US-WF-01)', () => {
  it('moves step by step and completes on the last approval', () => {
    expect(nextApprovalState(1, 3, 'APPROVED')).toEqual({ outcome: 'ADVANCED', currentStep: 2 });
    expect(nextApprovalState(2, 3, 'APPROVED')).toEqual({ outcome: 'ADVANCED', currentStep: 3 });
    expect(nextApprovalState(3, 3, 'APPROVED')).toEqual({ outcome: 'APPROVED', currentStep: 3 });
  });

  it('ends the chain on a rejection at any step', () => {
    expect(nextApprovalState(1, 3, 'REJECTED').outcome).toBe('REJECTED');
    expect(nextApprovalState(2, 3, 'REJECTED')).toEqual({ outcome: 'REJECTED', currentStep: 2 });
  });
});

describe('conditions (US-AUTO-01)', () => {
  const payload = { headcount: 25, documentType: 'PASSPORT', to: 'OFFER', missing: null };

  it('supports =, !=, >, < and in', () => {
    expect(conditionPasses({ field: 'documentType', op: 'eq', value: 'PASSPORT' }, payload)).toBe(
      true,
    );
    expect(conditionPasses({ field: 'documentType', op: 'neq', value: 'VISA' }, payload)).toBe(
      true,
    );
    expect(conditionPasses({ field: 'headcount', op: 'gt', value: 20 }, payload)).toBe(true);
    expect(conditionPasses({ field: 'headcount', op: 'gt', value: 25 }, payload)).toBe(false);
    expect(conditionPasses({ field: 'headcount', op: 'lt', value: 30 }, payload)).toBe(true);
    expect(conditionPasses({ field: 'to', op: 'in', value: ['OFFER', 'HIRED'] }, payload)).toBe(
      true,
    );
    expect(conditionPasses({ field: 'to', op: 'in', value: ['HIRED'] }, payload)).toBe(false);
  });

  it('compares numbers sent as strings, never matches missing fields', () => {
    expect(conditionPasses({ field: 'headcount', op: 'eq', value: '25' }, payload)).toBe(true);
    expect(conditionPasses({ field: 'headcount', op: 'gt', value: 'abc' }, payload)).toBe(false);
    expect(conditionPasses({ field: 'missing', op: 'neq', value: 'x' }, payload)).toBe(false);
    expect(conditionPasses({ field: 'nope', op: 'neq', value: 'x' }, payload)).toBe(false);
  });

  it('combines conditions with AND; no conditions always match', () => {
    const big = { field: 'headcount', op: 'gt', value: 20 } as const;
    const passport = { field: 'documentType', op: 'eq', value: 'VISA' } as const;
    expect(conditionsMatch([], payload)).toBe(true);
    expect(conditionsMatch([big], payload)).toBe(true);
    expect(conditionsMatch([big, passport], payload)).toBe(false);
  });
});

describe('fillTemplate', () => {
  it('fills known fields and blanks unknown ones, without evaluating anything', () => {
    expect(fillTemplate('Hi {{ name }}, {{n}} {{unknown}}!', { name: 'Aisha', n: 3 })).toBe(
      'Hi Aisha, 3 !',
    );
    expect(fillTemplate('{{constructor.constructor}}', {})).toBe('{{constructor.constructor}}');
  });
});

describe('rule schema', () => {
  it('accepts the six supported actions and rejects others', () => {
    for (const a of [
      {
        type: 'create_task',
        title: 'Call {{candidateName}}',
        assigneeRole: 'HR_MANAGER',
        dueInDays: 2,
      },
      { type: 'send_email', template: 'employee_hired', to: 'hr' },
      { type: 'send_email', template: 'stage_changed', to: 'ops@example.com' },
      { type: 'notify', to: 'recruiter', message: 'Hi' },
      { type: 'assign_user', userId: '0190a000-0000-7000-8000-000000000001' },
      { type: 'start_approval', workflowId: '0190a000-0000-7000-8000-000000000001' },
      { type: 'call_webhook', webhookId: '0190a000-0000-7000-8000-000000000001' },
    ]) {
      expect(actionSchema.safeParse(a).success).toBe(true);
    }
    expect(actionSchema.safeParse({ type: 'run_script', code: 'x' }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'send_email', template: 'nope', to: 'hr' }).success).toBe(
      false,
    );
  });

  it('needs at least one action and only known events', () => {
    const base = { name: 'R', event: 'EMPLOYEE_HIRED', actions: [] };
    expect(automationRuleInputSchema.safeParse(base).success).toBe(false);
    expect(
      automationRuleInputSchema.safeParse({
        ...base,
        event: 'INVOICE_ISSUED',
        actions: [{ type: 'notify', to: 'hr', message: 'x' }],
      }).success,
    ).toBe(false);
  });
});

describe('webhooks (US-HOOK-01)', () => {
  it('only accepts https endpoints and subscribable events', () => {
    const ok = { url: 'https://hooks.example.com/staffos', events: ['EMPLOYEE_HIRED'] };
    expect(webhookInputSchema.safeParse(ok).success).toBe(true);
    expect(webhookInputSchema.safeParse({ ...ok, url: 'http://hooks.example.com' }).success).toBe(
      false,
    );
    expect(webhookInputSchema.safeParse({ ...ok, events: ['DOCUMENT_EXPIRING'] }).success).toBe(
      false,
    );
  });

  it('backs off exponentially', () => {
    expect([1, 2, 3, 4].map(webhookRetryDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
  });
});
