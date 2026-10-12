// Simulates ~4 years of use and measures what a login costs. Not part of `npm test` (informational).
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'erp-scale-'));
const cwd = process.cwd();
writeFileSync(join(dir, 'e.ts'), ['core', 'memhost', 'schema'].map(m => `export * from '${cwd}/src/shared/${m}';`).join('\n'));
await build({ entryPoints: [join(dir, 'e.ts')], bundle: true, format: 'esm', outfile: join(dir, 'b.mjs'), platform: 'node', logLevel: 'error' });
const M = await import(join(dir, 'b.mjs'));
const perDay = Number(process.argv[2] || 8), years = Number(process.argv[3] || 4);
const host = M.createMemHost();
M.setup(host);
host.update('Users', host.read('Users')[0].__row, { Password: 'pw-pw-pw' });
const tab = (n, rows) => rows.forEach(r => host.append(n, r));
const day = (i) => new Date(Date.UTC(2023, 0, 1) + i * 864e5).toISOString().slice(0, 10);
const vend = Array.from({ length: 60 }, (_, i) => ({ 'Vendor ID': 'V' + i, 'Vendor Name': 'Vendor ' + i, 'Active (Yes/No)': 'Yes' }));
tab('Vendors', vend);
tab('Items', Array.from({ length: 300 }, (_, i) => ({ 'Item ID': 'I' + i, 'Item Name': 'Item ' + i, Unit: 'pcs', 'Active (Yes/No)': 'Yes' })));
let n = 0, rc = 0, pay = 0, st = 0, log = 0;
const days = years * 365;
for (let d = 0; d < days; d++) {
  for (let k = 0; k < perDay; k++) {
    const id = 'po' + ++n, v = 'V' + (n % 60), date = day(d);
    const open = d > days - 20; // only the last 3 weeks are still open
    tab('PurchaseOrders', [{ 'PO Key': id, 'PO No': 'PO-' + n, 'PO Date': date, 'Vendor ID': v, Vendor: 'Vendor', Status: open ? 'Approved' : 'Sent to Vendor', 'Advance Status': 'Not Required', 'Approval Route': 'Factory Head', 'Approval Step': 1, 'Created By': 'Navneet', Version: 1 }]);
    const lines = [];
    for (let l = 0; l < 3; l++) lines.push({ 'Key (auto)': `${id}:I${(n + l) % 300}`, 'PO Key': id, 'PO No': 'PO-' + n, 'Item ID': 'I' + ((n + l) % 300), Item: 'Item', Quantity: 10, Price: 100, Version: 1 });
    tab('POLines', lines);
    if (!open) {
      const r = 'r' + ++rc;
      tab('Receipts', [{ 'Receipt Key': r, 'GRN No': 'GRN-' + rc, 'Type (Invoice / Opening)': 'Invoice', 'PO Key': id, 'Vendor ID': v, 'Invoice No / Reference': 'INV' + rc, 'Invoice Date': date, Payable: 3540, 'Grand Total': 3540, 'Accepted by Accounts (Yes/No)': 'Yes', Version: 1 }]);
      tab('Stock', lines.map(l => ({ Key: `${r}:${l['Item ID']}`, Date: date, 'Item ID': l['Item ID'], 'Type (IN / OUT / ADJUST)': 'IN', Quantity: 10, 'Receipt Key': r, Version: 1 })));
      st += 3;
      tab('Payments', [{ Key: 'p' + ++pay, 'Type (advance / invoice)': 'invoice', 'PO Key': id, 'Receipt Key': r, Amount: 3540, 'Payment Date': date, Version: 1 }]);
      tab('Stock', [{ Key: 'o' + ++st, Date: date, 'Item ID': 'I' + (n % 300), 'Type (IN / OUT / ADJUST)': 'OUT', Quantity: 8, 'Issued To (Dept / Purpose)': 'Production', Version: 1 }]);
    }
    for (let e = 0; e < 8; e++) { log++; }
  }
}
const rows = ['PurchaseOrders', 'POLines', 'Receipts', 'Payments', 'Stock'].map(t => [t, host.read(t).length]);
console.log(`${years} years x ${perDay} POs/day =`, n, 'POs.', 'rows:', Object.fromEntries(rows), `(+ ~${log} Log rows, not loaded by the app)`);
const login = M.handle(host, { action: 'login', loginId: 'admin', password: 'pw-pw-pw' });
for (const all of [false, true]) {
  const t0 = performance.now();
  const b = M.handle(host, { action: 'bootstrap', token: login.token, all });
  const ms = performance.now() - t0, kb = JSON.stringify(b).length / 1024;
  console.log(all ? 'full history ' : 'default load  ', `server CPU ${ms.toFixed(0)} ms, payload ${(kb / 1024).toFixed(2)} MB, POs sent ${b.data.pos.length}`);
}
