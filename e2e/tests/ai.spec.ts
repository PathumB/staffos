import { expect, test } from '@playwright/test';
import { captureDiagnostics } from './diagnostics';

// Journey 2 (docs/00-master-plan.md §7): recruiter uploads a CV → AI fills the profile →
// recruiter confirms → match score shown. The E2E API runs the deterministic mock provider.
const PASSWORD = 'StaffOS-Demo-2026!';
captureDiagnostics();

/** A minimal, valid single-page PDF with real text (so text extraction runs as in production). */
function pdfWithText(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = `BT /F1 11 Tf 50 760 Td 16 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('a recruiter creates a candidate from a CV and sees match scores', async ({ page }) => {
  test.slow();
  const unique = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const email = `amina.${unique}@candidates.example`;
  const cv = pdfWithText([
    `Amina Cv${unique}`,
    `${email} | +971 52 444 0199`,
    'Forklift Operator with five years of warehouse experience in Jebel Ali and KEZAD.',
    'Skills: forklift licence, warehouse safety, stock counting, SAP basics.',
  ]);

  await page.goto('/login');
  await page.getByLabel('Email').fill('recruiter@staffos.demo');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

  // Upload → the form opens pre-filled, labelled as an AI-assisted suggestion.
  await page.goto('/candidates');
  await page.getByRole('button', { name: 'From CV' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('CV file')
    .setInputFiles({ name: 'amina-cv.pdf', mimeType: 'application/pdf', buffer: cv });
  await page.getByRole('dialog').getByRole('button', { name: 'Upload and read' }).click();
  const form = page.getByRole('dialog', { name: 'New candidate' });
  await expect(form.getByRole('note')).toContainText('AI-assisted suggestion');
  await expect(form.getByLabel('First name')).toHaveValue('Amina');
  await expect(form.getByLabel('Email')).toHaveValue(email);
  await expect(form.getByText(/AI was unsure about this/)).toBeVisible(); // the phone

  // Confirm → saved with the CV attached.
  await form.getByRole('button', { name: /Save|Create/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Amina Cv${unique}`) })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download CV' })).toBeVisible();

  // Match scores on the recruiter's demo job.
  await page.goto('/jobs?search=Forklift%20Operator&status=OPEN');
  await page.getByRole('link', { name: 'Forklift Operator', exact: true }).first().click();
  await page.getByRole('button', { name: 'Rank with AI' }).click();
  await expect(page.getByRole('meter').first()).toBeVisible();
  await expect(page.getByText('AI-assisted suggestion').first()).toBeVisible();
});
