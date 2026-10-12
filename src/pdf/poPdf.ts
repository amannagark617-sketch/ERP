import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { rupeesInWords } from './words';

export interface PoDoc {
  company: { brandName: string; signatory: string };
  po: { poNo: string; date: string; expectedDate: string; terms: string; advanceRequired: boolean; advanceAmount: number; paymentTerms: string; preparedBy: string; department: string };
  vendor: { name: string; contact: string; email: string; phone: string; address: string; gstin: string; pan: string; msme: boolean; msmeType: string; udyamNo: string };
  lines: { name: string; brand: string; unit: string; qty: number; price: number }[];
  approvals: { by: string; date: string }[];
  standardTerms: string[];
  /** Not yet approved: print a DRAFT watermark so a draft can never be mistaken for an issued PO. */
  draft: boolean;
}
export interface PdfAssets { regular: Uint8Array; semibold: Uint8Array; logo: Uint8Array; logoRatio: number }

type RGB = [number, number, number];
// Brand palette (from the HR screening app + the Little Nap Recliners logo)
const INK: RGB = [29, 29, 31];
const MUTED: RGB = [110, 110, 115];
const BORDER: RGB = [217, 217, 222];
const RAISED: RGB = [245, 245, 247];
const RED: RGB = [215, 25, 32];
const WHITE: RGB = [255, 255, 255];

const W = 210, H = 297, MX = 16, CW = W - 2 * MX;
const BOTTOM = 272; // content must stop above the footer

function b64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const money = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const qtyFmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n || 0);
const dateFmt = (d: string) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

