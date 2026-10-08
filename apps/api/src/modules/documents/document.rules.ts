import { HttpStatus } from '@nestjs/common';
import { MAX_UPLOAD_BYTES } from '@staffos/shared';
import { AppException } from '../../common/errors/app.exception';

export type UploadedFile = { originalname: string; size: number; buffer: Buffer };
export type FileKind = { ext: 'pdf' | 'docx' | 'jpg' | 'png'; mimeType: string };

const invalid = (message: string) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_FILE', message);

/**
 * Detects the real file type from its first bytes (security.md §3): the extension and the
 * browser's Content-Type are attacker-controlled; magic bytes are not.
 */
export function detectFileKind(file: UploadedFile | undefined): FileKind {
  if (!file || file.size === 0) throw invalid('Choose a file to upload.');
  if (file.size > MAX_UPLOAD_BYTES) throw invalid('Files can be at most 10 MB.');
  const b = file.buffer;
  const ext = file.originalname.toLowerCase().split('.').pop();
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { ext: 'pdf', mimeType: 'application/pdf' };
  }
  if (b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG') {
    return { ext: 'png', mimeType: 'image/png' };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: 'jpg', mimeType: 'image/jpeg' };
  }
  // DOCX is a ZIP container; require the extension too, so other ZIPs are refused.
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 && ext === 'docx') {
    return {
      ext: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  throw invalid('Only PDF, Word (.docx), JPG and PNG files are accepted.');
}

/** Keeps a display-safe name: no paths, control characters or odd symbols; max 120 chars. */
export function sanitizeFileName(name: string, ext: string): string {
  const base = name
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${base || 'document'}.${ext}`;
}

/** "A1234567" → "••••4567": numbers are shown masked everywhere except the file itself. */
export function maskNumber(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

export const ALERT_THRESHOLDS = [30, 7] as const;

/**
 * US-DOCS-02: the alert threshold a document has reached (smallest one that applies), or null.
 * Expired documents fall under the smallest threshold, so they are alerted once too.
 */
export function dueThreshold(expiryDate: Date, today: Date): number | null {
  const days = Math.floor((expiryDate.getTime() - today.getTime()) / 86_400_000);
  const reached = ALERT_THRESHOLDS.filter((t) => days <= t);
  return reached.length ? Math.min(...reached) : null;
}
