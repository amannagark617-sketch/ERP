// Runs the generated apps-script/Code.gs inside a vm with a fake SpreadsheetApp (two spreadsheets) as a smoke test of the adapter.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const books = new Map(); // id -> { name, grids: Map }
let counter = 0;
const mkSheet = (grids, name) => {
  const g = grids.get(name);
  if (g.obj) return g.obj; // stable identity, like the real API
  const ensure = (r, c) => { while (g.rows.length < r) g.rows.push([]); g.rows.forEach(row => { while (row.length < c) row.push(''); }); };
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { ensure(r + nr - 1, c + nc - 1); return Array.from({ length: nr }, (_, i) => g.rows[r - 1 + i].slice(c - 1, c - 1 + nc)); },
    setValues: (v) => { ensure(r + nr - 1, c + nc - 1); v.forEach((row, i) => row.forEach((x, j) => { g.rows[r - 1 + i][c - 1 + j] = x; })); return range(r, c, nr, nc); },
    setValue: (x) => { ensure(r, c); g.rows[r - 1][c - 1] = x; return range(r, c, nr, nc); },
    setFontWeight: () => range(r, c, nr, nc), setBackground: () => range(r, c, nr, nc), setNumberFormat: () => range(r, c, nr, nc),
  });
  return (g.obj = {
    setFrozenRows: () => {}, getLastColumn: () => Math.max(0, ...g.rows.map(r => r.length)), getLastRow: () => g.rows.filter(r => r.some(x => x !== '')).length,
    getMaxRows: () => Math.max(g.rows.length, 1000), getRange: range, getDataRange: () => range(1, 1, g.rows.length, Math.max(1, ...g.rows.map(r => r.length))),
    deleteRow: (i) => { g.rows.splice(i - 1, 1); },
  });
};
const newBook = (name) => {
  const id = 'BOOK' + ++counter;
  const grids = new Map([['Sheet1', { rows: [] }]]);
  const ss = {
    getId: () => id, getName: () => name, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id, getSpreadsheetTimeZone: () => 'Asia/Kolkata',
    getSheetByName: (n) => (grids.has(n) ? mkSheet(grids, n) : null),
    insertSheet: (n) => { grids.set(n, { rows: [] }); return mkSheet(grids, n); },
    getSheets: () => [...grids.keys()].map(n => mkSheet(grids, n)),
    deleteSheet: (s) => { for (const [n] of grids) if (mkSheet(grids, n) === s) grids.delete(n); },
  };
  books.set(id, { name, grids, ss });
  return ss;
};
// deleteSheet needs identity: patch getSheetByName('Sheet1') usage through a wrapper below
const dataBook = newBook('DATA');
const props = {}, cache = new Map();
const ctx = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => dataBook, openById: (id) => books.get(id).ss, create: (name) => newBook(name),
    getUi: () => { throw new Error('no ui'); },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Utilities: {
    getUuid: randomUUID, formatDate: (d) => d.toISOString().slice(0, 10),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name }), base64Decode: (s) => [...Buffer.from(s, 'base64')], base64Encode: (b) => Buffer.from(b).toString('base64'),
  },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) },
  Logger: { log: () => {} }, console,
};
vm.createContext(ctx);
vm.runInContext(readFileSync('apps-script/Code.gs', 'utf8'), ctx);
const post = (o) => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(o) } }).getContent());
const up = (table, row) => ({ t: 'upsert', table, row });

assert.equal(post({ action: 'login', loginId: 'admin', password: 'x' }).code, 'SETUP', 'not set up yet');
const msg = vm.runInContext('setup()', ctx);
assert.match(msg, /ACCESS sheet/);
const accessId = props.ACCESS_SS_ID;
assert.ok(accessId && accessId !== props.DATA_SS_ID, 'a separate access spreadsheet was created');
const access = books.get(accessId), data = books.get(props.DATA_SS_ID);
assert.ok(access.grids.has('Users') && access.grids.has('Permissions') && access.grids.has('ApprovalRules'), 'login/config tabs live in the access file');
assert.ok(!data.grids.has('Users') && data.grids.has('Vendors') && data.grids.has('PurchaseOrders'), 'business tabs live in the data file');
assert.ok(!access.grids.has('Sheet1') && !data.grids.has('Sheet1'), 'empty Sheet1 removed');
assert.equal(data.grids.get('Vendors').rows.length, 1, 'no sample data: only the header row');

