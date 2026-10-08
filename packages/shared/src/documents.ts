import { z } from 'zod';
import { isoDate } from './crm.js';
import { IDENTITY_DOCUMENT_TYPES } from './domain.js';
import { DocumentType } from './enums.js';

// Documents (docs/api-contract.md §2.13, security.md §3).

export const documentTypeSchema = z.enum(
  Object.values(DocumentType) as [DocumentType, ...DocumentType[]],
);
export const documentOwnerTypeSchema = z.enum(['CANDIDATE', 'EMPLOYEE']);
export type DocumentOwnerType = z.infer<typeof documentOwnerTypeSchema>;

/** Types the nightly job watches for expiry (US-DOCS-02). */
export const EXPIRY_TRACKED_TYPES: readonly DocumentType[] = [
  ...IDENTITY_DOCUMENT_TYPES,
  'MEDICAL',
];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_ACCEPT = '.pdf,.docx,.jpg,.jpeg,.png';

const optionalDate = isoDate.optional().or(z.literal('').transform(() => undefined));
const issueBeforeExpiry = (v: { issueDate?: string; expiryDate?: string }) =>
  !v.issueDate || !v.expiryDate || v.issueDate <= v.expiryDate;
const dateIssue = {
  message: 'The expiry date must be after the issue date.',
  path: ['expiryDate'],
};

const metadata = {
  type: documentTypeSchema,
  number: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  issueDate: optionalDate,
  expiryDate: optionalDate,
};

/** Multipart text fields that accompany the file. */
export const documentUploadSchema = z
  .strictObject({
    ownerType: documentOwnerTypeSchema,
    ownerId: z.uuid(),
    ...metadata,
  })
  .refine(issueBeforeExpiry, dateIssue);
export type DocumentUpload = z.input<typeof documentUploadSchema>;
export type DocumentUploadData = z.output<typeof documentUploadSchema>;

export const documentUpdateSchema = z
  .strictObject({
    type: metadata.type.optional(),
    number: metadata.number,
    issueDate: optionalDate.nullable(),
    expiryDate: optionalDate.nullable(),
  })
  .refine((v) => !v.issueDate || !v.expiryDate || v.issueDate <= v.expiryDate, dateIssue);
export type DocumentUpdate = z.input<typeof documentUpdateSchema>;
export type DocumentUpdateData = z.output<typeof documentUpdateSchema>;

export const documentListQuerySchema = z.strictObject({
  ownerType: documentOwnerTypeSchema,
  ownerId: z.uuid(),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const expiringQuerySchema = z.strictObject({
  withinDays: z.coerce.number().int().min(0).max(365).default(30),
});

export const expiryStatusSchema = z.enum(['VALID', 'EXPIRING', 'EXPIRED']);
export type ExpiryStatus = z.infer<typeof expiryStatusSchema>;

export const documentSchema = z.object({
  id: z.uuid(),
  ownerType: documentOwnerTypeSchema,
  ownerId: z.uuid(),
  /** Set on the expiring-documents list. */
  ownerName: z.string().optional(),
  type: documentTypeSchema,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  /** Masked except the last 4 characters (security.md §3). */
  number: z.string().nullable(),
  issueDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  expiryStatus: expiryStatusSchema.nullable(),
  uploadedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.string(),
  /** Upload only: e.g. ALREADY_EXPIRED (saved anyway, US-DOCS-01). */
  warnings: z.array(z.string()).optional(),
});
export type Document = z.infer<typeof documentSchema>;

export const signedUrlSchema = z.object({ url: z.string(), expiresAt: z.string() });
export type SignedUrl = z.infer<typeof signedUrlSchema>;

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CV: 'CV',
  PASSPORT: 'Passport',
  VISA: 'Visa',
  EMIRATES_ID: 'Emirates ID',
  LABOUR_CARD: 'Labour card',
  MEDICAL: 'Medical certificate',
  CERTIFICATE: 'Certificate',
  CONTRACT: 'Contract',
  OTHER: 'Other',
};

/** Days until expiry → status. Within 30 days counts as expiring (US-DOCS-02). */
export function expiryStatus(expiryDate: string | null, today: string): ExpiryStatus | null {
  if (!expiryDate) return null;
  if (expiryDate < today) return 'EXPIRED';
  const days = (Date.parse(expiryDate) - Date.parse(today)) / 86_400_000;
  return days <= 30 ? 'EXPIRING' : 'VALID';
}
