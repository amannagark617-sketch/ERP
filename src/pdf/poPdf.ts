import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { rupeesInWords } from './words';

export interface PoDoc {
  company: { legalName: string; brandName: string; addressLines: string[]; gstin: string; cin: string; phone: string; email: string; website: string; signatory: string };
  po: {
    poNo: string; date: string; expectedDate: string; terms: string; advanceRequired: boolean; advanceAmount: number;
    paymentTerms: string; preparedBy: string; department: string; deliverTo: string;
  };
  vendor: { name: string; contact: string; email: string; phone: string; address: string; gstin: string; pan: string; msme: boolean; msmeType: string; udyamNo: string };
  lines: { name: string; unit: string; qty: number; price: number }[];
  approvals: { by: string; date: string }[];
  standardTerms: string[];
  /** Not yet approved: print a DRAFT watermark so a draft can never be mistaken for an issued PO. */
  draft: boolean;
}
export interface PdfAssets { regular: Uint8Array; semibold: Uint8Array; logo: Uint8Array; logoRatio: number }

// Brand palette (from the HR screening app + the Little Nap logo)
const INK: [number, number, number] = [29, 29, 31];
const MUTED: [number, number, number] = [110, 110, 115];
const BORDER: [number, number, number] = [217, 217, 222];
const RAISED: [number, number, number] = [245, 245, 247];
const RED: [number, number, number] = [215, 25, 32];

