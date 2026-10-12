import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'erp-test-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `export * from '${process.cwd()}/src/shared/core'; export * from '${process.cwd()}/src/shared/memhost'; export * from '${process.cwd()}/src/shared/sha256'; export * from '${process.cwd()}/src/shared/schema';`);
const out = join(dir, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error' });
const M = await import(out);

let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };

// sha256 matches node
for (const s of ['', 'abc', 'ünïcode ₹ 123', 'x'.repeat(200)]) assert.equal(M.sha256(s), createHash('sha256').update(s).digest('hex'));

const host = M.createMemHost();
M.setup(host, true, '2026-10-12');
const call = (req) => M.handle(host, req);
const login = (id, pw = id + '123') => call({ action: 'login', loginId: id, password: pw });
const tokenOf = (id) => { const r = login(id); assert.ok(r.ok, r.error); return r.token; };
const T = Object.fromEntries(['admin', 'navneet', 'factoryhead', 'mohit', 'ho', 'accounts', 'inventory'].map(u => [u, tokenOf(u)]));
const boot = (u) => call({ action: 'bootstrap', token: T[u] });
const commit = (u, name, ops) => call({ action: 'commit', token: T[u], name, ops });
const up = (table, row) => ({ t: 'upsert', table, row });

console.log('auth');
await test('plain-text password is hashed on first login', () => {
  const u = host.read('Users').find(r => r['Login ID'] === 'navneet');
  assert.ok(u.Password.startsWith('sha256:'), u.Password);
  assert.ok(login('navneet').ok);
});
await test('wrong password rejected, 5 failures lock the account', () => {
  assert.equal(login('accounts', 'nope').ok, false);
  for (let i = 0; i < 5; i++) login('accounts', 'bad' + i);
  assert.match(login('accounts').error, /Too many/);
  host.cacheRemove('fail:accounts');
});
await test('inactive user cannot log in; no/expired token rejected', () => {
  const rows = host.read('Users'); const r = rows.find(x => x['Login ID'] === 'inventory');
  host.update('Users', r.__row, { 'Active (Yes/No)': 'No' });
  assert.equal(login('inventory').ok, false);
  host.update('Users', r.__row, { 'Active (Yes/No)': 'Yes' });
  assert.equal(call({ action: 'bootstrap', token: 'bogus' }).code, 'AUTH');
});
await test('bootstrap never leaks users/passwords; permissions follow role', () => {
  const b = boot('navneet');
  assert.ok(b.ok); assert.equal(b.data.users, undefined); assert.ok(!JSON.stringify(b).includes('sha256:'));
  assert.ok(b.user.permissions.includes('po.save')); assert.ok(!b.user.permissions.includes('po.approve'));
  assert.ok(boot('admin').user.permissions.includes('users.manage'));
  assert.ok(!b.user.permissions.includes('users.manage'));
});

