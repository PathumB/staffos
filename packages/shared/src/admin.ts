import { z } from 'zod';

// Settings, integrations and system health (docs/api-contract.md §2.22–2.23).

/** Runtime settings an admin can change; each one is read by the code that uses it. */
export const settingsSchema = z.object({
  /** Manpower requests above this headcount need approval (US-MR-01). */
  manpowerApprovalThreshold: z.number().int().min(1).max(10_000),
  /** Month-to-date AI spend limit in USD; 0 = no limit. Overrides AI_MONTHLY_BUDGET_USD. */
  'ai.monthlyBudgetUsd': z.number().min(0).max(100_000),
  /** VAT for new clients when none is given, in basis points (500 = 5 %). */
  'vat.defaultRateBps': z.number().int().min(0).max(10_000),
});
export type Settings = z.infer<typeof settingsSchema>;
export const settingsUpdateSchema = settingsSchema.partial().strict();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const SETTING_DEFAULTS: Settings = {
  manpowerApprovalThreshold: 20,
  'ai.monthlyBudgetUsd': 0,
  'vat.defaultRateBps': 500,
};

export const SETTING_LABELS: Record<keyof Settings, { label: string; hint: string }> = {
  manpowerApprovalThreshold: {
    label: 'Approval threshold (headcount)',
    hint: 'Requests for more people than this need HR Manager approval.',
  },
  'ai.monthlyBudgetUsd': {
    label: 'Monthly AI budget (USD)',
    hint: '0 means no limit. AI features pause when the month’s estimated cost reaches it.',
  },
  'vat.defaultRateBps': {
    label: 'Default VAT for new clients (basis points)',
    hint: '500 = 5 % (UAE standard rate).',
  },
};

export const integrationStatusSchema = z.object({
  key: z.enum(['mail', 'storage', 'llm', 'zoho', 'captcha']),
  name: z.string(),
  provider: z.string(),
  status: z.enum(['ok', 'not_configured', 'dev_only']),
  detail: z.string(),
});
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const zohoSyncResultSchema = z.object({
  jobId: z.string(),
});

export const systemHealthSchema = z.object({
  db: z.enum(['ok', 'down']),
  demoMode: z.boolean(),
  queue: z.object({ mode: z.enum(['pg-boss', 'inline']), pending: z.number().int().nullable() }),
  ai: z.object({
    provider: z.string(),
    model: z.string(),
    last24h: z.number().int(),
    failed24h: z.number().int(),
  }),
  automationRuns: z.object({ failed24h: z.number().int(), last: z.string().nullable() }),
  webhooks: z.object({ failed24h: z.number().int(), pending: z.number().int() }),
  notificationsUnsent: z.number().int(),
  lastSync: z.object({ zoho: z.string().nullable() }),
});
export type SystemHealth = z.infer<typeof systemHealthSchema>;
