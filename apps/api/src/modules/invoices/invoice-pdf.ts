import PDFDocument from 'pdfkit';

export type InvoicePdfData = {
  number: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  client: { name: string; trn: string | null; address: string };
  lines: { description: string; minutes: number; rateFils: number; amountFils: number }[];
  subtotalFils: number;
  vatRateBps: number;
  vatFils: number;
  totalFils: number;
};

/** The (fictional) issuing company printed on every invoice. */
const ISSUER = {
  name: 'StaffOS Staffing Services LLC',
  address: 'Office 801, Business Bay Tower, Dubai, United Arab Emirates',
  trn: '100000000000099',
};

const money = (fils: number, currency: string) =>
  `${currency} ${(fils / 100).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hours = (minutes: number) => (minutes / 60).toFixed(2);

/**
 * Renders a UAE tax invoice (pdfkit, built-in Helvetica only, so no font files ship with the app).
 * Pure: data in, PDF bytes out; the job decides where they are stored.
 */
export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Invoice ${data.number}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text('TAX INVOICE', { align: 'right' });
    doc.moveDown(0.3).fontSize(10).font('Helvetica').text(data.number, { align: 'right' });
    doc.moveUp(2).font('Helvetica-Bold').fontSize(12).text(ISSUER.name);
    doc.font('Helvetica').fontSize(9).text(ISSUER.address).text(`TRN ${ISSUER.trn}`);

    doc.moveDown(1.5).fontSize(9).font('Helvetica-Bold').text('Bill to');
    doc.font('Helvetica').text(data.client.name).text(data.client.address);
    if (data.client.trn) doc.text(`TRN ${data.client.trn}`);

    const top = doc.y + 15;
    doc.fontSize(9);
    [
      ['Issue date', data.issueDate],
      ['Due date', data.dueDate],
      ['Service period', `${data.periodStart} to ${data.periodEnd}`],
    ].forEach(([label, value], i) => {
      doc.font('Helvetica-Bold').text(label!, 50, top + i * 14, { continued: true });
      doc.font('Helvetica').text(`  ${value}`);
    });

    // Lines
    let y = top + 60;
    const cols = { desc: 50, hours: 330, rate: 390, amount: 470 };
    doc.font('Helvetica-Bold');
    doc.text('Description', cols.desc, y).text('Hours', cols.hours, y);
    doc.text('Rate/h', cols.rate, y).text('Amount', cols.amount, y, { width: 75, align: 'right' });
    y += 16;
    doc
      .moveTo(50, y - 4)
      .lineTo(545, y - 4)
      .strokeColor('#cbd5e1')
      .stroke();
    doc.font('Helvetica');
    for (const line of data.lines) {
      const height = doc.heightOfString(line.description, { width: 270 });
      if (y + height > 740) {
        doc.addPage();
        y = 50;
      }
      doc.text(line.description, cols.desc, y, { width: 270 });
      doc.text(hours(line.minutes), cols.hours, y);
      doc.text((line.rateFils / 100).toFixed(2), cols.rate, y);
      doc.text(money(line.amountFils, data.currency), cols.amount, y, {
        width: 75,
        align: 'right',
      });
      y += Math.max(height, 12) + 6;
    }

    // Totals
    y += 6;
    doc.moveTo(330, y).lineTo(545, y).stroke();
    y += 8;
    const total = (label: string, value: string, bold = false) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, 330, y)
        .text(value, cols.amount, y, {
          width: 75,
          align: 'right',
        });
      y += 15;
    };
    total('Subtotal', money(data.subtotalFils, data.currency));
    total(`VAT ${(data.vatRateBps / 100).toFixed(2)}%`, money(data.vatFils, data.currency));
    total('Total due', money(data.totalFils, data.currency), true);

    doc
      .fontSize(8)
      .fillColor('#475569')
      .text(
        'Portfolio demonstration document. StaffOS and all companies named are fictional.',
        50,
        790,
        { width: 495, align: 'center' },
      );
    doc.end();
  });
}
