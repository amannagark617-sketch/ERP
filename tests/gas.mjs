// Runs the generated apps-script/Code.gs inside a vm with a fake SpreadsheetApp/Drive/Script services (ONE spreadsheet).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const grids = new Map([['Sheet1', { rows: [], color: '' }]]);
const mkSheet = (name) => {
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
    setFrozenRows: () => {}, setTabColor: (c) => { g.color = c; }, getLastColumn: () => Math.max(0, ...g.rows.map(r => r.length)),
    getLastRow: () => g.rows.filter(r => r.some(x => x !== '')).length, getMaxRows: () => Math.max(g.rows.length, 1000), getRange: range,
    getDataRange: () => range(1, 1, g.rows.length, Math.max(1, ...g.rows.map(r => r.length))), deleteRow: (i) => { g.rows.splice(i - 1, 1); },
  });
};
const ss = {
  getId: () => 'BOOK1', getName: () => 'Little Nap ERP', getUrl: () => 'https://docs.google.com/spreadsheets/d/BOOK1', getSpreadsheetTimeZone: () => 'Asia/Kolkata',
  getSheetByName: (n) => (grids.has(n) ? mkSheet(n) : null), insertSheet: (n) => { grids.set(n, { rows: [], color: '' }); return mkSheet(n); },
  getSheets: () => [...grids.keys()].map(mkSheet), deleteSheet: (s) => { for (const [n] of grids) if (mkSheet(n) === s) grids.delete(n); },
};
const props = {}, cache = new Map(), triggers = [], copies = [];
let updated = 1;
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => { throw new Error('no ui'); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  DriveApp: {
    getFileById: () => ({ getName: () => 'Little Nap ERP', getLastUpdated: () => ({ getTime: () => updated++ }), makeCopy: (n) => { copies.push(n); } }),
    getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ getFiles: () => ({ hasNext: () => false }) }),
  },
  ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger: () => {}, newTrigger: (fn) => ({ timeBased: () => ({ onMonthDay: () => ({ atHour: () => ({ create: () => triggers.push({ getHandlerFunction: () => fn }) }) }) }) }) },
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
assert.match(msg, /Your spreadsheet/);
assert.equal([...grids.keys()].length, 12, 'exactly 12 tabs, no leftover Sheet1: ' + [...grids.keys()].join(','));
assert.equal(grids.get('Users').color, '#e69138'); assert.equal(grids.get('Vendors').color, '#38761d'); assert.equal(grids.get('Stock').color, '#999999');
assert.equal(grids.get('Vendors').rows.length, 1, 'no sample data: only the header row');

assert.match(post({ action: 'login', loginId: 'admin', password: 'x' }).error, /No password/);
const hdr = grids.get('Users').rows[0];
grids.get('Users').rows[1][hdr.indexOf('Password')] = 'First-Pass-1';
const adm = post({ action: 'login', loginId: 'admin', password: 'First-Pass-1' });
assert.ok(adm.ok, adm.error);
assert.ok(String(grids.get('Users').rows[1][hdr.indexOf('Password')]).startsWith('sha256:'), 'password hashed in the sheet');

for (const [id, role, level] of [['ho1', 'HO', 4], ['buyer', 'Purchase', 2], ['store', 'Inventory', 1]]) {
  const r = post({ action: 'users.save', token: adm.token, user: { loginId: id, name: id, role, department: role, level, active: true, password: 'pass-' + id } });
  assert.ok(r.ok, r.error);
}
const tok = (id) => post({ action: 'login', loginId: id, password: 'pass-' + id }).token;
const ho = tok('ho1'), buyer = tok('buyer'), store = tok('store');