export function buildPoPdf(d: PoDoc, a: PdfAssets): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Inter-Regular.ttf', b64(a.regular));
  doc.addFileToVFS('Inter-SemiBold.ttf', b64(a.semibold));
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFont('Inter-SemiBold.ttf', 'Inter', 'bold');
  doc.setProperties({ title: `Purchase Order ${d.po.poNo}`, author: d.company.brandName, subject: `Purchase Order to ${d.vendor.name}` });

  const font = (weight: 'normal' | 'bold', size: number, color: RGB = INK) => { doc.setFont('Inter', weight); doc.setFontSize(size); doc.setTextColor(...color); };
  const wrap = (txt: string, width: number) => doc.splitTextToSize(txt, width) as string[];
  const label = (txt: string, x: number, y: number, color: RGB = MUTED) => { font('bold', 6.8, color); doc.text(txt.toUpperCase(), x, y, { charSpace: 0.35 }); };
  const rule = (y: number, color: RGB = BORDER, w = 0.2, x1 = MX, x2 = W - MX) => { doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(x1, y, x2, y); };
  const logoH = (w: number) => w * a.logoRatio;
  const total = d.lines.reduce((s, l) => s + l.qty * l.price, 0);

  // ---------------------------------------------------------------- header: logo + title (first page)
  const LOGO_W = 44;
  doc.addImage(a.logo, 'PNG', MX, 10, LOGO_W, logoH(LOGO_W));
  font('bold', 22); doc.text('PURCHASE ORDER', W - MX, 20, { align: 'right' });
  font('normal', 7.4, MUTED); doc.text('PO NUMBER', W - MX, 27.5, { align: 'right', charSpace: 0.35 });
  font('bold', 16, RED); doc.text(d.po.poNo || '—', W - MX, 34, { align: 'right' });
  font('normal', 8.6, MUTED); doc.text(`Date  ${dateFmt(d.po.date)}`, W - MX, 39.2, { align: 'right' });
  const hy = 10 + logoH(LOGO_W) + 5;
  rule(hy, INK, 0.35); rule(hy, RED, 1.2, MX, MX + 30);

  function compactHeader() {
    doc.addImage(a.logo, 'PNG', MX, 9, 20, logoH(20));
    font('bold', 9.5); doc.text(`Purchase Order ${d.po.poNo}`, W - MX, 13, { align: 'right' });
    font('normal', 7.6, MUTED); doc.text(`to ${d.vendor.name}`, W - MX, 17.6, { align: 'right' });
    rule(22, INK, 0.3); rule(22, RED, 0.9, MX, MX + 16);
  }

  // ---------------------------------------------------------------- vendor + order details
  let y = hy + 8;
  const bw = (CW - 6) / 2, pad = 4;
  const vendorLines: { text: string; bold?: boolean; muted?: boolean }[] = [];
  font('bold', 9.8);
  wrap(d.vendor.name, bw - 2 * pad).forEach(t => vendorLines.push({ text: t, bold: true }));
  wrap(d.vendor.address || '—', bw - 2 * pad).forEach(t => vendorLines.push({ text: t, muted: true }));
  vendorLines.push({ text: [d.vendor.gstin && `GSTIN ${d.vendor.gstin}`, d.vendor.pan && `PAN ${d.vendor.pan}`].filter(Boolean).join('   ·   ') || 'GSTIN —' });
  font('normal', 8.4);
  if (d.vendor.contact || d.vendor.phone || d.vendor.email) wrap([d.vendor.contact, d.vendor.phone, d.vendor.email].filter(Boolean).join('  ·  '), bw - 2 * pad).forEach(t => vendorLines.push({ text: t, muted: true }));
  if (d.vendor.msme) {
    vendorLines.push({ text: `MSME vendor${d.vendor.msmeType ? ' · ' + d.vendor.msmeType : ''}`, bold: true });
    if (d.vendor.udyamNo) wrap(`Udyam No. ${d.vendor.udyamNo}`, bw - 2 * pad).forEach(t => vendorLines.push({ text: t }));
  }

  const details: [string, string][] = [
    ['Delivery by', dateFmt(d.po.expectedDate)],
    ['Payment terms', d.po.paymentTerms],
    ['Advance', d.po.advanceRequired ? `₹${money(d.po.advanceAmount)} before dispatch` : 'Not required'],
    ['Prepared by', [d.po.preparedBy, d.po.department && `(${d.po.department})`].filter(Boolean).join(' ')],
  ];
  font('normal', 8.4);
  const rows = details.map(([k, v]) => ({ k, v: wrap(v || '—', bw - 2 * pad - 30) }));
  const detailH = rows.reduce((h, r) => h + Math.max(1, r.v.length) * 4.1 + 1.6, 0);
  const boxH = Math.max(vendorLines.length * 4.5, detailH) + 11;

  doc.setFillColor(...RAISED); doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.roundedRect(MX, y, bw, boxH, 1.8, 1.8, 'FD');
  doc.setFillColor(...WHITE);
  doc.roundedRect(MX + bw + 6, y, bw, boxH, 1.8, 1.8, 'FD');
  label('Vendor', MX + pad, y + 5.5);
  let vy = y + 10.5;
  vendorLines.forEach(l => { font(l.bold ? 'bold' : 'normal', l.bold ? 9.8 : 8.4, l.muted ? MUTED : INK); doc.text(l.text, MX + pad, vy); vy += 4.5; });
  label('Order details', MX + bw + 6 + pad, y + 5.5);
  let dy = y + 10.5;
  rows.forEach(r => {
    font('normal', 8, MUTED); doc.text(r.k, MX + bw + 6 + pad, dy);
    font('bold', 8.6, INK); r.v.forEach((t, i) => doc.text(t, MX + bw + 6 + pad + 30, dy + i * 4.1));
    dy += Math.max(1, r.v.length) * 4.1 + 1.6;
  });
  y += boxH + 8;

  // ---------------------------------------------------------------- items
  // The Brand column appears only when at least one line has a brand
  const hasBrand = d.lines.some(l => l.brand);
  const nc = hasBrand ? 7 : 6;
  const numCols = hasBrand ? [4, 5, 6] : [3, 4, 5];
  autoTable(doc, {
    startY: y,
    margin: { left: MX, right: MX, top: 28, bottom: H - BOTTOM },
    theme: 'plain',
    head: [hasBrand ? ['#', 'Item description', 'Brand', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)'] : ['#', 'Item description', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)']],
    body: d.lines.map((l, i) => (hasBrand
      ? [String(i + 1), l.name, l.brand || '—', l.unit, qtyFmt(l.qty), money(l.price), money(l.qty * l.price)]
      : [String(i + 1), l.name, l.unit, qtyFmt(l.qty), money(l.price), money(l.qty * l.price)])),
    foot: [[{ content: 'Order value (before tax)', colSpan: nc - 1, styles: { halign: 'right' } }, `₹ ${money(total)}`]],
    showFoot: 'lastPage',
    styles: { font: 'Inter', fontSize: 8.9, textColor: INK, cellPadding: { top: 2.9, bottom: 2.9, left: 2.4, right: 2.4 }, lineColor: BORDER, lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 }, valign: 'middle' },
    headStyles: { fillColor: INK, textColor: WHITE, fontStyle: 'bold', fontSize: 7.4, lineWidth: 0, cellPadding: { top: 3.2, bottom: 3.2, left: 2.4, right: 2.4 } },
    footStyles: { fillColor: RAISED, textColor: INK, fontStyle: 'bold', fontSize: 10, lineColor: INK, lineWidth: { top: 0.4, right: 0, bottom: 0, left: 0 }, cellPadding: { top: 3.4, bottom: 3.4, left: 2.4, right: 2.4 } },
    alternateRowStyles: { fillColor: [250, 250, 251] },
    columnStyles: hasBrand ? {
      0: { cellWidth: 8, textColor: MUTED }, 1: { cellWidth: 'auto', fontStyle: 'bold' }, 2: { cellWidth: 27, fontStyle: 'bold' }, 3: { cellWidth: 13, textColor: MUTED },
      4: { cellWidth: 19, halign: 'right' }, 5: { cellWidth: 25, halign: 'right' }, 6: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    } : {
      0: { cellWidth: 9, textColor: MUTED }, 1: { cellWidth: 'auto', fontStyle: 'bold' }, 2: { cellWidth: 15, textColor: MUTED },
      3: { cellWidth: 21, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 33, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (h) => {
      if (h.section === 'head' && numCols.includes(h.column.index)) h.cell.styles.halign = 'right';
      if (h.section === 'foot' && h.column.index === nc - 1) h.cell.styles.halign = 'right';
    },
    didDrawPage: (h) => { if (h.pageNumber > 1) compactHeader(); },
  });
  y = (doc as any).lastAutoTable.finalY;

  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); compactHeader(); y = 30; } };

  // ---------------------------------------------------------------- amount in words
  const words = wrap(rupeesInWords(total), CW - 2 * pad);
  const bandH = 7 + words.length * 4.4 + 5;
  ensure(bandH + 4);
  y += 6;
  doc.setFillColor(...RAISED); doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.roundedRect(MX, y, CW, bandH, 1.8, 1.8, 'FD');
  label('Amount in words', MX + pad, y + 5.2);
  font('bold', 9.2); words.forEach((w, i) => doc.text(w, MX + pad, y + 10.4 + i * 4.4));
  font('normal', 7.2, MUTED); doc.text('GST / other taxes extra, as applicable on the invoice', W - MX - pad, y + 5.2, { align: 'right' });
  y += bandH + 5;

  // ---------------------------------------------------------------- advance callout
  if (d.po.advanceRequired && d.po.advanceAmount > 0) {
    ensure(14);
    const pct = total > 0 ? Math.round((d.po.advanceAmount / total) * 1000) / 10 : 0;
    doc.setFillColor(...WHITE); doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
    doc.roundedRect(MX, y, CW, 11, 1.8, 1.8, 'FD');
    doc.setFillColor(...RED); doc.rect(MX, y + 0.6, 1.4, 9.8, 'F');
    label('Advance payment', MX + pad + 1, y + 4.6);
    font('bold', 9.4); doc.text(`₹ ${money(d.po.advanceAmount)}`, MX + pad + 1, y + 8.8);
    font('normal', 8.4, MUTED); doc.text(`${pct}% of the order value · payable before dispatch`, MX + 52, y + 8.6);
    y += 16;
  }

  // ---------------------------------------------------------------- special instructions + general terms
  const special = d.po.terms.trim();
  if (special) {
    const body = wrap(special, CW - 2 * pad);
    ensure(body.length * 4 + 12);
    const h = body.length * 4 + 10;
    doc.setFillColor(...RAISED); doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
    doc.roundedRect(MX, y, CW, h, 1.8, 1.8, 'FD');
    label('Special instructions for this order', MX + pad, y + 5);
    font('normal', 8.6); body.forEach((ln, i) => doc.text(ln, MX + pad, y + 10 + i * 4));
    y += h + 5;
  }
  if (d.standardTerms.length) {
    ensure(20);
    label('General terms & conditions', MX, y + 3);
    y += 8;
    d.standardTerms.forEach((t, i) => {
      const body = wrap(t, CW - 7);
      ensure(body.length * 3.7 + 2);
      font('normal', 7.8, MUTED); doc.text(`${i + 1}.`, MX, y);
      body.forEach((ln, k) => doc.text(ln, MX + 6, y + k * 3.7));
      y += body.length * 3.7 + 1.6;
    });
  }

  // ---------------------------------------------------------------- prepared / approved / signature (kept together)
  ensure(35);
  y += 5;
  const colW = (CW - 12) / 3;
  const sy = y;
  const col = (i: number) => MX + i * (colW + 6);
  [0, 1, 2].forEach(i => rule(sy - 2, i === 2 ? INK : BORDER, i === 2 ? 0.35 : 0.2, col(i), col(i) + colW));
  label('Prepared by', col(0), sy + 3);
  font('bold', 9.2); doc.text(d.po.preparedBy || '—', col(0), sy + 8.8);
  font('normal', 7.8, MUTED); doc.text(dateFmt(d.po.date), col(0), sy + 12.8);
  label('Approved by', col(1), sy + 3);
  if (d.approvals.length === 0) { font('normal', 8.2, MUTED); doc.text(d.draft ? 'Awaiting approval' : '—', col(1), sy + 8.8); }
  d.approvals.forEach((ap, i) => { font('bold', 8.8); doc.text(ap.by, col(1), sy + 8.8 + i * 8.6); font('normal', 7.6, MUTED); doc.text(dateFmt(ap.date), col(1), sy + 12.7 + i * 8.6); });
  label(`For ${d.company.brandName}`, col(2), sy + 3, INK);
  rule(sy + 24, BORDER, 0.3, col(2), col(2) + colW);
  font('normal', 7.8, MUTED); doc.text(d.company.signatory, col(2), sy + 28);

  // ---------------------------------------------------------------- draft watermark + footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (d.draft) {
      doc.saveGraphicsState();
      doc.setGState(new (doc as any).GState({ opacity: 0.09 }));
      font('bold', 62, RED);
      doc.text('DRAFT', W / 2, H / 2 + 10, { align: 'center', angle: 35 });
      font('bold', 20, RED);
      doc.text('NOT APPROVED - NOT FOR ISSUE', W / 2 + 4, H / 2 + 34, { align: 'center', angle: 35 });
      doc.restoreGraphicsState();
    }
    rule(H - 17, BORDER);
    font('bold', 7.8, INK); doc.text(d.company.brandName, MX, H - 12.5);
    font('normal', 6.9, MUTED); doc.text('This is a computer-generated purchase order. Please acknowledge receipt and quote the PO number on all invoices and challans.', MX, H - 8.6);
    font('bold', 7.6, INK); doc.text(`${d.po.poNo}  ·  Page ${p} of ${pages}`, W - MX, H - 12.5, { align: 'right' });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
