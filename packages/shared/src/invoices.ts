import { z } from 'zod';
import { isoDate } from './crm.js';
import { InvoiceStatus } from './enums.js';
import { pageQuery, sortSchema } from './pagination.js';

// Invoices (docs/api-contract.md §2.17). Money is integer fils; minutes, not hours.

export const invoiceStatusSchema = z.enum(
  Object.values(InvoiceStatus) as [InvoiceStatus, ...InvoiceStatus[]],
);

export const invoiceGenerateSchema = z
  .strictObject({ clientId: z.uuid(), periodStart: isoDate, periodEnd: isoDate })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'The period must end on or after its start.',
    path: ['periodEnd'],
  });
export type InvoiceGenerate = z.input<typeof invoiceGenerateSchema>;

export const invoiceVoidSchema = z.strictObject({
  version: z.number().int().min(1),
  reason: z.string().trim().min(1, 'Required.').max(500),
});
export const invoiceIssueSchema = z.strictObject({ version: z.number().int().min(1) });
export const invoicePaidSchema = z.strictObject({
  version: z.number().int().min(1),
  paidOn: isoDate,
});

export const invoiceLineSchema = z.object({
  deploymentId: z.uuid(),
  employeeName: z.string(),
  description: z.string(),
  minutes: z.number().int(),
  rateFils: z.number().int(),
  amountFils: z.number().int(),
});

export const invoiceSchema = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  client: z.object({ id: z.uuid(), name: z.string() }),
  status: invoiceStatusSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  paidOn: z.string().nullable(),
  currency: z.string(),
  subtotalFils: z.number().int(),
  vatRateBps: z.number().int(),
  vatFils: z.number().int(),
  totalFils: z.number().int(),
  voidReason: z.string().nullable(),
  pdfReady: z.boolean(),
  timesheetCount: z.number().int(),
  lines: z.array(invoiceLineSchema).optional(),
  version: z.number().int(),
  createdAt: z.string(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceListQuerySchema = z.strictObject({
  ...pageQuery(),
  sort: sortSchema(['createdAt', 'issueDate', 'totalFils'], '-createdAt'),
  filter: z
    .strictObject({ clientId: z.uuid().optional(), status: invoiceStatusSchema.optional() })
    .optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PAID: 'Paid',
  VOID: 'Void',
};

/** amount = minutes × rate per hour ÷ 60, rounded half-up, in integer fils (no floats). */
export function lineAmountFils(minutes: number, rateFilsPerHour: number): number {
  return Math.floor((minutes * rateFilsPerHour + 30) / 60);
}

/** VAT in basis points (500 = 5%), rounded half-up. */
export function vatFils(subtotalFils: number, vatRateBps: number): number {
  return Math.floor((subtotalFils * vatRateBps + 5_000) / 10_000);
}