assert.match(post({ action: 'login', loginId: 'admin', password: 'x' }).error, /No password/);
// admin types a password in the sheet
const hdr = access.grids.get('Users').rows[0];
access.grids.get('Users').rows[1][hdr.indexOf('Password')] = 'First-Pass-1';
const adm = post({ action: 'login', loginId: 'admin', password: 'First-Pass-1' });
assert.ok(adm.ok, adm.error);
assert.ok(String(access.grids.get('Users').rows[1][hdr.indexOf('Password')]).startsWith('sha256:'), 'password hashed in the sheet');

// admin creates staff
for (const [id, role, level] of [['ho1', 'HO', 4], ['buyer', 'Purchase', 2]]) {
  const r = post({ action: 'users.save', token: adm.token, user: { loginId: id, name: id, role, department: role, level, active: true, password: 'pass-' + id } });
  assert.ok(r.ok, r.error);
}
const ho = post({ action: 'login', loginId: 'ho1', password: 'pass-ho1' }).token;
const buyer = post({ action: 'login', loginId: 'buyer', password: 'pass-buyer' }).token;
// HO builds master data
let r = post({ action: 'commit', token: ho, name: 'master.manage', ops: [
  up('items', { id: 'I1', name: 'Mechanism', unit: 'pcs' }),
  up('vendors', { id: 'V1', name: 'Sharma', contact: '', email: '', whatsapp: '', msme: true, msmeType: 'Small', udyamNo: 'UDYAM-DL-01-0000001', gstin: '', pan: '', address: '', city: '', state: '', paymentTermsDays: 30, bankName: '', accountNo: '', ifsc: '', active: true }),
  up('vendorItems', { id: 'V1:I1', vendorId: 'V1', itemId: 'I1', price: 2400 }),
] });
assert.ok(r.ok, r.error);
const b = post({ action: 'bootstrap', token: buyer });
assert.ok(b.ok && b.data.vendors[0].udyamNo === 'UDYAM-DL-01-0000001' && b.data.vendorItems[0].price === 2400);
assert.equal(b.data.users, undefined);
// Purchase creates a PO; tampered price refused
const po = (price) => [up('pos', { id: 'p1', vendorId: 'V1', terms: 'x', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-12-01', status: 'Draft', advanceStatus: 'Not Required', route: '', step: 0, date: '2026-10-12' }), up('poLines', { id: 'p1:I1', poId: 'p1', itemId: 'I1', qty: 5, price })];
assert.match(post({ action: 'commit', token: buyer, name: 'po.save', ops: po(1) }).error, /vendor price/);
r = post({ action: 'commit', token: buyer, name: 'po.save', ops: po(2400) });
assert.ok(r.ok, r.error);
assert.equal(r.applied.find(a => a.table === 'pos').row.poNo, 'PO-0001');
// delete path (rows shift in the sheet)
r = post({ action: 'commit', token: buyer, name: 'po.save', ops: [{ t: 'delete', table: 'poLines', id: 'p1:I1' }, up('poLines', { id: 'p1:I1b', poId: 'p1', itemId: 'I1', qty: 7, price: 2400 })] });
assert.ok(r.ok, r.error);
assert.deepEqual(post({ action: 'bootstrap', token: buyer }).data.poLines.map(l => l.qty), [7]);
assert.ok(data.grids.get('AuditLog').rows.length > 2, 'audit log written to the data file');
console.log('Code.gs smoke test passed (two spreadsheets, setup, password in sheet, users, master data, PO, delete)');
