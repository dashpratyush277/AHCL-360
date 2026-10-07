import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { env } from '../config/env.js';

const inr = (n) => (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Generic tabular report.
 * columns: [{ key, header, width?, format? }] ; rows: plain objects
 */
export async function sendTableReport(res, { title, subtitle, columns, rows, format = 'pdf', filename, summary = [] }) {
  const safeName = (filename || title).replace(/[^\w-]+/g, '_');
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = `${env.company.name} 360`;
    const ws = wb.addWorksheet(title.slice(0, 31));
    ws.addRow([title]).font = { bold: true, size: 14 };
    if (subtitle) ws.addRow([subtitle]);
    ws.addRow([]);
    const header = ws.addRow(columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }));
    rows.forEach((r) => ws.addRow(columns.map((c) => r[c.key] ?? '')));
    if (summary.length) {
      ws.addRow([]);
      summary.forEach(([k, v]) => (ws.addRow([k, v]).font = { bold: true }));
    }
    columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ? c.width / 5 : 18));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }

  const doc = new PDFDocument({ size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
  doc.pipe(res);
  header(doc, title, subtitle);

  const usable = doc.page.width - 72;
  const totalW = columns.reduce((a, c) => a + (c.width || 80), 0);
  const widths = columns.map((c) => ((c.width || 80) / totalW) * usable);
  const drawRow = (vals, bold) => {
    const y = doc.y;
    const h = Math.max(...vals.map((v, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).heightOfString(String(v ?? ''), { width: widths[i] - 4 }))) + 6;
    if (y + h > doc.page.height - 50) {
      doc.addPage();
      return drawRow(vals, bold);
    }
    if (bold) doc.rect(36, y, usable, h).fill('#E8EEF7').fillColor('black');
    let x = 36;
    vals.forEach((v, i) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(String(v ?? ''), x + 2, y + 3, { width: widths[i] - 4 });
      x += widths[i];
    });
    doc.moveTo(36, y + h).lineTo(36 + usable, y + h).strokeColor('#DDDDDD').stroke();
    doc.y = y + h;
  };
  drawRow(columns.map((c) => c.header), true);
  rows.forEach((r) => drawRow(columns.map((c) => (c.format ? c.format(r[c.key], r) : r[c.key]))));
  if (!rows.length) doc.moveDown().fontSize(10).text('No records for the selected period.', 36);
  if (summary.length) {
    doc.moveDown();
    summary.forEach(([k, v]) => doc.font('Helvetica-Bold').fontSize(10).text(`${k}: ${v}`, 36));
  }
  doc.end();
}

function header(doc, title, subtitle) {
  doc.font('Helvetica-Bold').fontSize(16).text(`${env.company.name} 360°`, { continued: true }).font('Helvetica').fontSize(10).text(`   Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'right' });
  doc.moveDown(0.3).font('Helvetica-Bold').fontSize(13).text(title);
  if (subtitle) doc.font('Helvetica').fontSize(9).fillColor('#555').text(subtitle).fillColor('black');
  doc.moveDown(0.6);
}

/** GST tax invoice PDF. */
export function sendInvoicePdf(res, inv) {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${inv.invoiceNo.replace(/\//g, '-')}.pdf"`);
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(16).text('TAX INVOICE', { align: 'center' }).moveDown(0.5);
  const top = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').text(inv.seller.name, 36, top).font('Helvetica').text(inv.seller.address, { width: 250 }).text(`GSTIN: ${inv.seller.gstin}`).text(`State code: ${inv.seller.stateCode}`);
  doc.font('Helvetica-Bold').text(`Invoice No: ${inv.invoiceNo}`, 330, top).font('Helvetica').text(`Date: ${new Date(inv.issuedAt).toLocaleDateString('en-IN')}`, 330).text(`Place of supply: ${inv.placeOfSupply || '-'}`, 330).text(`Reverse charge: No`, 330);
  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').text('Bill To:', 36).font('Helvetica').text(inv.buyer.name).text(inv.buyer.address || '', { width: 260 }).text(`GSTIN: ${inv.buyer.gstin || 'Unregistered'}`);
  doc.moveDown();

  const cols = inv.interState
    ? ['#', 'Item', 'HSN', 'Qty', 'Rate', 'Disc%', 'Taxable', 'IGST', 'Total']
    : ['#', 'Item', 'HSN', 'Qty', 'Rate', 'Disc%', 'Taxable', 'CGST', 'SGST', 'Total'];
  const w = inv.interState ? [20, 150, 50, 35, 55, 35, 70, 55, 70] : [20, 130, 45, 32, 50, 32, 62, 50, 50, 62];
  const row = (vals, bold) => {
    const y = doc.y;
    let x = 36;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    vals.forEach((v, i) => {
      doc.text(String(v), x + 2, y + 3, { width: w[i] - 4, align: i > 2 ? 'right' : 'left' });
      x += w[i];
    });
    doc.y = y + 16;
    doc.moveTo(36, doc.y).lineTo(559, doc.y).strokeColor('#CCCCCC').stroke();
  };
  row(cols, true);
  inv.items.forEach((it, idx) => {
    const tax = inv.interState ? [`${inr(it.igst)} (${it.gstRate}%)`] : [`${inr(it.cgst)}`, `${inr(it.sgst)}`];
    row([idx + 1, it.name, it.hsn || '-', `${it.qty} ${it.unit || ''}`, inr(it.rate), it.discountPct || 0, inr(it.taxable), ...tax, inr(it.total)]);
  });

  doc.moveDown();
  const line = (k, v) => {
    const y = doc.y;
    doc.fontSize(9).text(k, 350, y, { width: 110 });
    doc.text(v, 460, y, { width: 99, align: 'right' });
  };
  line('Taxable value', inr(inv.taxableTotal));
  if (inv.interState) line('IGST', inr(inv.igstTotal));
  else {
    line('CGST', inr(inv.cgstTotal));
    line('SGST', inr(inv.sgstTotal));
  }
  line('Round off', inr(inv.roundOff));
  doc.font('Helvetica-Bold');
  line('Grand Total (INR)', inr(inv.grandTotal));
  doc.moveDown().font('Helvetica-Oblique').fontSize(9).text(inv.amountInWords, 36);
  doc.moveDown(3).font('Helvetica').fontSize(8).text('This is a computer-generated invoice.', 36, doc.y, { align: 'center' });
  doc.end();
}

/** Payslip PDF from stored payslip data. */
export function sendPayslipPdf(res, slip, user) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Payslip-${slip.month}.pdf"`);
  doc.pipe(res);
  header(doc, `Payslip - ${slip.month}`, `${user.name} (${user.employeeCode || '-'}) | ${user.profile?.designation || ''}`);
  const block = (title, items, x) => {
    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text(title, x, y);
    y += 16;
    for (const it of items) {
      doc.font('Helvetica').fontSize(9).text(it.label, x, y).text(inr(it.amount), x + 120, y, { width: 100, align: 'right' });
      y += 14;
    }
    return y;
  };
  const start = doc.y;
  const y1 = block('Earnings', slip.earnings, 40);
  doc.y = start;
  const y2 = block('Deductions', slip.deductions, 310);
  doc.y = Math.max(y1, y2) + 10;
  doc.font('Helvetica-Bold').fontSize(11).text(`Gross: INR ${inr(slip.gross)}     Net Pay: INR ${inr(slip.net)}`, 40);
  if (slip.paidDays != null) doc.font('Helvetica').fontSize(9).text(`Paid days: ${slip.paidDays}`);
  doc.moveDown(2).fontSize(8).text('This is a system-generated payslip and does not require a signature.', { align: 'center' });
  doc.end();
}