// HO builds master data: one item, two vendors with different prices
let r = post({ action: 'commit', token: ho, name: 'master.manage', note: 'master', ops: [
  up('items', { id: 'I1', name: 'Foam sheet', unit: 'sheet', category: '', minStock: 10, active: true }),
  ...['V1', 'V2'].map((id, n) => up('vendors', { id, name: 'Vendor ' + id, contact: '', email: '', whatsapp: '', msme: n === 0, msmeType: 'Small', udyamNo: 'UDYAM-DL-01-000000' + n, gstin: '', pan: '', address: '', city: '', state: '', paymentTermsDays: 30, bankName: '', accountNo: '', ifsc: '', active: true })),
  up('prices', { id: 'V1:I1', vendorId: 'V1', itemId: 'I1', price: 1850 }), up('prices', { id: 'V2:I1', vendorId: 'V2', itemId: 'I1', price: 1790 }),
] });
assert.ok(r.ok, r.error);
const b = post({ action: 'bootstrap', token: buyer });
assert.ok(b.ok && b.data.vendors.length === 2 && b.data.prices.length === 2 && b.data.users === undefined);
const row = grids.get('Prices').rows;
assert.ok(row[1].includes('Vendor V1') && row[1].includes('Foam sheet'), 'readable names are written next to the IDs');

// Purchase creates a PO at Vendor 2's price; tampered price refused
const po = (price) => [up('pos', { id: 'p1', vendorId: 'V2', terms: 'x', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-12-01', status: 'Draft', advanceStatus: 'Not Required', route: '', step: 0, date: '2026-10-12' }), up('poLines', { id: 'p1:I1', poId: 'p1', itemId: 'I1', qty: 5, price })];
assert.match(post({ action: 'commit', token: buyer, name: 'po.save', ops: po(1850) }).error, /vendor price/, "Vendor 1's price can't be used on Vendor 2's PO");
r = post({ action: 'commit', token: buyer, name: 'po.save', note: 'Draft created', ops: po(1790) });
assert.ok(r.ok, r.error);
assert.equal(r.applied.find(a => a.table === 'pos').row.poNo, 'PO-0001');
r = post({ action: 'commit', token: buyer, name: 'po.save', ops: [{ t: 'delete', table: 'poLines', id: 'p1:I1' }, up('poLines', { id: 'p1:I1b', poId: 'p1', itemId: 'I1', qty: 7, price: 1790 })] });
assert.match(r.error || '', /Invalid PO line/);
r = post({ action: 'commit', token: buyer, name: 'po.save', ops: [{ t: 'delete', table: 'poLines', id: 'p1:I1' }, up('poLines', { id: 'p1:I1', poId: 'p1', itemId: 'I1', qty: 7, price: 1790 })] });
assert.ok(r.ok, r.error); // changing quantity of a line works
// stock: adjust-in needs HO; store issues
assert.equal(post({ action: 'commit', token: store, name: 'stock.adjust', ops: [up('stock', { id: 'a1', date: '2026-10-12', itemId: 'I1', type: 'ADJUST', qty: 50, note: 'Opening stock' })] }).code, 'FORBIDDEN');
assert.ok(post({ action: 'commit', token: ho, name: 'stock.adjust', note: 'Opening', ops: [up('stock', { id: 'a1', date: '2026-10-12', itemId: 'I1', type: 'ADJUST', qty: 50, note: 'Opening stock' })] }).ok);
assert.match(post({ action: 'commit', token: store, name: 'stock.issue', ops: [up('stock', { id: 'o1', date: '2026-10-12', itemId: 'I1', type: 'OUT', qty: 80, toDept: 'Production' })] }).error, /Only 50/);
assert.ok(post({ action: 'commit', token: store, name: 'stock.issue', note: 'Issued', ops: [up('stock', { id: 'o1', date: '2026-10-12', itemId: 'I1', type: 'OUT', qty: 20, toDept: 'Production' })] }).ok);
assert.ok(grids.get('Stock').rows.length === 3, 'stock ledger rows written');
assert.ok(grids.get('Log').rows.length > 5, 'log written to the same spreadsheet');
const s1 = post({ action: 'stamp', token: buyer }).stamp;
post({ action: 'commit', token: store, name: 'stock.issue', ops: [up('stock', { id: 'o2', date: '2026-10-12', itemId: 'I1', type: 'OUT', qty: 1, toDept: 'Production' })] });
assert.notEqual(post({ action: 'stamp', token: buyer }).stamp, s1, 'stamp changes after a save');

// backups
vm.runInContext('installBackup()', ctx);
assert.equal(triggers.length, 1); assert.equal(copies.length, 1);
console.log('Code.gs smoke test passed (one spreadsheet, 12 tabs, setup, password in sheet, users, multi-vendor prices, PO, stock, stamp, backup)');
