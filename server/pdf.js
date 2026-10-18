const PDFDocument = require('pdfkit');

/**
 * Streams a simple table report as a PDF.
 * columns: [{ label, width, align? }]  (widths should add up to ~495 for A4 portrait)
 * rows / totals: arrays of arrays of strings.
 */
function tablePdf(res, filename, { school, title, subtitle, meta = [], columns, rows, totals = [] }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
  const ROW_H = 22;

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0d1b40').text(school, left, 50);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(title, left, doc.y + 4);
  doc.font('Helvetica').fontSize(9).fillColor('#64748b');
  if (subtitle) doc.text(subtitle);
  for (const m of meta) doc.text(m);
  doc.moveDown(0.8);

  let y = doc.y;

  function header() {
    let x = left;
    doc.rect(left, y, columns.reduce((a, c) => a + c.width, 0), ROW_H).fill('#f1f5f9');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155');
    for (const c of columns) {
      doc.text(c.label, x + 5, y + 7, { width: c.width - 10, align: c.align || 'left', lineBreak: false });
      x += c.width;
    }
    y += ROW_H;
  }

  function row(cells, { bold = false, shade = false } = {}) {
    if (y + ROW_H > bottom()) { doc.addPage(); y = doc.page.margins.top; header(); }
    let x = left;
    const fullW = columns.reduce((a, c) => a + c.width, 0);
    if (shade) doc.rect(left, y, fullW, ROW_H).fill('#f8fafc');
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#1e293b');
    cells.forEach((cell, i) => {
      const c = columns[i];
      doc.text(String(cell ?? ''), x + 5, y + 7, { width: c.width - 10, align: c.align || 'left', lineBreak: false, ellipsis: true });
      x += c.width;
    });
    doc.moveTo(left, y + ROW_H).lineTo(left + fullW, y + ROW_H).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
    y += ROW_H;
  }

  header();
  if (rows.length === 0) row(['No records.'].concat(columns.slice(1).map(() => '')));
  rows.forEach((r) => row(r));
  totals.forEach((r) => row(r, { bold: true, shade: true }));

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
      .text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 35, { width: 495, align: 'center', lineBreak: false });
  }
  doc.end();
}

module.exports = { tablePdf };
