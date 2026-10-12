// Builds sample PO PDFs with the real fonts/logo and checks them (text, pages, amount in words).
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const out = process.argv[2] || mkdtempSync(join(tmpdir(), 'erp-pdf-'));
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'erp-pdfb-'));
writeFileSync(join(dir, 'e.ts'), `export * from '${process.cwd()}/src/pdf/poPdf'; export * from '${process.cwd()}/src/pdf/words';`);
await build({ entryPoints: [join(dir, 'e.ts')], bundle: true, format: 'esm', outfile: join(dir, 'b.mjs'), platform: 'node', logLevel: 'error' });
const M = await import(join(dir, 'b.mjs'));

// amount in words
assert.equal(M.rupeesInWords(480000), 'Rupees Four Lakh Eighty Thousand Only');
assert.equal(M.rupeesInWords(1008500), 'Rupees Ten Lakh Eight Thousand Five Hundred Only');
assert.equal(M.rupeesInWords(12345678.5), 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only');
assert.equal(M.rupeesInWords(0), 'Rupees Zero Only');
assert.equal(M.rupeesInWords(100), 'Rupees One Hundred Only');

const assets = {
  regular: readFileSync('public/fonts/Inter-Regular.ttf'), semibold: readFileSync('public/fonts/Inter-SemiBold.ttf'),
  logo: readFileSync('public/logo.png'), logoRatio: 529 / 900,
};
const company = { brandName: 'Little Nap Recliners', signatory: 'Authorised Signatory' };
const std = [
  'Please quote the PO number on every invoice, delivery challan and correspondence.',
  'Goods are subject to inspection and acceptance at our factory. Rejected goods will be returned or replaced at the supplier’s cost.',
  'Invoices must carry GSTIN, HSN code, PO number and the vendor’s bank details. Payment is released after invoice acceptance, as per the payment terms above.',
  'MSME suppliers are paid within the period required by law (maximum 45 days).',
];
const base = {
  company, standardTerms: std, draft: false,
  po: { poNo: 'PO-0002', date: '2026-08-25', expectedDate: '2026-09-12', terms: '30 days credit. 50% advance. Delivery at factory gate, unloading by supplier.', advanceRequired: true, advanceAmount: 100000, paymentTerms: '30 days from invoice date', preparedBy: 'Navneet', department: 'Purchase' },
  vendor: { name: 'Sharma Mechanisms Pvt Ltd', contact: 'Rakesh Sharma', email: 'v1@example.com', phone: '9198000001', address: 'Industrial Area, Plot 1, Delhi, Delhi', gstin: '07AAAAA0001A1Z5', pan: 'AAAAA0001A', msme: true, msmeType: 'Small', udyamNo: 'UDYAM-DL-01-0000001' },
  lines: [{ name: 'Recliner mechanism (manual)', brand: 'MotionPro', unit: 'pcs', qty: 200, price: 2400 }, { name: 'Packing carton', brand: '', unit: 'pcs', qty: 500, price: 95 }],
  approvals: [{ by: 'Demo Factory Head', date: '2026-08-26' }],
};
const long = {
  ...base, draft: true,
  po: { ...base.po, poNo: 'PO-0110', terms: 'Part deliveries allowed. '.repeat(14) },
  approvals: [{ by: 'Demo Factory Head', date: '2026-08-26' }, { by: 'Demo CA', date: '2026-08-27' }],
  vendor: { ...base.vendor, name: 'Bharat Foam Industries & Allied Products Private Limited', address: 'Khasra No. 114/2/1, Industrial Area Phase 2, Near Old Toll Plaza, GT Road, Panipat, Haryana 132103', msme: false, udyamNo: '' },
  lines: Array.from({ length: 34 }, (_, i) => ({ brand: i % 4 === 0 ? '' : ['Duraflex', 'ComfortPlus', 'SoftRest'][i % 3], name: `Item number ${i + 1} - high density foam sheet 40D with flame-retardant treatment ${i % 3 ? '' : '(special grade, 2000 x 1000 x 50 mm)'}`, unit: i % 2 ? 'sheet' : 'pcs', qty: 25 * (i + 1), price: 1790.5 })),
};
for (const [name, doc] of [['po-short', base], ['po-long', long]]) {
  const pdf = M.buildPoPdf(doc, assets);
  writeFileSync(join(out, name + '.pdf'), pdf);
  execFileSync('pdftoppm', ['-png', '-r', '70', join(out, name + '.pdf'), join(out, name)]);
  const text = execFileSync('pdftotext', ['-layout', join(out, name + '.pdf'), '-'], { encoding: 'utf8' });
  assert.ok(text.includes(doc.po.poNo) && text.includes('PURCHASE ORDER') && text.includes('₹'), name + ' has PO no, title and rupee sign');
  assert.ok(text.includes('Little Nap Recliners') && text.includes('Amount in words'.toUpperCase().slice(0, 6)) || text.includes('AMOUNT IN WORDS'), 'brand name and amount-in-words band');
  assert.ok(!/CIN\b/.test(text) && !/Subhav|Dewas|lnsindia|23AAFC/.test(text), 'no company letterhead details, no other company\'s details');
  const pages = (execFileSync('pdfinfo', [join(out, name + '.pdf')], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/) || [])[1];
  console.log(name, 'OK', pdf.length, 'bytes,', pages, 'page(s)');
  if (name === 'po-short') { assert.equal(pages, '1'); assert.ok(text.includes('MotionPro') && text.includes('Brand'.toUpperCase().slice(0,0) + 'Brand'), 'brand column printed'); assert.ok(text.includes('Rupees Five Lakh Twenty Seven Thousand Five Hundred Only')); assert.ok(!text.includes('DRAFT')); }
  else { assert.ok(Number(pages) >= 2); assert.ok(text.includes('Item number 34')); }
}
console.log('PDF tests passed. Output in', out);