console.log('PO workflow');
const mkPO = (qty, extra = {}) => [
  up('pos', { id: 'p1', vendorId: 'V2', terms: 't', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-11-01', status: 'Draft', advanceStatus: 'Not Required', route: '', step: 0, date: '2026-10-12', ...extra }),
  up('poLines', { id: 'p1:I3', poId: 'p1', itemId: 'I3', qty, price: 1850 }),
];
await test('price cannot be tampered at PO creation', () => {
  const ops = mkPO(600); ops[1].row.price = 1;
  assert.match(commit('navneet', 'po.save', ops).error, /vendor price/);
});
await test('wrong role / wrong table refused', () => {
  assert.equal(commit('inventory', 'po.save', mkPO(10)).code, 'FORBIDDEN');
  assert.equal(commit('navneet', 'po.save', [up('vendors', { id: 'V9', name: 'x' })]).code, 'FORBIDDEN');
  assert.equal(commit('navneet', 'master.manage', [up('vendors', { id: 'V9', name: 'x' })]).code, 'FORBIDDEN');
});
await test('PO saved as draft, server assigns number', () => {
  const r = commit('navneet', 'po.save', mkPO(600));
  assert.ok(r.ok, r.error);
  assert.equal(r.applied.find(a => a.table === 'pos').row.poNo, 'PO-0004');
});
await test('cannot skip approval by submitting as Approved or with a short route', () => {
  const v = boot('navneet').data.pos.find(p => p.id === 'p1')._v;
  const base = { id: 'p1', vendorId: 'V2', terms: 't', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-11-01', advanceStatus: 'Not Required', date: '2026-10-12', _v: v };
  assert.match(commit('navneet', 'po.submit', [up('pos', { ...base, status: 'Approved', route: '', step: 0 })]).error, /route/);
  assert.match(commit('navneet', 'po.submit', [up('pos', { ...base, status: 'Pending Factory Head', route: 'Factory Head', step: 0 })]).error, /route/); // value > 10L needs CA too
});
await test('submit, FH approves, CA approves, Purchase sends', () => {
  let b = boot('navneet'); let v = b.data.pos.find(p => p.id === 'p1')._v;
  const base = { id: 'p1', vendorId: 'V2', terms: 't', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-11-01', advanceStatus: 'Not Required', date: '2026-10-12' };
  let r = commit('navneet', 'po.submit', [up('pos', { ...base, status: 'Pending Factory Head', route: 'Factory Head,CA', step: 0, _v: v })]);
  assert.ok(r.ok, r.error);
  // wrong approver and self-approval
  v = r.applied[0].row._v;
  assert.equal(commit('mohit', 'po.approve', [up('pos', { ...base, status: 'Approved', route: 'Factory Head,CA', step: 2, _v: v })]).code, 'FORBIDDEN');
  assert.equal(commit('navneet', 'po.approve', [up('pos', { ...base, status: 'Approved', route: 'Factory Head,CA', step: 2, _v: v })]).code, 'FORBIDDEN');
  // FH cannot jump straight to Approved
  assert.match(commit('factoryhead', 'po.approve', [up('pos', { ...base, status: 'Approved', route: 'Factory Head,CA', step: 2, _v: v })]).error, /Invalid approval step/);
  r = commit('factoryhead', 'po.approve', [up('pos', { ...base, status: 'Pending CA', route: 'Factory Head,CA', step: 1, _v: v })]);
  assert.ok(r.ok, r.error); v = r.applied[0].row._v;
  r = commit('mohit', 'po.approve', [up('pos', { ...base, status: 'Approved', route: 'Factory Head,CA', step: 2, _v: v })]);
  assert.ok(r.ok, r.error); v = r.applied[0].row._v;
  assert.equal(commit('accounts', 'po.send', [up('pos', { ...base, status: 'Sent to Vendor', route: 'Factory Head,CA', step: 2, _v: v })]).code, 'FORBIDDEN');
  r = commit('navneet', 'po.send', [up('pos', { ...base, status: 'Sent to Vendor', route: 'Factory Head,CA', step: 2, sentVia: 'Email', sentTo: 'x', _v: v })]);
  assert.ok(r.ok, r.error);
});
await test('stale version is a conflict', () => {
  const base = { id: 'po2', vendorId: 'V2', terms: 'edited', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-11-01', status: 'Draft', advanceStatus: 'Not Required', date: '2026-10-12', route: '', step: 0 };
  // po2 is Pending, so first make a draft conflict with po3
  const po3 = boot('navneet').data.pos.find(p => p.id === 'po3');
  const row = { ...po3, terms: 'a', _v: po3._v };
  assert.ok(commit('navneet', 'po.save', [up('pos', row)]).ok);
  assert.equal(commit('navneet', 'po.save', [up('pos', { ...row, terms: 'b' })]).code, 'CONFLICT');
  void base;
});

console.log('receipt & payment');
await test('receipt: price locked, total must match lines; advance flows; payments capped', () => {
  const rc = (price, total) => [
    up('receipts', { id: 'r1', poId: 'po1', invoiceNo: 'INV-1', invoiceDate: '2026-10-12', receivedDate: '2026-10-12', subtotal: 240000, taxTotal: 43200, grandTotal: total, advanceAdjusted: 100000, payable: total - 100000, accepted: false, acceptedDate: '', invoiceFile: '' }),
    up('receiptLines', { id: 'r1:I1', receiptId: 'r1', itemId: 'I1', qty: 100, price, taxRate: 18 }),
  ];
  assert.match(commit('inventory', 'receipt.create', rc(1, 283200)).error, /PO price/);
  assert.match(commit('inventory', 'receipt.create', rc(2400, 1000)).error, /does not match/);
  let r = commit('inventory', 'receipt.create', rc(2400, 283200)); assert.ok(r.ok, r.error);
  assert.equal(r.applied.find(a => a.table === 'receipts').row.grnNo, 'GRN-0001');
  const pay = (amount) => [up('payments', { id: 'pay-' + amount, kind: 'invoice', poId: 'po1', receiptId: 'r1', openingId: '', amount, date: '2026-10-13', screenshot: '' })];
  assert.match(commit('accounts', 'payment.make', pay(100)).error, /Accept the invoice/);
  const rr = boot('accounts').data.receipts.find(x => x.id === 'r1');
  assert.equal(commit('inventory', 'invoice.accept', [up('receipts', { ...rr, accepted: true })]).code, 'FORBIDDEN');
  assert.ok(commit('accounts', 'invoice.accept', [up('receipts', { ...rr, accepted: true, acceptedDate: '2026-10-13' })]).ok);
  assert.match(commit('accounts', 'payment.make', pay(999999)).error, /more than the balance/);
  assert.ok(commit('accounts', 'payment.make', pay(183200)).ok);
  assert.match(commit('accounts', 'payment.make', pay(1)).error, /more than the balance/);
});
await test('payments cannot be edited or deleted afterwards', () => {
  const p = boot('accounts').data.payments.find(x => x.id === 'pay-183200');
  assert.equal(commit('accounts', 'payment.make', [up('payments', { ...p, amount: 1 })]).code, 'FORBIDDEN');
  assert.equal(commit('accounts', 'payment.make', [{ t: 'delete', table: 'payments', id: p.id }]).code, 'FORBIDDEN');
});

console.log('master data, sheet edits, admin');
await test('HO edits vendor (Udyam etc); others cannot', () => {
  const v = boot('ho').data.vendors.find(x => x.id === 'V1');
  assert.equal(v.udyamNo, 'UDYAM-DL-01-0000001'); assert.equal(v.msme, true);
  assert.ok(commit('ho', 'master.manage', [up('vendors', { ...v, udyamNo: 'UDYAM-DL-09-9999999' })]).ok);
  assert.equal(commit('purchase' in T ? 'navneet' : 'navneet', 'master.manage', [up('vendors', { ...v, name: 'hacked' })]).code, 'FORBIDDEN');
});
await test('formula injection neutralised', () => {
  const v = boot('ho').data.vendors.find(x => x.id === 'V2');
  commit('ho', 'master.manage', [up('vendors', { ...v, contact: '=HYPERLINK("http://evil")' })]);
  assert.ok(host.read('Vendors').find(r => r['Vendor ID'] === 'V2')['Contact Person'].startsWith(' ='));
});
await test('a vendor row typed by hand into the Sheet gets an ID', () => {
  host.append('Vendors', { 'Vendor Name': 'Hand Typed Co', 'MSME (Yes/No)': 'Yes', 'Udyam Registration No': 'UDYAM-XX-00-0000000', 'Active (Yes/No)': 'Yes' });
  const vs = boot('ho').data.vendors;
  assert.ok(vs.find(v => v.name === 'Hand Typed Co' && /^V\d+$/.test(v.id)));
});
await test('a role/permission/rule edited in the Sheet takes effect immediately', () => {
  const r = host.read('ApprovalRules').find(x => x['Approver Role'] === 'CA');
  host.update('ApprovalRules', r.__row, { 'Applies When PO Value Above': 5000000 });
  assert.equal(boot('navneet').config.approvalRules.find(x => x.approverRole === 'CA').fromValue, 5000000);
  host.update('ApprovalRules', r.__row, { 'Applies When PO Value Above': 1000000 });
  const perm = host.read('Permissions').find(x => x.Action === 'query.raise');
  host.update('Permissions', perm.__row, { 'Allowed Roles (comma separated, * = everyone)': 'Inventory' });
  assert.ok(!boot('navneet').user.permissions.includes('query.raise'));
});
await test('admin manages users; password reset works; non-admin refused', () => {
  assert.equal(call({ action: 'users.list', token: T.navneet }).code, 'FORBIDDEN');
  const r = call({ action: 'users.save', token: T.admin, user: { loginId: 'newbie', name: 'New B', role: 'Purchase', department: 'Purchase', level: 2, active: true, password: 'secret1' } });
  assert.ok(r.ok, r.error);
  assert.ok(login('newbie', 'secret1').ok);
  assert.match(call({ action: 'users.save', token: T.admin, user: { loginId: 'bad one', role: 'Purchase', password: 'secret1' } }).error, /Login ID/);
  assert.match(call({ action: 'users.save', token: T.admin, user: { loginId: 'zed', role: 'Nonexistent', password: 'secret1' } }).error, /role/i);
  assert.equal(call({ action: 'changePassword', token: T.navneet, oldPassword: 'wrong', newPassword: 'abcdef' }).ok, false);
  assert.ok(call({ action: 'changePassword', token: T.navneet, oldPassword: 'navneet123', newPassword: 'abcdef' }).ok);
  assert.ok(login('navneet', 'abcdef').ok);
});
await test('files: images/pdf only, round-trip', () => {
  const b64 = Buffer.from('hello').toString('base64');
  assert.equal(call({ action: 'upload', token: T.accounts, name: 'a.exe', mime: 'application/x-msdownload', data: b64 }).ok, false);
  const r = call({ action: 'upload', token: T.accounts, name: 'shot.png', mime: 'image/png', data: b64, folder: 'PO-0001' });
  assert.ok(r.ok, r.error);
  assert.equal(call({ action: 'file', token: T.accounts, fileId: r.fileId }).base64, b64);
  assert.equal(call({ action: 'file', token: 'bogus', fileId: r.fileId }).ok, false);
});
await test('audit log records writes', () => assert.ok(host.read('AuditLog').some(a => a.Action === 'po.approve')));

console.log(`\n${passed} passed`);
