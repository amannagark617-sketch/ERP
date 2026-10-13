import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'erp-test-'));
const entry = join(dir, 'entry.ts');
const cwd = process.cwd();
writeFileSync(entry, ['core', 'memhost', 'sha256', 'schema'].map(m => `export * from '${cwd}/src/shared/${m}';`).join('\n') + `\nexport * from '${cwd}/tests/fixture';`);
const out = join(dir, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error' });
const M = await import(out);

let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };
const TODAY = new Date().toISOString().slice(0, 10);

for (const s of ['', 'abc', 'ünïcode ₹ 123', 'x'.repeat(200)]) assert.equal(M.sha256(s), createHash('sha256').update(s).digest('hex'));

const host = M.createMemHost();
M.setup(host, M.fixture(TODAY));
const call = (req) => M.handle(host, req);
const login = (id, pw = id + '123') => call({ action: 'login', loginId: id, password: pw });
const tokenOf = (id) => { const r = login(id); assert.ok(r.ok, r.error); return r.token; };
const T = Object.fromEntries(['admin', 'navneet', 'factoryhead', 'accounts', 'inventory'].map(u => [u, tokenOf(u)]));
const boot = (u, all = false) => call({ action: 'bootstrap', token: T[u], all });
const commit = (u, name, ops, note = '') => call({ action: 'commit', token: T[u], name, ops, note });
const up = (table, row) => ({ t: 'upsert', table, row });
const sheetRow = (tab, pred) => host.read(tab).find(pred);
const sheetRowsOf = (tab, poKey) => host.read(tab).filter(r => r['PO Key'] === poKey);

console.log('single spreadsheet layout');
await test('12 tabs, logins and data in the same file', () => {
  const tabs = Object.values(M.TABLES).map(t => t.sheet);
  assert.equal(tabs.length, 12);
  assert.deepEqual(tabs.slice(0, 3), ['Users', 'Roles', 'Settings']);
  assert.equal(host.read('Users').length, 5); assert.ok(host.read('Vendors').length >= 4);
});

console.log('auth');
await test('plain-text password is hashed on first login', () => {
  assert.ok(sheetRow('Users', r => r['Login ID'] === 'navneet').Password.startsWith('sha256:'));
});
await test('wrong password rejected, 5 failures lock the account', () => {
  assert.equal(login('accounts', 'nope').ok, false);
  for (let i = 0; i < 5; i++) login('accounts', 'bad' + i);
  assert.match(login('accounts').error, /Too many/);
  host.cacheRemove('fail:accounts');
});
await test('inactive user cannot log in; bogus token rejected', () => {
  const r = sheetRow('Users', x => x['Login ID'] === 'inventory');
  host.update('Users', r.__row, { 'Active (Yes/No)': 'No' });
  assert.equal(login('inventory').ok, false);
  host.update('Users', r.__row, { 'Active (Yes/No)': 'Yes' });
  assert.equal(call({ action: 'bootstrap', token: 'bogus' }).code, 'AUTH');
});
await test('bootstrap never leaks users/passwords; permissions come from the Roles tab', () => {
  const b = boot('navneet');
  assert.ok(b.ok); assert.equal(b.data.users, undefined); assert.ok(!JSON.stringify(b).includes('sha256:'));
  assert.ok(b.user.permissions.includes('po.save')); assert.ok(!b.user.permissions.includes('po.approve'));
  assert.ok(boot('factoryhead').user.permissions.includes('po.approve') && boot('admin').user.permissions.includes('po.approve'), 'Factory Head and Admin are the approvers');
  assert.ok(!boot('navneet').user.permissions.includes('po.approve') && !boot('accounts').user.permissions.includes('po.approve') && !boot('inventory').user.permissions.includes('po.approve'));
  const inv = boot('inventory').user.permissions;
  assert.ok(inv.includes('receipt.create') && inv.includes('stock.issue') && !inv.includes('stock.adjust'));
  assert.ok(boot('admin').user.permissions.includes('users.manage'));
  const adm = boot('admin').user.permissions;
  for (const p of ['po.save', 'advance.pay', 'receipt.create', 'stock.issue', 'stock.adjust', 'payment.make', 'master.manage', 'users.manage']) assert.ok(adm.includes(p), 'Admin can ' + p);
});