const W = 210, H = 297, MX = 16, CW = W - 2 * MX;
const BOTTOM = 266; // content must stop above the footer

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
  doc.setProperties({ title: `Purchase Order ${d.po.poNo}`, author: d.company.legalName, subject: `Purchase Order to ${d.vendor.name}` });

  const font = (weight: 'normal' | 'bold', size: number, color = INK) => { doc.setFont('Inter', weight); doc.setFontSize(size); doc.setTextColor(...color); };
  const lines = (txt: string, width: number) => doc.splitTextToSize(txt, width) as string[];
  const label = (txt: string, x: number, y: number) => { font('bold', 6.8, MUTED); doc.text(txt.toUpperCase(), x, y, { charSpace: 0.35 }); };
  const rule = (y: number, color = BORDER, w = 0.2, x1 = MX, x2 = W - MX) => { doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(x1, y, x2, y); };

  const logoH = (w: number) => w * a.logoRatio;

  // ---------------------------------------------------------------- letterhead (first page)
  function letterhead() {
    doc.addImage(a.logo, 'PNG', MX, 11, 40, logoH(40));
    let y = 13.2;
    font('bold', 10.5); doc.text(d.company.legalName, W - MX, y, { align: 'right' });
    font('normal', 8, MUTED);
    d.company.addressLines.forEach(l => { y += 4.1; doc.text(l, W - MX, y, { align: 'right' }); });
    const regLine = [d.company.gstin && `GSTIN ${d.company.gstin}`, d.company.cin && `CIN ${d.company.cin}`].filter(Boolean).join('   ·   ');
    const contactLine = [d.company.phone, d.company.email, d.company.website].filter(Boolean).join('   ·   ');
    if (regLine) { y += 4.3; font('normal', 7.6, INK); doc.text(regLine, W - MX, y, { align: 'right' }); }
    if (contactLine) { y += 4; font('normal', 7.6, MUTED); doc.text(contactLine, W - MX, y, { align: 'right' }); }
    const ry = Math.max(11 + logoH(40), y) + 4;
    rule(ry, INK, 0.35);
    rule(ry, RED, 1.1, MX, MX + 30);
    return ry;
  }
  function compactHeader() {
    doc.addImage(a.logo, 'PNG', MX, 9, 20, logoH(20));
    font('bold', 9); doc.text(`Purchase Order ${d.po.poNo}`, W - MX, 13, { align: 'right' });
    font('normal', 7.5, MUTED); doc.text(`${d.company.legalName}  ·  to ${d.vendor.name}`, W - MX, 17.5, { align: 'right' });
    rule(22, INK, 0.3); rule(22, RED, 0.9, MX, MX + 16);
  }

  const lhBottom = letterhead();

  // ---------------------------------------------------------------- title
  let y = lhBottom + 11;
  font('bold', 19); doc.text('PURCHASE ORDER', MX, y + 1);
  font('normal', 7.6, MUTED); doc.text('PO NUMBER', W - MX, y - 5, { align: 'right', charSpace: 0.35 });
  font('bold', 17, RED); doc.text(d.po.poNo || '—', W - MX, y + 2, { align: 'right' });
  font('normal', 8.5, MUTED); doc.text(`Date: ${dateFmt(d.po.date)}`, W - MX, y + 7.2, { align: 'right' });

  // ---------------------------------------------------------------- vendor + order details boxes
  y += 13;
  const bw = (CW - 6) / 2, pad = 4;
  const vendorLines: { text: string; bold?: boolean; muted?: boolean }[] = [];
  font('bold', 9.5);
  lines(d.vendor.name, bw - 2 * pad).forEach(t => vendorLines.push({ text: t, bold: true }));
  lines(d.vendor.address || '—', bw - 2 * pad).forEach(t => vendorLines.push({ text: t, muted: true }));
  vendorLines.push({ text: [d.vendor.gstin && `GSTIN ${d.vendor.gstin}`, d.vendor.pan && `PAN ${d.vendor.pan}`].filter(Boolean).join('   ·   ') || 'GSTIN —' });
  if (d.vendor.contact || d.vendor.phone || d.vendor.email) lines([d.vendor.contact, d.vendor.phone, d.vendor.email].filter(Boolean).join('  ·  '), bw - 2 * pad).forEach(t => vendorLines.push({ text: t, muted: true }));
  if (d.vendor.msme) vendorLines.push({ text: `MSME${d.vendor.msmeType ? ' (' + d.vendor.msmeType + ')' : ''}${d.vendor.udyamNo ? '  ·  Udyam ' + d.vendor.udyamNo : ''}`, bold: true });

  const details: [string, string][] = [
    ['Expected delivery', dateFmt(d.po.expectedDate)],
    ['Payment terms', d.po.paymentTerms],
    ['Advance', d.po.advanceRequired ? `₹${money(d.po.advanceAmount)} before dispatch` : 'Not required'],
    ['Prepared by', [d.po.preparedBy, d.po.department && `(${d.po.department})`].filter(Boolean).join(' ')],
    ['Deliver to', d.po.deliverTo],
  ];
  const rows = details.filter(([k, v]) => k !== 'Deliver to' || v).map(([k, v]) => ({ k, v: lines(v || '—', bw - 2 * pad - 30) }));
  const detailH = rows.reduce((h, r) => h + Math.max(1, r.v.length) * 4.1 + 1.2, 0);
  const vendorH = vendorLines.length * 4.5;
  const boxH = Math.max(vendorH, detailH) + 11;

  doc.setFillColor(...RAISED); doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.roundedRect(MX, y, bw, boxH, 1.8, 1.8, 'FD');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MX + bw + 6, y, bw, boxH, 1.8, 1.8, 'FD');
  label('Vendor', MX + pad, y + 5.5);
  let vy = y + 10.5;
  vendorLines.forEach(l => { font(l.bold ? 'bold' : 'normal', l.bold ? 9.5 : 8.4, l.muted ? MUTED : INK); doc.text(l.text, MX + pad, vy); vy += 4.5; });
  label('Order details', MX + bw + 6 + pad, y + 5.5);
  let dy = y + 10.5;
  rows.forEach(r => {
    font('normal', 8, MUTED); doc.text(r.k, MX + bw + 6 + pad, dy);
    font('normal', 8.4, INK); r.v.forEach((t, i) => doc.text(t, MX + bw + 6 + pad + 30, dy + i * 4.1));
    dy += Math.max(1, r.v.length) * 4.1 + 1.2;
  });
  y += boxH + 7;

  // ---------------------------------------------------------------- items
  const total = d.lines.reduce((s, l) => s + l.qty * l.price, 0);
  autoTable(doc, {
    startY: y,
    margin: { left: MX, right: MX, top: 28, bottom: H - BOTTOM },
    theme: 'plain',
    head: [['#', 'Description', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)']],
    body: d.lines.map((l, i) => [String(i + 1), l.name, l.unit, qtyFmt(l.qty), money(l.price), money(l.qty * l.price)]),
    styles: { font: 'Inter', fontSize: 8.8, textColor: INK, cellPadding: { top: 2.8, bottom: 2.8, left: 2.2, right: 2.2 }, lineColor: BORDER, lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 }, valign: 'middle' },
    headStyles: { fillColor: RAISED, textColor: MUTED, fontStyle: 'bold', fontSize: 7.2, lineColor: INK, lineWidth: { top: 0, right: 0, bottom: 0.45, left: 0 } },
    columnStyles: {
      0: { cellWidth: 9, textColor: MUTED }, 1: { cellWidth: 'auto', fontStyle: 'bold' }, 2: { cellWidth: 15, textColor: MUTED },
      3: { cellWidth: 21, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (h) => { if (h.section === 'head' && [3, 4, 5].includes(h.column.index)) h.cell.styles.halign = 'right'; },
    didDrawPage: (h) => { if (h.pageNumber > 1) compactHeader(); },
  });
  y = (doc as any).lastAutoTable.finalY;

  // ---------------------------------------------------------------- page-break helper for everything below the table
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); compactHeader(); y = 30; } };

  // ---------------------------------------------------------------- totals + amount in words
  ensure(36);
  y += 6;
  const tx = W - MX - 78;
  font('normal', 8.6, MUTED); doc.text('Order value (before tax)', tx, y); font('bold', 11, INK); doc.text(`₹ ${money(total)}`, W - MX, y, { align: 'right' });
  y += 5; font('normal', 7.8, MUTED); doc.text('GST / other taxes: extra, as applicable on the invoice', tx, y);
  y += 4; rule(y, INK, 0.35, tx, W - MX);
  const words = lines(rupeesInWords(total), CW - 8);
  y += 6; label('Amount in words (excl. taxes)', MX, y);
  y += 4.6; font('bold', 8.8); words.forEach(w => { doc.text(w, MX, y); y += 4.3; });
  y += 2;

  // ---------------------------------------------------------------- terms
  const terms = [d.po.terms.trim(), ...d.standardTerms].filter(Boolean);
  if (terms.length) {
    ensure(24);
    label('Terms & conditions', MX, y + 3);
    y += 8;
    terms.forEach((t, i) => {
      const body = lines(t, CW - 7);
      ensure(body.length * 3.7 + 2);
      font('normal', 7.8, i === 0 && d.po.terms.trim() ? INK : MUTED); doc.text(`${i + 1}.`, MX, y);
      body.forEach((ln, k) => doc.text(ln, MX + 6, y + k * 3.7));
      y += body.length * 3.7 + 1.6;
    });
  }

  // ---------------------------------------------------------------- approvals + signature (kept together)
  ensure(40);
  y += 5;
  const colW = (CW - 12) / 3;
  const sy = y;
  label('Prepared by', MX, sy);
  font('bold', 9); doc.text(d.po.preparedBy || '—', MX, sy + 5.5);
  font('normal', 7.8, MUTED); doc.text(dateFmt(d.po.date), MX, sy + 9.5);
  label('Approved by', MX + colW + 6, sy);
  if (d.approvals.length === 0) { font('normal', 8, MUTED); doc.text(d.draft ? 'Awaiting approval' : '—', MX + colW + 6, sy + 5.5); }
  d.approvals.forEach((ap, i) => { font('bold', 8.6); doc.text(ap.by, MX + colW + 6, sy + 5.5 + i * 8.6); font('normal', 7.6, MUTED); doc.text(dateFmt(ap.date), MX + colW + 6, sy + 9.4 + i * 8.6); });
  const sx = MX + 2 * (colW + 6);
  label(`For ${d.company.brandName || d.company.legalName}`, sx, sy);
  rule(sy + 20, INK, 0.3, sx, sx + colW);
  font('normal', 7.8, MUTED); doc.text(d.company.signatory, sx, sy + 24);

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
    font('normal', 6.9, MUTED);
    doc.text([d.company.legalName, d.company.cin && `CIN ${d.company.cin}`, d.company.gstin && `GSTIN ${d.company.gstin}`].filter(Boolean).join('   ·   '), MX, H - 12.5);
    doc.text('This is a computer-generated purchase order. Please acknowledge receipt and quote the PO number on all invoices and challans.', MX, H - 8.6);
    font('bold', 7.6, INK); doc.text(`${d.po.poNo}  ·  Page ${p} of ${pages}`, W - MX, H - 12.5, { align: 'right' });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
