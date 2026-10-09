import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ReportTable } from './reports.service';

export const EXPORT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const;

/**
 * RFC 4180 CSV. Cells starting with = + - @ are prefixed with ' so spreadsheet apps don't run
 * them as formulas (CSV injection).
 */
export function toCsv(t: ReportTable): string {
  const cell = (v: string | number | null) => {
    if (v === null) return '';
    if (typeof v === 'number') return String(v);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [t.columns, ...t.rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export async function toXlsx(t: ReportTable): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'StaffOS';
  const ws = wb.addWorksheet(t.title.slice(0, 31));
  ws.addRow(t.columns).font = { bold: true };
  // Strings are written as plain values (never formulas), so nothing in a cell is evaluated.
  for (const row of t.rows) ws.addRow(row);
  ws.columns.forEach((c) => {
    c.width = 18;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(t: ReportTable, subtitle: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(t.title).moveDown(0.2);
    doc.fontSize(9).fillColor('#555').text(subtitle).moveDown();
    const width = (doc.page.width - 80) / t.columns.length;
    const row = (cells: (string | number | null)[], bold = false) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor('#000');
      cells.forEach((c, i) =>
        doc.text(c === null ? '' : String(c), 40 + i * width, y, { width: width - 6 }),
      );
      doc.moveDown(0.4);
      doc.x = 40;
    };
    row(t.columns, true);
    for (const r of t.rows) row(r);
    if (t.rows.length === 0) doc.text('No data for these filters.');
    doc.end();
  });
}