console.log('PO workflow');
const mkPO = (qty, extra = {}) => [
  up('pos', { id: 'p1', vendorId: 'V2', terms: 't', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-11-01', status: 'Draft', advanceStatus: 'Not Required', route: '', step: 0, date: TODAY, ...extra }),
  up('poLines', { id: 'p1:I3', poId: 'p1', itemId: 'I3', qty, price: 1850 }),
];
await test('price cannot be tampered at PO creation; wrong role / table refused', () => {
  const ops = mkPO(600); ops[1].row.price = 1;
  assert.match(commit('navneet', 'po.save', ops).error, /vendor price/);
  assert.equal(commit('inventory', 'po.save', mkPO(10)).code, 'FORBIDDEN');
  assert.equal(commit('navneet', 'po.save', [up('vendors', { id: 'V9', name: 'x' })]).code, 'FORBIDDEN');
  assert.equal(commit('navneet', 'master.manage', [up('vendors', { id: 'V9', name: 'x' })]).code, 'FORBIDDEN');
});
await test('PO saved as draft: server assigns number and fills readable names', () => {
  const r = commit('navneet', 'po.save', mkPO(600), 'Draft created');
  assert.ok(r.ok, r.error);
  assert.equal(r.applied.find(a => a.table === 'pos').row.poNo, 'PO-0004');
  const row = sheetRow('PurchaseOrders', x => x['PO No'] === 'PO-0004');
  assert.equal(row.Vendor, 'Foam & Fabric Traders');
  assert.equal(sheetRow('POLines', x => x['PO No'] === 'PO-0004').Item, 'Foam sheet 40D');
});
await test('cannot skip approval by submitting as Approved or with a short route', () => {
  const v = boot('navneet').data.pos.find(p => p.id === 'p1')._v;
  const base = { id: 'p1', vendorId: 'V2', terms: 't', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-11-01', advanceStatus: 'Not Required', date: TODAY, _v: v };
  assert.match(commit('navneet', 'po.submit', [up('pos', { ...base, status: 'Approved', route: '', step: 0 })]).error, /route/);
  assert.match(commit('navneet', 'po.submit', [up('pos', { ...base, status: 'Pending Factory Head', route: 'Factory Head', step: 0 })]).error, /route/);
});
await test('submit, Factory Head approves, Admin approves, Purchase sends; history recorded', () => {
  let v = boot('navneet').data.pos.find(p => p.id === 'p1')._v;
  const base = { id: 'p1', vendorId: 'V2', terms: 't', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-11-01', advanceStatus: 'Not Required', date: TODAY };
  const R = 'Factory Head,Admin';
  let r = commit('navneet', 'po.submit', [up('pos', { ...base, status: 'Pending Factory Head', route: R, step: 0, _v: v })], 'Submitted for approval');
  assert.ok(r.ok, r.error); v = r.applied[0].row._v;
  assert.equal(commit('admin', 'po.approve', [up('pos', { ...base, status: 'Approved', route: R, step: 2, _v: v })]).code, 'FORBIDDEN');
  assert.equal(commit('navneet', 'po.approve', [up('pos', { ...base, status: 'Approved', route: R, step: 2, _v: v })]).code, 'FORBIDDEN');
  assert.match(commit('factoryhead', 'po.approve', [up('pos', { ...base, status: 'Approved', route: R, step: 2, _v: v })]).error, /Invalid approval step/);
  r = commit('factoryhead', 'po.approve', [up('pos', { ...base, status: 'Pending Admin', route: R, step: 1, _v: v })], 'Approved – looks fine');
  assert.ok(r.ok, r.error); v = r.applied[0].row._v;
  r = commit('admin', 'po.approve', [up('pos', { ...base, status: 'Approved', route: R, step: 2, _v: v })], 'Approved');
  assert.ok(r.ok, r.error); v = r.applied[0].row._v;
  assert.equal(commit('accounts', 'po.send', [up('pos', { ...base, status: 'Sent to Vendor', route: R, step: 2, sentVia: 'Email', sentTo: 'x', _v: v })]).code, 'FORBIDDEN');
  r = commit('navneet', 'po.send', [up('pos', { ...base, status: 'Sent to Vendor', route: R, step: 2, sentVia: 'Email', sentTo: 'x', _v: v })], 'Sent to vendor via Email');
  assert.ok(r.ok, r.error);
  const h = call({ action: 'history', token: T.navneet, ref: 'p1' }).entries.map(e => e.text);
  assert.deepEqual(h, ['Draft created', 'Submitted for approval', 'Approved – looks fine', 'Approved', 'Sent to vendor via Email']);
});
await test('stale version is a conflict', () => {
  const po3 = boot('navneet').data.pos.find(p => p.id === 'po3');
  const row = { ...po3, terms: 'a' };
  assert.ok(commit('navneet', 'po.save', [up('pos', row)]).ok);
  assert.equal(commit('navneet', 'po.save', [up('pos', { ...row, terms: 'b' })]).code, 'CONFLICT');
});

console.log('goods receipt = stock in');
const rcpt = (o = {}) => {
  const { price = 2400, qty = 100, total = 283200, invoiceNo = 'INV-1', adj = 100000, payable } = o;
  return [
    up('receipts', { id: 'r1', grnNo: '', type: 'Invoice', poId: 'po1', vendorId: 'V1', invoiceNo, invoiceDate: TODAY, receivedDate: TODAY, subtotal: 240000, taxTotal: 43200, grandTotal: total, advanceAdjusted: adj, payable: payable ?? total - adj, dueDate: TODAY, accepted: false, acceptedDate: '', invoiceFile: '' }),
    up('stock', { id: 'r1:I1', date: TODAY, itemId: 'I1', type: 'IN', qty, price, taxRate: 18, receiptId: 'r1', toDept: '', note: '' }),
  ];
};
await test('receipt is verified on the server: price, total, quantity, advance, duplicate invoice', () => {
  assert.match(commit('inventory', 'receipt.create', rcpt({ price: 1 })).error, /PO price/);
  assert.match(commit('inventory', 'receipt.create', rcpt({ total: 1000 })).error, /does not match/);
  assert.match(commit('inventory', 'receipt.create', rcpt({ qty: 250, total: 708000 })).error, /more than the pending/);
  assert.match(commit('inventory', 'receipt.create', rcpt({ adj: 0 })).error, /Advance adjustment/);
  assert.equal(commit('purchase' in T ? 'navneet' : 'navneet', 'receipt.create', rcpt()).code, 'FORBIDDEN');
  const r = commit('inventory', 'receipt.create', rcpt(), 'Goods received, invoice INV-1');
  assert.ok(r.ok, r.error);
  assert.equal(r.applied.find(a => a.table === 'receipts').row.grnNo, 'GRN-0001');
  assert.equal(sheetRow('Receipts', x => x['GRN No'] === 'GRN-0001').Vendor, 'Sharma Mechanisms');
  assert.equal(sheetRow('Stock', x => x.Key === 'r1:I1')['GRN No'], 'GRN-0001');
  const dup = rcpt({ invoiceNo: 'inv-1' }); dup[0].row.id = 'r2'; dup[1].row.id = 'r2:I1'; dup[1].row.receiptId = 'r2';
  assert.match(commit('inventory', 'receipt.create', dup).error, /already booked/);
});
await test('stock in from the receipt shows in balances', () => {
  const b = boot('inventory');
  const bal = (id) => (b.stockBase[id] || 0) + b.data.stock.reduce((a, s) => a + (s.itemId === id ? (s.type === 'OUT' ? -s.qty : s.qty) : 0), 0);
  assert.equal(bal('I1'), 100); assert.equal(bal('I3'), 100);
});
await test('accept invoice (Accounts only) then pay; overpay and edits refused', () => {
  const rr = boot('accounts').data.receipts.find(x => x.id === 'r1');
  const pay = (amount, id = 'pay-' + amount) => [up('payments', { id, kind: 'invoice', poId: 'po1', receiptId: 'r1', amount, date: TODAY, screenshot: '' })];
  assert.match(commit('accounts', 'payment.make', pay(100)).error, /Accept the invoice/);
  assert.equal(commit('inventory', 'invoice.accept', [up('receipts', { ...rr, accepted: true })]).code, 'FORBIDDEN');
  assert.ok(commit('accounts', 'invoice.accept', [up('receipts', { ...rr, accepted: true, acceptedDate: TODAY })]).ok);
  assert.match(commit('accounts', 'payment.make', pay(999999)).error, /more than the balance/);
  assert.ok(commit('accounts', 'payment.make', pay(183200)).ok);
  assert.match(commit('accounts', 'payment.make', pay(1)).error, /more than the balance/);
  const p = boot('accounts').data.payments.find(x => x.id === 'pay-183200');
  assert.equal(commit('accounts', 'payment.make', [up('payments', { ...p, amount: 1 })]).code, 'FORBIDDEN');
  assert.equal(commit('accounts', 'payment.make', [{ t: 'delete', table: 'payments', id: p.id }]).code, 'FORBIDDEN');
});
await test('old pending balance is a receipt of type Opening, paid like an invoice', () => {
  const ob = (o = {}) => [up('receipts', { id: 'ob2', grnNo: '', type: 'Opening', poId: '', vendorId: 'V1', invoiceNo: 'Old bill A-9', invoiceDate: TODAY, receivedDate: TODAY, subtotal: 5000, taxTotal: 0, grandTotal: 5000, advanceAdjusted: 0, payable: 5000, dueDate: TODAY, accepted: true, acceptedDate: TODAY, invoiceFile: '', ...o })];
  assert.equal(commit('inventory', 'opening.add', ob()).code, 'FORBIDDEN');
  assert.match(commit('accounts', 'opening.add', ob({ accepted: false })).error, /Invalid old balance/);
  assert.ok(commit('accounts', 'opening.add', ob()).ok);
  assert.ok(commit('accounts', 'payment.make', [up('payments', { id: 'pob', kind: 'invoice', poId: '', receiptId: 'ob2', amount: 5000, date: TODAY, screenshot: '' })]).ok);
});

console.log('stock out & adjustments');
const stk = (o) => [up('stock', { id: 's-' + Math.random().toString(36).slice(2), date: TODAY, itemId: 'I1', type: 'OUT', qty: 30, toDept: 'Production', note: '', receiptId: '', price: 0, taxRate: 0, ...o })];
await test('issue stock: needs permission, a destination and enough on hand', () => {
  assert.equal(commit('navneet', 'stock.issue', stk({})).code, 'FORBIDDEN');
  assert.match(commit('inventory', 'stock.issue', stk({ toDept: '' })).error, /who the stock is issued to/);
  assert.match(commit('inventory', 'stock.issue', stk({ qty: 500 })).error, /Only 100 pcs/);
  assert.ok(commit('inventory', 'stock.issue', stk({}), 'Issued 30 to Production').ok);
  const b = boot('inventory');
  assert.equal(b.stockBase['I1|'] + b.data.stock.filter(s => s.itemId === 'I1').reduce((a, s) => a + (s.type === 'OUT' ? -s.qty : s.qty), 0), 70);
});
await test('adjustments need the Adjust Stock capability and a reason', () => {
  assert.equal(commit('inventory', 'stock.adjust', stk({ type: 'ADJUST', qty: -2, note: 'damaged' })).code, 'FORBIDDEN');
  assert.match(commit('admin', 'stock.adjust', stk({ type: 'ADJUST', qty: -2, note: '' })).error, /reason/);
  assert.ok(commit('admin', 'stock.adjust', stk({ type: 'ADJUST', qty: -2, note: 'damaged in handling' })).ok);
});

console.log('price queries');
await test('Inventory raises a query on a PO line, Admin resolves it, nobody can change the PO through it', () => {
  const l = boot('inventory').data.poLines.find(x => x.id === 'po1:I1');
  assert.match(commit('inventory', 'query.raise', [up('poLines', { ...l, queryNote: '', queryStatus: 'Open' })]).error, /Invalid price query/);
  assert.match(commit('inventory', 'query.raise', [up('poLines', { ...l, qty: 1, queryNote: 'x', queryStatus: 'Open' })]).error, /Invalid price query/);
  assert.ok(commit('inventory', 'query.raise', [up('poLines', { ...l, queryNote: 'Invoice shows 2500', queryStatus: 'Open' })]).ok);
  const l2 = boot('admin').data.poLines.find(x => x.id === 'po1:I1');
  assert.equal(l2.queryBy, 'Inventory (Factory)');
  assert.equal(commit('navneet', 'master.manage', [up('poLines', { ...l2, queryStatus: 'Resolved' })]).code, 'FORBIDDEN');
  assert.match(commit('admin', 'master.manage', [up('poLines', { ...l2, queryStatus: 'Resolved', price: 1 })]).error, /price query/);
  assert.ok(commit('admin', 'master.manage', [up('poLines', { ...l2, queryStatus: 'Resolved' })]).ok);
});

console.log('master data: several vendors, one item');
await test('same item from several vendors at different prices; add and remove prices', () => {
  const prices = () => boot('admin').data.prices.filter(p => p.itemId === 'I3').map(p => [p.vendorId, p.price]).sort();
  assert.deepEqual(prices(), [['V2', 1850], ['V4', 1790]]);
  assert.ok(commit('admin', 'master.manage', [up('prices', { id: 'V1:I3', vendorId: 'V1', itemId: 'I3', price: 1700 })]).ok);
  assert.equal(prices().length, 3);
  assert.equal(sheetRow('Prices', r => r['Key (auto)'] === 'V1:I3')['Vendor Name'], 'Sharma Mechanisms');
  assert.match(commit('admin', 'master.manage', [up('prices', { id: 'V9:I3', vendorId: 'V9', itemId: 'I3', price: 1 })]).error, /Unknown vendor/);
  assert.equal(commit('navneet', 'master.manage', [up('prices', { id: 'V1:I3', vendorId: 'V1', itemId: 'I3', price: 1 })]).code, 'FORBIDDEN');
  assert.ok(commit('admin', 'master.manage', [{ t: 'delete', table: 'prices', id: 'V1:I3' }]).ok);
  assert.equal(prices().length, 2);
  assert.equal(commit('admin', 'master.manage', [{ t: 'delete', table: 'vendors', id: 'V1' }]).code, 'FORBIDDEN');
});
await test('new PO price follows the vendor-specific price list', () => {
  const ops = [up('pos', { id: 'pv4', vendorId: 'V4', terms: '', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-12-01', status: 'Draft', advanceStatus: 'Not Required', route: '', step: 0, date: TODAY }),
    up('poLines', { id: 'pv4:I3', poId: 'pv4', itemId: 'I3', qty: 10, price: 1850 })];
  assert.match(commit('navneet', 'po.save', ops).error, /vendor price/);
  ops[1].row.price = 1790;
  assert.ok(commit('navneet', 'po.save', ops).ok);
});
await test('formula injection neutralised; Admin edits Udyam details', () => {
  const v = boot('admin').data.vendors.find(x => x.id === 'V1');
  assert.equal(v.udyamNo, 'UDYAM-DL-01-0000001');
  assert.ok(commit('admin', 'master.manage', [up('vendors', { ...v, contact: '=HYPERLINK("http://evil")', udyamNo: 'UDYAM-DL-09-9999999' })]).ok);
  const row = sheetRow('Vendors', r => r['Vendor ID'] === 'V1');
  assert.ok(row['Contact Person'].startsWith(' =') && row['Udyam Registration No'] === 'UDYAM-DL-09-9999999');
});

console.log('editing the Sheet by hand');
await test('vendor / item rows typed by hand get IDs and default to Active', () => {
  host.append('Vendors', { 'Vendor Name': 'Hand Typed Co', 'MSME (Yes/No)': 'Yes', 'Udyam Registration No': 'UDYAM-XX-00-0000000' });
  host.append('Items', { 'Item Name': 'Zip', Unit: 'pcs' });
  const b = boot('admin');
  const v = b.data.vendors.find(x => x.name === 'Hand Typed Co'); const i = b.data.items.find(x => x.name === 'Zip');
  assert.ok(/^V\d+$/.test(v.id) && v.active && v.msme); assert.ok(/^I\d+$/.test(i.id) && i.active);
});
await test('price typed by names only is resolved to IDs', () => {
  host.append('Prices', { 'Vendor Name': 'bharat foam', 'Item Name': 'LEATHERETTE FABRIC', 'Agreed Price (Rs)': 400 });
  const p = boot('admin').data.prices.find(x => x.vendorId === 'V4' && x.itemId === 'I4');
  assert.ok(p && p.price === 400 && p.id === 'V4:I4');
  assert.equal(sheetRow('Prices', r => r['Key (auto)'] === 'V4:I4')['Vendor Name'], 'Bharat Foam');
});
await test('Roles tab edits change permissions and the approval chain immediately', () => {
  const ca = sheetRow('Roles', x => x.Role === 'Admin');
  const key = 'Approves POs above Rs (blank = not an approver)';
  host.update('Roles', ca.__row, { [key]: 5000000 });
  assert.deepEqual(boot('navneet').config.approvers.map(a => [a.role, a.above]), [['Factory Head', 0], ['Admin', 5000000]]);
  const base = { id: 'p5', vendorId: 'V2', terms: '', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-11-01', advanceStatus: 'Not Required', date: TODAY };
  const lines = [up('poLines', { id: 'p5:I3', poId: 'p5', itemId: 'I3', qty: 600, price: 1850 })]; // 1.11M: now only Factory Head
  assert.match(commit('navneet', 'po.save', [up('pos', { ...base, status: 'Pending Factory Head', route: 'Factory Head,Admin', step: 0 }), ...lines]).error, /route/);
  assert.ok(commit('navneet', 'po.save', [up('pos', { ...base, status: 'Pending Factory Head', route: 'Factory Head', step: 0 }), ...lines]).ok);
  host.update('Roles', ca.__row, { [key]: 1000000 });
  const pur = sheetRow('Roles', x => x.Role === 'Purchase');
  host.update('Roles', pur.__row, { 'Create & Send POs': 'No' });
  assert.ok(!boot('navneet').user.permissions.includes('po.save'));
  host.update('Roles', pur.__row, { 'Create & Send POs': 'Yes' });
});

console.log('long-term use: only recent / open records load by default');
await test('a PO settled two years ago stays in the Sheet but is not loaded unless asked', () => {
  const b = boot('accounts');
  assert.ok(b.partial);
  assert.ok(!b.data.pos.some(p => p.id === 'po9') && !b.data.stock.some(s => s.id === 'r9:I4') && !b.data.payments.some(p => p.id === 'pay9'));
  assert.equal(b.stockBase['I4|'], 10, 'its stock is still counted');
  const all = boot('accounts', true);
  assert.ok(all.data.pos.some(p => p.id === 'po9') && all.data.stock.some(s => s.id === 'r9:I4') && !all.partial);
  assert.equal(all.stockBase['I4|'] || 0, 0);
});
await test('open work always loads, even if old', () => {
  const b = boot('accounts');
  assert.ok(b.data.pos.some(p => p.id === 'po1'));
  assert.ok(b.data.receipts.some(r => r.id === 'ob1'), 'unpaid old balance still loads');
});
await test('the change stamp moves on every save (cheap polling)', () => {
  const s1 = call({ action: 'stamp', token: T.navneet }).stamp;
  commit('inventory', 'stock.issue', stk({ qty: 1 }));
  assert.notEqual(call({ action: 'stamp', token: T.navneet }).stamp, s1);
  assert.equal(call({ action: 'stamp', token: 'bogus' }).code, 'AUTH');
});

console.log('users, files');
await test('admin manages users; password reset works; non-admin refused', () => {
  assert.equal(call({ action: 'users.list', token: T.navneet }).code, 'FORBIDDEN');
  const r = call({ action: 'users.save', token: T.admin, user: { loginId: 'newbie', name: 'New B', role: 'Purchase', department: 'Purchase', level: 2, active: true, password: 'secret1' } });
  assert.ok(r.ok, r.error); assert.ok(login('newbie', 'secret1').ok);
  assert.match(call({ action: 'users.save', token: T.admin, user: { loginId: 'bad one', role: 'Purchase', password: 'secret1' } }).error, /Login ID/);
  assert.match(call({ action: 'users.save', token: T.admin, user: { loginId: 'zed', role: 'Nonexistent', password: 'secret1' } }).error, /role/i);
  assert.equal(call({ action: 'changePassword', token: T.navneet, oldPassword: 'wrong', newPassword: 'abcdef' }).ok, false);
  assert.ok(call({ action: 'changePassword', token: T.navneet, oldPassword: 'navneet123', newPassword: 'abcdef' }).ok);
  assert.ok(login('navneet', 'abcdef').ok);
});
await test('files: images/pdf only, round-trip, login required', () => {
  const b64 = Buffer.from('hello').toString('base64');
  assert.equal(call({ action: 'upload', token: T.accounts, name: 'a.exe', mime: 'application/x-msdownload', data: b64 }).ok, false);
  const r = call({ action: 'upload', token: T.accounts, name: 'shot.png', mime: 'image/png', data: b64, folder: 'PO-0001' });
  assert.ok(r.ok, r.error);
  assert.equal(call({ action: 'file', token: T.accounts, fileId: r.fileId }).base64, b64);
  assert.equal(call({ action: 'file', token: 'bogus', fileId: r.fileId }).ok, false);
});
await test('log records every write', () => assert.ok(host.read('Log').some(a => a.Action === 'po.approve') && host.read('Log').length > 10));

console.log('fresh install (no sample data)');
await test('a fresh setup has no business data and no usable password', () => {
  const h2 = M.createMemHost();
  M.setup(h2);
  for (const tab of ['Vendors', 'Items', 'Prices', 'PurchaseOrders', 'POLines', 'Receipts', 'Payments', 'Stock']) assert.equal(h2.read(tab).length, 0, tab);
  assert.equal(h2.read('Users').length, 1); assert.equal(h2.read('Roles').length, 5);
  assert.match(M.handle(h2, { action: 'login', loginId: 'admin', password: 'anything' }).error, /No password has been set/);
  h2.update('Users', h2.read('Users')[0].__row, { Password: 'My-Secret-1' });
  const ok = M.handle(h2, { action: 'login', loginId: 'admin', password: 'My-Secret-1' });
  assert.ok(ok.ok, ok.error);
  assert.ok(h2.read('Users')[0].Password.startsWith('sha256:'));
  const b = M.handle(h2, { action: 'bootstrap', token: ok.token });
  assert.equal(b.data.vendors.length, 0); assert.ok(b.user.permissions.includes('users.manage'));
  assert.equal(M.handle(h2, { action: 'bootstrap', token: ok.token }).partial, false);
});

console.log('optional sample data');
await test('sample data loads into an empty system, is consistent, and works with the real workflow', () => {
  const h = M.createMemHost();
  M.setup(h);
  h.update('Users', h.read('Users')[0].__row, { Password: 'Admin-Pass-1' });
  const msg = M.loadSample(h, TODAY, true);
  assert.match(msg, /Sample data loaded/);
  assert.match(M.loadSample(h, TODAY, true), /Not loaded/, 'never loads on top of existing data');
  const tk = (id) => { const r = M.handle(h, { action: 'login', loginId: id, password: 'Demo@1234' }); assert.ok(r.ok, id + ': ' + r.error); return r.token; };
  const B = (t) => M.handle(h, { action: 'bootstrap', token: t, all: true });
  const C = (t, name, ops, note = '') => M.handle(h, { action: 'commit', token: t, name, ops, note });
  const b = B(tk('demo.purchase'));
  assert.equal(b.data.pos.length, 10); assert.equal(b.data.vendors.length, 7); assert.equal(b.data.items.length, 12); assert.equal(b.data.prices.length, 19);
  assert.equal(b.data.prices.filter(p => p.itemId === 'I3').length, 4, 'one item: three vendors, one of them in two brands');
  assert.deepEqual([...new Set(b.data.prices.filter(p => p.itemId === 'I3').map(p => p.brand))].sort(), ['ComfortPlus', 'Duraflex', 'SoftRest']);
  // stock on hand & low-stock alerts
  const onHand = (id, brand) => Object.entries(b.stockBase).filter(([k]) => k.startsWith(id + '|') && (brand === undefined || k === id + '|' + brand.toLowerCase())).reduce((a, [, v]) => a + v, 0)
    + b.data.stock.reduce((a, s) => a + (s.itemId === id && (brand === undefined || s.brand.toLowerCase() === brand.toLowerCase()) ? (s.type === 'OUT' ? -s.qty : s.qty) : 0), 0);
  assert.deepEqual(['I1', 'I2', 'I3', 'I4', 'I5', 'I6'].map(i => onHand(i)), [40, 8, 245, 650, 55, 350]);
  assert.equal(onHand('I3', 'ComfortPlus'), 215); assert.equal(onHand('I3', 'Duraflex'), 30); assert.equal(onHand('I3', 'SoftRest'), 0, 'stock is tracked per brand');
  const low = b.data.items.filter(i => i.minStock > 0 && onHand(i.id) <= i.minStock).map(i => i.id);
  assert.deepEqual(low, ['I1', 'I2'], 'two low-stock items');
  // payments never exceed what is payable; the story the sample tells
  const paid = (rid) => b.data.payments.filter(p => p.receiptId === rid).reduce((a, p) => a + p.amount, 0);
  b.data.receipts.forEach(r => assert.ok(paid(r.id) <= r.payable + 0.01, r.id));
  assert.equal(paid('r1'), 48144); assert.equal(paid('r2'), 150000, 'part-paid MSME invoice'); assert.ok(b.data.receipts.find(r => r.id === 'r2').dueDate < TODAY, 'and it is overdue'); assert.equal(b.data.receipts.find(r => r.id === 'r3').payable - paid('r3'), 551380);
  assert.equal(b.data.receipts.find(r => r.id === 'ob1').dueDate < TODAY, true, 'an overdue MSME old balance');
  assert.equal(b.data.poLines.find(l => l.id === 'po5:I6').queryStatus, 'Open', 'an open price query');
  assert.equal(M.handle(h, { action: 'history', token: tk('demo.purchase'), ref: 'po2' }).entries.length, 7);
  // the sample can be worked through by the real rules
  const po9 = b.data.pos.find(p => p.id === 'po9'), po7 = b.data.pos.find(p => p.id === 'po7');
  assert.ok(C(tk('demo.factory'), 'po.approve', [up('pos', { ...po9, status: 'Approved', step: 1, advanceStatus: 'Not Required' })], 'Approved').ok);
  assert.ok(C(M.handle(h, { action: 'login', loginId: 'admin', password: 'Admin-Pass-1' }).token, 'po.approve', [up('pos', { ...po7, status: 'Approved', step: 2, advanceStatus: 'Requested' })], 'Approved').ok);
  const r4 = b.data.receipts.find(r => r.id === 'r4');
  assert.ok(C(tk('demo.accounts'), 'invoice.accept', [up('receipts', { ...r4, accepted: true, acceptedDate: TODAY })]).ok);
  assert.ok(C(tk('demo.accounts'), 'payment.make', [up('payments', { id: 'px', kind: 'invoice', poId: 'po4', receiptId: 'r4', amount: r4.payable, date: TODAY, screenshot: '' })]).ok);
  assert.ok(C(tk('demo.store'), 'stock.issue', [up('stock', { id: 'sx', date: TODAY, itemId: 'I3', brand: 'ComfortPlus', type: 'OUT', qty: 10, toDept: 'Production', note: '' })]).ok);
  // cleanup before going live keeps the admin, roles and settings
  const n = M.clearAllData(h);
  assert.ok(n > 100);
  for (const tab of ['Vendors', 'Items', 'Prices', 'PurchaseOrders', 'POLines', 'Receipts', 'Payments', 'Stock', 'Log']) assert.equal(h.read(tab).length, 0, tab);
  assert.deepEqual(h.read('Users').map(u => u['Login ID']), ['admin']); assert.equal(h.read('Roles').length, 5); assert.ok(h.read('Settings').length >= 5);
  assert.ok(M.handle(h, { action: 'login', loginId: 'admin', password: 'Admin-Pass-1' }).ok, 'admin still works');
  assert.match(M.loadSample(h, TODAY, true), /Sample data loaded/, 'and it can be loaded again');
});

await test('default sample = only vendors, items and prices (plus demo logins); no POs, receipts, payments, stock or log', () => {
  const h = M.createMemHost();
  M.setup(h);
  M.loadSample(h, TODAY);
  assert.equal(h.read('Vendors').length, 7); assert.equal(h.read('Items').length, 12); assert.equal(h.read('Prices').length, 19);
  for (const tab of ['PurchaseOrders', 'POLines', 'Receipts', 'Payments', 'Stock']) assert.equal(h.read(tab).length, 0, tab);
  assert.ok(h.read('Users').some(u => u['Login ID'] === 'demo.purchase'));
  assert.match(M.loadSample(h, TODAY), /Not loaded/);
});

console.log('role views');
await test('each role gets its own menu (screens) from the Roles tab', () => {
  const screens = (u) => boot(u).user.screens;
  assert.deepEqual(screens('navneet'), ['Dashboard', 'Purchase Orders', 'Stock', 'Accounts', 'Vendors', 'Items & Prices']);
  assert.deepEqual(screens('factoryhead'), ['Dashboard', 'Purchase Orders', 'Stock', 'Accounts']);
  assert.deepEqual(screens('inventory'), ['Dashboard', 'Purchase Orders', 'Goods Receipt', 'Stock']);
  assert.deepEqual(screens('accounts'), ['Dashboard', 'Purchase Orders', 'Stock', 'Accounts', 'Vendors']);
  assert.deepEqual(screens('admin'), ['Dashboard', 'Purchase Orders', 'Goods Receipt', 'Stock', 'Accounts', 'Vendors', 'Items & Prices', 'Users & Access']);
});
await test('the menu is editable in the Roles tab: spelling is forgiven, Dashboard is always there, unknown names are ignored, All works, blank = standard menu', () => {
  const col = 'Screens this role sees (comma separated, or All)';
  const row = (role) => sheetRow('Roles', r => r.Role === role);
  const was = row('Inventory')[col];
  host.update('Roles', row('Inventory').__row, { [col]: 'stock ,  GOODS RECEIPT; Nonsense' });
  assert.deepEqual(boot('inventory').user.screens, ['Dashboard', 'Goods Receipt', 'Stock']);
  host.update('Roles', row('Inventory').__row, { [col]: 'All' });
  assert.equal(boot('inventory').user.screens.length, 8);
  host.update('Roles', row('Inventory').__row, { [col]: '' });
  assert.deepEqual(boot('inventory').user.screens, ['Dashboard', 'Purchase Orders', 'Goods Receipt', 'Stock'], 'blank falls back to the standard menu for a standard role');
  host.update('Roles', row('Inventory').__row, { [col]: was });
});
await test('a custom role nobody configured sees only the bare minimum', () => {
  const h = M.createMemHost(); M.setup(h);
  const no = { 'Create & Send POs': 'No', 'Pay Advances': 'No', 'Receive Goods (Stock In)': 'No', 'Issue Stock (Stock Out)': 'No', 'Adjust Stock': 'No', 'Accept Invoices & Pay': 'No', 'Manage Vendors, Items & Prices': 'No', 'Manage Users': 'No' };
  h.append('Roles', { Role: 'Visitor', Level: 1, ...no });
  h.update('Users', h.read('Users')[0].__row, { Password: 'Pw-123456' });
  const ad = M.handle(h, { action: 'login', loginId: 'admin', password: 'Pw-123456' }).token;
  assert.ok(M.handle(h, { action: 'users.save', token: ad, user: { loginId: 'guest1', name: 'G', role: 'Visitor', level: 1, active: true, password: 'secret12' } }).ok);
  const tk = M.handle(h, { action: 'login', loginId: 'guest1', password: 'secret12' }).token;
  assert.deepEqual(M.handle(h, { action: 'bootstrap', token: tk }).user.screens, ['Dashboard', 'Purchase Orders']);
});
await test('vendor bank details are sent only to roles that pay or maintain vendors', () => {
  const bank = (u) => boot(u).data.vendors.find(v => v.id === 'V1');
  for (const u of ['navneet', 'inventory', 'factoryhead']) { const v = bank(u); assert.equal(v.accountNo, ''); assert.equal(v.bankName, ''); assert.equal(v.ifsc, ''); assert.equal(v.name, 'Sharma Mechanisms', u + ' still sees the rest'); }
  for (const u of ['accounts', 'admin']) { const v = bank(u); assert.ok(v.accountNo && v.bankName && v.ifsc, u + ' sees bank details'); }
  assert.ok(!JSON.stringify(boot('navneet')).includes('5010000000'), 'not anywhere in the Purchase payload');
});
await test('an older sheet whose Roles rows have an empty Screens cell gets the standard menus on setup(), custom values kept', () => {
  const h = M.createMemHost(); M.setup(h);
  const col = 'Screens this role sees (comma separated, or All)';
  const rows = h.read('Roles');
  h.update('Roles', rows.find(r => r.Role === 'Purchase').__row, { [col]: '' });
  h.update('Roles', rows.find(r => r.Role === 'Accounts').__row, { [col]: 'Dashboard, Accounts' });
  M.setup(h);
  const get = (n) => h.read('Roles').find(r => r.Role === n)[col];
  assert.equal(get('Purchase'), 'Dashboard, Purchase Orders, Stock, Accounts, Vendors, Items & Prices');
  assert.equal(get('Accounts'), 'Dashboard, Accounts', 'your own choice is never overwritten');
});

await test('menus from the previous version are upgraded by setup(); a menu you changed yourself is left alone', () => {
  const h = M.createMemHost();
  M.setup(h);
  const row = (role) => h.read('Roles').find(r => r['Role'] === role).__row;
  const col = 'Screens this role sees (comma separated, or All)';
  h.update('Roles', row('Factory Head'), { [col]: 'Dashboard, Purchase Orders, Stock' });          // the old starting menu
  h.update('Roles', row('Purchase'), { [col]: 'Dashboard, Purchase Orders, Vendors' });              // someone's own choice
  M.setup(h);
  const get = (role) => h.read('Roles').find(r => r['Role'] === role)[col];
  assert.equal(get('Factory Head'), 'Dashboard, Purchase Orders, Stock, Accounts');
  assert.equal(get('Purchase'), 'Dashboard, Purchase Orders, Vendors');
});

console.log('brand');
await test('brand: a vendor can sell one item in several brands; keys include the brand; blank brand keeps the old key', () => {
  const price = (vendorId, itemId, brand, p, id) => up('prices', { id: id ?? (brand ? `${vendorId}:${itemId}:${brand.toLowerCase()}` : `${vendorId}:${itemId}`), vendorId, itemId, brand, price: p });
  assert.ok(commit('admin', 'master.manage', [price('V2', 'I3', 'SoftRest', 1925)]).ok);
  assert.ok(commit('admin', 'master.manage', [price('V2', 'I3', 'ComfortPlus', 1850)]).ok);
  const rows = boot('admin').data.prices.filter(p => p.vendorId === 'V2' && p.itemId === 'I3');
  assert.deepEqual(rows.map(r => [r.id, r.brand, r.price]).sort(), [['V2:I3', '', 1850], ['V2:I3:comfortplus', 'ComfortPlus', 1850], ['V2:I3:softrest', 'SoftRest', 1925]]);
  assert.match(commit('admin', 'master.manage', [price('V2', 'I3', 'SoftRest', 1900, 'V2:I3')]).error, /Invalid price row/, 'key must match the brand');
  assert.equal(sheetRow('Prices', r => r['Key (auto)'] === 'V2:I3:softrest').Brand, 'SoftRest');
  const c = commit('admin', 'master.manage', [price('V2', 'I3', 'Weird:|Brand', 1, 'V2:I3:weird brand')]); assert.ok(c.ok, c.error);
  assert.equal(c.applied[0].row.brand, 'Weird Brand', 'separators removed from a typed brand');
  assert.ok(commit('admin', 'master.manage', [{ t: 'delete', table: 'prices', id: c.applied[0].row.id }]).ok);
});
await test('brand: PO line price must be that brand\'s price; the brand must be on the vendor\'s list', () => {
  const po = (lines) => [up('pos', { id: 'pb1', vendorId: 'V2', terms: '', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-12-01', status: 'Draft', advanceStatus: 'Not Required', route: '', step: 0, date: TODAY }),
    ...lines.map(([brand, qty, price]) => up('poLines', { id: brand ? `pb1:I3:${brand.toLowerCase()}` : 'pb1:I3', poId: 'pb1', itemId: 'I3', brand, qty, price }))];
  assert.match(commit('navneet', 'po.save', po([['SoftRest', 10, 1850]])).error, /vendor price/, 'ComfortPlus price on a SoftRest line');
  assert.match(commit('navneet', 'po.save', po([['NoSuchBrand', 10, 1850]])).error, /vendor price/, 'brand not on the list');
  const r = commit('navneet', 'po.save', po([['SoftRest', 10, 1925], ['', 5, 1850]]), 'Draft created');
  assert.ok(r.ok, r.error);
  const lines = sheetRowsOf('POLines', 'pb1');
  assert.deepEqual(lines.map(l => [l.Brand, l.Quantity, l.Price]).sort(), [['', 5, 1850], ['SoftRest', 10, 1925]]);
});
await test('brand: receipts, pending quantity and stock are all per brand', () => {
  const b0 = boot('navneet').data.pos.find(p => p.id === 'pb1');
  const base = { id: 'pb1', vendorId: 'V2', terms: '', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-12-01', advanceStatus: 'Not Required', date: TODAY };
  let r = commit('navneet', 'po.submit', [up('pos', { ...b0, status: 'Pending Factory Head', route: 'Factory Head', step: 0 })]); assert.ok(r.ok, r.error);
  r = commit('factoryhead', 'po.approve', [up('pos', { ...r.applied[0].row, status: 'Approved', step: 1, advanceStatus: 'Not Required' })]); assert.ok(r.ok, r.error);
  r = commit('navneet', 'po.send', [up('pos', { ...r.applied[0].row, status: 'Sent to Vendor', sentVia: 'Email', sentTo: 'x' })]); assert.ok(r.ok, r.error);
  const rc = (n, brand, qty, price = 1925, inv = 'BR-' + n) => [
    up('receipts', { id: 'rb' + n, grnNo: '', type: 'Invoice', poId: 'pb1', vendorId: 'V2', invoiceNo: inv, invoiceDate: TODAY, receivedDate: TODAY, subtotal: qty * price, taxTotal: 0, grandTotal: qty * price, advanceAdjusted: 0, payable: qty * price, dueDate: TODAY, accepted: false, acceptedDate: '', invoiceFile: '' }),
    up('stock', { id: brand ? `rb${n}:I3:${brand.toLowerCase()}` : `rb${n}:I3`, date: TODAY, itemId: 'I3', brand, type: 'IN', qty, price, taxRate: 0, receiptId: 'rb' + n, toDept: '', note: '' })];
  assert.match(commit('inventory', 'receipt.create', rc(1, 'ComfortPlus', 5, 1850)).error, /not on the PO/, 'ComfortPlus is not on this PO');
  assert.match(commit('inventory', 'receipt.create', rc(1, 'SoftRest', 12)).error, /more than the pending/, '12 of 10 SoftRest');
  assert.ok(commit('inventory', 'receipt.create', rc(1, 'SoftRest', 6)).ok);
  assert.match(commit('inventory', 'receipt.create', rc(2, 'SoftRest', 5)).error, /more than the pending/, 'only 4 SoftRest left, even though 5 unbranded are still pending');
  assert.ok(commit('inventory', 'receipt.create', rc(2, 'SoftRest', 4)).ok);
  assert.ok(commit('inventory', 'receipt.create', rc(3, '', 5, 1850)).ok, 'the unbranded line is separate');
  const st = boot('inventory');
  const bal = (brand) => (st.stockBase['I3|' + brand.toLowerCase()] || 0) + st.data.stock.filter(s => s.itemId === 'I3' && s.brand.toLowerCase() === brand.toLowerCase()).reduce((a, s) => a + (s.type === 'OUT' ? -s.qty : s.qty), 0);
  assert.equal(bal('SoftRest'), 10); assert.equal(bal(''), 105, 'unbranded foam: 100 opening + 5 received');
  assert.equal(sheetRow('Stock', x => x.Key === 'rb1:I3:softrest').Brand, 'SoftRest');
  // issuing: limited by the stock of THAT brand
  const out = (brand, qty) => commit('inventory', 'stock.issue', stk({ itemId: 'I3', brand, qty }));
  assert.match(out('SoftRest', 11).error, /Only 10 pcs of Foam sheet 40D \(SoftRest\)/);
  assert.match(out('Duraflex', 1).error, /Only 0 pcs of Foam sheet 40D \(Duraflex\)/);
  assert.ok(out('SoftRest', 10).ok);
  assert.ok(out('', 100).ok);
});
await test('brand: a price row typed by hand with a Brand cell gets its key; editing the Brand cell re-keys it', () => {
  host.append('Prices', { 'Vendor Name': 'bharat foam', 'Item Name': 'wooden frame set', Brand: 'TeakCo', 'Agreed Price (Rs)': 3100 });
  let p = boot('admin').data.prices.find(x => x.vendorId === 'V4' && x.itemId === 'I5');
  assert.ok(p && p.id === 'V4:I5:teakco' && p.brand === 'TeakCo' && p.price === 3100);
  const row = sheetRow('Prices', r => r['Key (auto)'] === 'V4:I5:teakco');
  host.update('Prices', row.__row, { Brand: 'Oakline' });
  p = boot('admin').data.prices.find(x => x.vendorId === 'V4' && x.itemId === 'I5');
  assert.equal(p.id, 'V4:I5:oakline'); assert.equal(p.brand, 'Oakline');
});

console.log('five roles: CA and HO merged into Admin');
await test('a fresh sheet has exactly five roles; Admin is the second-level approver above Rs 10 Lac', () => {
  const h = M.createMemHost();
  M.setup(h);
  assert.deepEqual(h.read('Roles').map(r => r.Role), ['Admin', 'Factory Head', 'Purchase', 'Accounts', 'Inventory']);
  const admin = h.read('Roles').find(r => r.Role === 'Admin');
  assert.equal(admin['Approves POs above Rs (blank = not an approver)'], '1000000');
  assert.ok(!JSON.stringify(h.read('Roles')).match(/"CA"|"HO"/));
});
await test('an existing sheet that still has CA / HO is migrated once: users, roles, pending POs and routes become Admin; demo.ca / demo.ho are removed', () => {
  // build the previous release's sheet by hand (old tabs, old column title), then run the new setup() on it
  const h = M.createMemHost();
  const tab = (k) => { const d = M.TABLES[k]; h.ensureSheet(d.sheet, M.allCols(d).map(c => c.header), [], ''); };
  ['roles', 'users', 'pos'].forEach(tab);
  h.ensureSheet('POLines', ['PO Key', 'Item ID', 'Price Query to HO'], [], '');
  const rk = 'Approves POs above Rs (blank = not an approver)';
  const no = { 'Create & Send POs': 'No', 'Pay Advances': 'No', 'Receive Goods (Stock In)': 'No', 'Issue Stock (Stock Out)': 'No', 'Adjust Stock': 'No', 'Accept Invoices & Pay': 'No', 'Manage Vendors, Items & Prices': 'No', 'Manage Users': 'No' };
  const role = (name, level, above, extra = {}) => h.append('Roles', { Role: name, Level: level, [rk]: above, ...no, ...extra });
  role('Admin', 5, '', Object.fromEntries(Object.keys(no).map(k => [k, 'Yes']))); role('CA', 4, '2500000'); role('HO', 4, '', { 'Manage Vendors, Items & Prices': 'Yes' });
  role('Factory Head', 3, '0'); role('Purchase', 2, '', { 'Create & Send POs': 'Yes' });
  const user = (id, r, lvl) => h.append('Users', { 'Login ID': id, Password: 'x', 'Full Name': id, Role: r, Level: lvl, 'Active (Yes/No)': 'Yes' });
  user('admin', 'Admin', 5); user('mohit', 'CA', 4); user('hoteam', 'HO', 4); user('demo.ca', 'CA', 4); user('demo.ho', 'HO', 4); user('navneet', 'Purchase', 2);
  const po = (id, status, route) => h.append('PurchaseOrders', { 'PO Key': id, 'PO No': id, Status: status, 'Approval Route': route, Version: 1 });
  po('pA', 'Pending CA', 'Factory Head,CA'); po('pB', 'Pending Factory Head', 'Factory Head,CA'); po('pC', 'Sent to Vendor', 'Factory Head');
  h.append('POLines', { 'PO Key': 'pA', 'Item ID': 'I1', 'Price Query to HO': 'carton price?' });

  M.setup(h);

  assert.deepEqual(h.read('Roles').map(r => r.Role), ['Admin', 'Factory Head', 'Purchase']);
  assert.equal(h.read('Roles').find(r => r.Role === 'Admin')[rk], '2500000', 'Admin inherits the limit CA had');
  const u = Object.fromEntries(h.read('Users').map(r => [r['Login ID'], r.Role]));
  assert.equal(u.mohit, 'Admin'); assert.equal(u.hoteam, 'Admin'); assert.equal(u.navneet, 'Purchase');
  assert.ok(!('demo.ca' in u) && !('demo.ho' in u), 'demo CA/HO logins removed');
  const p = Object.fromEntries(h.read('PurchaseOrders').map(r => [r['PO Key'], [r.Status, r['Approval Route']]]));
  assert.deepEqual(p.pA, ['Pending Admin', 'Factory Head,Admin']); assert.deepEqual(p.pB, ['Pending Factory Head', 'Factory Head,Admin']); assert.deepEqual(p.pC, ['Sent to Vendor', 'Factory Head']);
  const line = h.read('POLines').find(r => r['PO Key'] === 'pA');
  assert.equal(line['Price Query to Admin'], 'carton price?'); assert.ok(!('Price Query to HO' in line), 'column renamed in place, data kept');
  const snapshot = () => JSON.stringify([h.read('Roles'), h.read('Users'), h.read('PurchaseOrders'), h.read('POLines')]);
  const again = snapshot();
  M.setup(h);
  assert.equal(snapshot(), again, 'running setup again changes nothing');
});

console.log('PO letterhead settings & archived PDF');
await test('the PO has no letterhead: no company-detail settings; old letterhead rows are removed by setup() unless you typed your own value', () => {
  const h = M.createMemHost();
  M.setup(h);
  const get = () => Object.fromEntries(h.read('Settings').map(r => [r.Setting, r.Value]));
  for (const k of ['PoSignatory', 'PoTerms', 'CompanyName']) assert.ok(k in get(), k);
  for (const k of ['CompanyLegalName', 'CompanyAddress', 'CompanyGSTIN', 'CompanyCIN', 'CompanyPhone', 'CompanyEmail', 'CompanyWebsite', 'DeliverTo']) assert.ok(!(k in get()), k + ' not in a fresh sheet');
  assert.ok(!JSON.stringify(get()).match(/Subhav|Dewas|lnsindia|23AAFC|U36999/), 'nobody else\'s company details');
  // a sheet created by the earlier releases, which had those rows (blank, or pre-filled with the wrong company's details)
  const add = (k, v) => h.append('Settings', { Setting: k, Value: v, Meaning: '' });
  add('CompanyLegalName', 'Little Nap Subhav India Pvt. Ltd.'); add('CompanyGSTIN', '23AAFCL2047L1ZK'); add('CompanyAddress', ''); add('CompanyEmail', 'accounts@my-own-company.example');
  M.setup(h);
  const after = get();
  for (const k of ['CompanyLegalName', 'CompanyGSTIN', 'CompanyAddress']) assert.ok(!(k in after), k + ' removed');
  assert.equal(after.CompanyEmail, 'accounts@my-own-company.example', 'a value you typed yourself is kept');
  assert.equal(after.CompanyName, 'Little Nap Recliners'); assert.ok(after.PoTerms.includes('|'));
  h.update('Users', h.read('Users')[0].__row, { Password: 'Pw-123456' });
  const tk = M.handle(h, { action: 'login', loginId: 'admin', password: 'Pw-123456' }).token;
  const cfg = M.handle(h, { action: 'bootstrap', token: tk }).config.settings;
  assert.equal(cfg.CompanyName, 'Little Nap Recliners'); assert.ok(cfg.PoTerms.includes('|'));
});
await test('the PDF that was sent is stored on the PO (po.send may set it, nothing else about the PO changes)', () => {
  const b = boot('navneet');
  const po = b.data.pos.find(p => p.id === 'pv4');
  // pv4 (from the earlier test) is a draft; push it through approval + send using the real rules
  const ap = (u, name, row) => commit(u, name, [up('pos', row)], '');
  let r = ap('navneet', 'po.submit', { ...po, status: 'Pending Factory Head', route: 'Factory Head', step: 0 }); assert.ok(r.ok, r.error);
  r = ap('factoryhead', 'po.approve', { ...r.applied[0].row, status: 'Approved', step: 1, advanceStatus: 'Not Required' }); assert.ok(r.ok, r.error);
  const row = r.applied[0].row;
  assert.match(ap('navneet', 'po.send', { ...row, status: 'Sent to Vendor', sentVia: 'Email', sentTo: 'x', terms: 'changed!' }).error, /Only sending details/);
  r = ap('navneet', 'po.send', { ...row, status: 'Sent to Vendor', sentVia: 'Email', sentTo: 'x', poFile: 'file-abc' });
  assert.ok(r.ok, r.error);
  assert.equal(boot('navneet').data.pos.find(p => p.id === 'pv4').poFile, 'file-abc');
  assert.equal(sheetRow('PurchaseOrders', x => x['PO Key'] === 'pv4')['PO PDF sent (Drive ID)'], 'file-abc');
});

console.log(`\n${passed} passed`);
