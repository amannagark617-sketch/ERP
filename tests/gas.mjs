// Runs the generated apps-script/Code.gs inside a vm with a fake SpreadsheetApp/Drive, as a smoke test of the adapter.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const grids = new Map();
const mkSheet = (name) => {
  const g = grids.get(name);
  const ensure = (r, c) => { while (g.rows.length < r) g.rows.push([]); g.rows.forEach(row => { while (row.length < c) row.push(''); }); };
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { ensure(r + nr - 1, c + nc - 1); return Array.from({ length: nr }, (_, i) => g.rows[r - 1 + i].slice(c - 1, c - 1 + nc)); },
    setValues: (v) => { ensure(r + nr - 1, c + nc - 1); v.forEach((row, i) => row.forEach((x, j) => { g.rows[r - 1 + i][c - 1 + j] = x; })); return range(r, c, nr, nc); },
    setValue: (x) => { ensure(r, c); g.rows[r - 1][c - 1] = x; return range(r, c, nr, nc); },
    setFontWeight: () => range(r, c, nr, nc), setBackground: () => range(r, c, nr, nc), setNumberFormat: () => range(r, c, nr, nc),
  });
  return {
    setFrozenRows: () => {}, getLastColumn: () => Math.max(0, ...g.rows.map(r => r.length)), getLastRow: () => g.rows.filter(r => r.some(x => x !== '')).length,
    getMaxRows: () => Math.max(g.rows.length, 1000), getRange: range, getDataRange: () => range(1, 1, g.rows.length, Math.max(1, ...g.rows.map(r => r.length))),
    deleteRow: (i) => { g.rows.splice(i - 1, 1); },
  };
};
const ss = {
  getId: () => 'SS1', getSpreadsheetTimeZone: () => 'Asia/Kolkata',
  getSheetByName: (n) => (grids.has(n) ? mkSheet(n) : null),
  insertSheet: (n) => { grids.set(n, { rows: [] }); return mkSheet(n); },
};
const props = {}, cache = new Map();
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
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

assert.equal(post({ action: 'login', loginId: 'admin', password: 'admin123' }).code, 'SETUP', 'not set up yet');
vm.runInContext('setupDemo()', ctx);
assert.ok(grids.get('Users').rows[0].includes('Login ID'), 'headers written');
const r = post({ action: 'login', loginId: 'navneet', password: 'navneet123' });
assert.ok(r.ok, r.error);
const b = post({ action: 'bootstrap', token: r.token });
assert.ok(b.ok && b.data.vendors.length === 3 && b.data.pos.length === 3, 'bootstrap reads the sheet');
assert.equal(b.data.vendors.find(v => v.id === 'V1').msme, true);
// write path through the real adapter: create a PO
const ops = [
  { t: 'upsert', table: 'pos', row: { id: 'x1', vendorId: 'V1', terms: 'hi', advanceRequired: false, advanceAmount: 0, expectedDate: '2026-12-01', status: 'Draft', advanceStatus: 'Not Required', route: '', step: 0, date: '2026-10-12' } },
  { t: 'upsert', table: 'poLines', row: { id: 'x1:I1', poId: 'x1', itemId: 'I1', qty: 5, price: 2400 } },
];
const c = post({ action: 'commit', token: r.token, name: 'po.save', ops });
assert.ok(c.ok, c.error);
assert.equal(c.applied.find(a => a.table === 'pos').row.poNo, 'PO-0004');
const b2 = post({ action: 'bootstrap', token: r.token });
assert.equal(b2.data.pos.length, 4);
// delete a child row (shifts sheet rows)
const d = post({ action: 'commit', token: r.token, name: 'po.save', ops: [{ t: 'delete', table: 'poLines', id: 'x1:I1' }, { t: 'upsert', table: 'poLines', row: { id: 'x1:I6', poId: 'x1', itemId: 'I6', qty: 1, price: 95 } }] });
assert.match(d.error || '', /vendor price/); // I6 is not Sharma's item
const d2 = post({ action: 'commit', token: r.token, name: 'po.save', ops: [{ t: 'delete', table: 'poLines', id: 'x1:I1' }, { t: 'upsert', table: 'poLines', row: { id: 'x1:I2', poId: 'x1', itemId: 'I2', qty: 1, price: 6800 } }] });
assert.ok(d2.ok, d2.error);
assert.deepEqual(post({ action: 'bootstrap', token: r.token }).data.poLines.filter(l => l.poId === 'x1').map(l => l.itemId), ['I2']);
console.log('Code.gs smoke test passed (setup, login, bootstrap, commit, delete)');
