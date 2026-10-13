/**
 * Server logic. Runs inside Google Apps Script (bundled into apps-script/Code.gs)
 * and unchanged in the tests (with an in-memory Host). The environment is injected through `Host`.
 */
import { DATA_TABLES, TABLES, TableKey, allCols, def, fromSheet, toSheet } from './schema';
import { sha256 } from './sha256';
import { configSeed } from './seed';
import { approversOf, routeFor } from './approval';
import { lineKey, normBrand, sameBrand, stockKey } from './keys';
import { DEFAULT_SCREENS, parseScreens } from './screens';
import { SAMPLE_USER_PREFIX, sampleData, sampleUsers } from './sample';

export interface Host {
  now(): string;                                   // ISO timestamp
  uuid(): string;
  ensureSheet(name: string, headers: string[], textHeaders: string[], color: string): void;
  read(name: string): Record<string, any>[];       // header → value, plus __row (1-based sheet row index of the data row)
  append(name: string, row: Record<string, any>): number; // returns new row index
  update(name: string, rowIdx: number, row: Record<string, any>): void;
  remove(name: string, rowIdx: number): void;
  renameHeader(sheet: string, from: string, to: string): void;  // rename a column header in place (keeps its data)
  withLock<T>(fn: () => T): T;
  cacheGet(key: string): string | null;
  cachePut(key: string, value: string, ttlSeconds: number): void;
  cacheRemove(key: string): void;
  saveFile(folderId: string, subfolder: string, name: string, mime: string, base64: string): { id: string; folderId: string };
  readFile(id: string): { name: string; mime: string; base64: string };
  stamp(): string;                                 // changes whenever the spreadsheet changes (cheap check for "is there news?")
  bumpStamp(): void;
}

export class ApiError extends Error {
  constructor(message: string, public code = 'ERROR') { super(message); }
}

const SESSION_TTL = 6 * 3600;
const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ADMIN_LEVEL = 5; // users at this level or above have every capability (except approving out of turn)

/** What each capability column in the Roles tab allows. */
const CAPS: Record<string, string[]> = {
  cPo: ['po.save', 'po.submit', 'po.send', 'query.raise'],
  cAdvance: ['advance.pay'],
  cReceive: ['receipt.create', 'query.raise'],
  cIssue: ['stock.issue'],
  cAdjust: ['stock.adjust'],
  cPay: ['invoice.accept', 'payment.make', 'opening.add'],
  cMaster: ['master.manage'],
  cUsers: ['users.manage'],
};

/** Which tables each named action may write, and which of them may change EXISTING rows. */
const ACTIONS: Record<string, { tables: TableKey[]; edit: TableKey[] }> = {
  'po.save': { tables: ['pos', 'poLines'], edit: ['pos', 'poLines'] },
  'po.submit': { tables: ['pos'], edit: ['pos'] },
  'po.approve': { tables: ['pos'], edit: ['pos'] },
  'po.reject': { tables: ['pos'], edit: ['pos'] },
  'po.send': { tables: ['pos'], edit: ['pos'] },
  'advance.pay': { tables: ['pos', 'payments'], edit: ['pos'] },
  'receipt.create': { tables: ['receipts', 'stock', 'poLines'], edit: ['poLines'] },
  'invoice.accept': { tables: ['receipts'], edit: ['receipts'] },
  'payment.make': { tables: ['payments'], edit: [] },
  'opening.add': { tables: ['receipts'], edit: [] },
  'query.raise': { tables: ['poLines'], edit: ['poLines'] },
  'stock.issue': { tables: ['stock'], edit: [] },
  'stock.adjust': { tables: ['stock'], edit: [] },
  'master.manage': { tables: ['vendors', 'items', 'prices', 'poLines'], edit: ['vendors', 'items', 'prices', 'poLines'] },
};
const DELETABLE: Partial<Record<string, TableKey[]>> = { 'po.save': ['poLines'], 'master.manage': ['prices'] };
const APPLY_ORDER: TableKey[] = ['vendors', 'items', 'prices', 'pos', 'poLines', 'receipts', 'payments', 'stock'];

// ---------------------------------------------------------------- data access
class Db {
  private cache: Partial<Record<TableKey, any[]>> = {};
  constructor(private host: Host) {}
  rows(k: TableKey): any[] {
    if (!this.cache[k]) {
      const d = def(k);
      this.cache[k] = this.host.read(d.sheet).map(raw => ({ ...fromSheet(d, raw), __row: raw.__row }));
    }
    return this.cache[k]!;
  }
  find(k: TableKey, id: string) { return id ? this.rows(k).find(r => r[def(k).id] === id) : undefined; }
  put(k: TableKey, e: any) {
    const d = def(k);
    const rows = this.rows(k);
    const i = rows.findIndex(r => r[d.id] === e[d.id]);
    if (i >= 0) { this.host.update(d.sheet, rows[i].__row, toSheet(d, e)); rows[i] = { ...e, __row: rows[i].__row }; }
    else rows.push({ ...e, __row: this.host.append(d.sheet, toSheet(d, e)) });
  }
  /** Rewrite a row that is already loaded (used to repair rows typed by hand). */
  touch(k: TableKey, row: any) { this.host.update(def(k).sheet, row.__row, toSheet(def(k), row)); }
}

const clean = (e: any) => { const { __row, ...rest } = e; return rest; };
const lc = (s: any) => String(s ?? '').trim().toLowerCase();
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function settingsOf(db: Db): Record<string, string> {
  const o: Record<string, string> = {};
  db.rows('settings').forEach(r => { o[r.key] = r.value; });
  return o;
}

export { approversOf, routeFor } from './approval';
export type { Approver } from './approval';

// ---------------------------------------------------------------- auth
const hashPw = (loginId: string, pw: string) => 'sha256:' + sha256(lc(loginId) + ':' + pw);

interface User { loginId: string; name: string; role: string; department: string; level: number; permissions: string[]; screens: string[] }

function permissionsFor(db: Db, role: string, level: number): string[] {
  const r = db.rows('roles').find(x => lc(x.role) === lc(role));
  const out: string[] = [];
  const add = (a: string[]) => a.forEach(x => { if (out.indexOf(x) < 0) out.push(x); });
  for (const cap of Object.keys(CAPS)) if (level >= ADMIN_LEVEL || (r && r[cap])) add(CAPS[cap]);
  if (r && approversOf([r]).length) add(['po.approve', 'po.reject']);
  return out;
}

function buildUser(db: Db, u: any): User {
  const roleRow = db.rows('roles').find(r => lc(r.role) === lc(u.role));
  const level = u.level || roleRow?.level || 0;
  return {
    loginId: u.loginId, name: u.name || u.loginId, role: roleRow?.role || u.role, department: u.department || '', level, permissions: permissionsFor(db, u.role, level),
    screens: parseScreens(roleRow?.screens, roleRow?.role || u.role, level, ADMIN_LEVEL),
  };
}

function login(host: Host, db: Db, req: any) {
  const id = lc(req.loginId);
  const pw = String(req.password ?? '');
  if (!id || !pw) throw new ApiError('Enter Login ID and password', 'AUTH');
  const failKey = 'fail:' + id;
  if (Number(host.cacheGet(failKey) || 0) >= MAX_FAILS) throw new ApiError('Too many wrong attempts. Try again in 15 minutes.', 'AUTH');
  const u = db.rows('users').find(r => lc(r.loginId) === id);
  if (u && u.active && !u.password) throw new ApiError('No password has been set for this login yet. Ask the Admin to type one in the Users tab.', 'AUTH');
  let ok = false;
  if (u && u.active && u.password) {
    if (u.password.startsWith('sha256:')) ok = u.password === hashPw(u.loginId, pw);
    else if (u.password === pw) {
      ok = true; // plain text typed into the Sheet: upgrade to a hash now
      db.put('users', { ...u, password: hashPw(u.loginId, pw) });
    }
  }
  if (!ok) {
    host.cachePut(failKey, String(Number(host.cacheGet(failKey) || 0) + 1), LOCK_SECONDS);
    throw new ApiError('Wrong Login ID or password, or the account is inactive', 'AUTH');
  }
  host.cacheRemove(failKey);
  const token = host.uuid().replace(/-/g, '') + host.uuid().replace(/-/g, '');
  host.cachePut('sess:' + token, u.loginId, SESSION_TTL);
  return { token, user: buildUser(db, u) };
}

function authenticate(host: Host, db: Db, token: any): User {
  const loginId = token ? host.cacheGet('sess:' + token) : null;
  const u = loginId && db.rows('users').find(r => r.loginId === loginId);
  if (!u || !u.active) throw new ApiError('Session expired. Please log in again.', 'AUTH');
  return buildUser(db, u);
}

const need = (user: User, perm: string) => {
  if (user.permissions.indexOf(perm) < 0) throw new ApiError(`Your role (${user.role}) is not allowed to do this (${perm})`, 'FORBIDDEN');
};

// ---------------------------------------------------------------- stock helpers
const signed = (r: any) => (r.type === 'IN' ? r.qty : r.type === 'OUT' ? -r.qty : r.qty);

function balances(db: Db): Record<string, number> {
  const b: Record<string, number> = {};
  db.rows('stock').forEach(r => { if (r.itemId) { const k = stockKey(r.itemId, r.brand); b[k] = r2((b[k] || 0) + signed(r)); } });
  return b;
}

/** Quantity of an item already received against a PO. */
function receivedQty(db: Db, poId: string, itemId: string, brand?: string): number {
  const ids = new Set(db.rows('receipts').filter(r => r.poId === poId).map(r => r.id));
  return db.rows('stock').filter(s => s.type === 'IN' && s.itemId === itemId && sameBrand(s.brand, brand) && ids.has(s.receiptId)).reduce((a, s) => a + s.qty, 0);
}

// ---------------------------------------------------------------- reads
function monthsAgo(today: string, n: number): string {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

function repairHandTypedRows(host: Host, db: Db) {
  const now = host.now();
  const stamp = (r: any) => { r._v = (r._v || 0) + 1; r._at = now; r._by = 'sheet'; };
  // Vendors / items typed straight into the Sheet get an ID
  for (const k of ['vendors', 'items'] as TableKey[]) {
    const d = def(k);
    const rows = db.rows(k);
    let n = rows.reduce((m, r) => Math.max(m, Number(String(r[d.id]).replace(/\D/g, '')) || 0), 0);
    rows.filter(r => !r[d.id] && r.name).forEach(r => { r[d.id] = d.autoId! + ++n; stamp(r); db.touch(k, r); });
  }
  // Prices: allow typing just Vendor Name + Item Name (+ price); fill in the IDs and keep the names current
  const vendors = db.rows('vendors'), items = db.rows('items');
  for (const p of db.rows('prices')) {
    let changed = false;
    if (!p.vendorId && p.vendorName) { const v = vendors.find(x => lc(x.name) === lc(p.vendorName)); if (v) { p.vendorId = v.id; changed = true; } }
    if (!p.itemId && p.itemName) { const i = items.find(x => lc(x.name) === lc(p.itemName)); if (i) { p.itemId = i.id; changed = true; } }
    const v = vendors.find(x => x.id === p.vendorId), i = items.find(x => x.id === p.itemId);
    if (v && p.vendorName !== v.name) { p.vendorName = v.name; changed = true; }
    if (i && p.itemName !== i.name) { p.itemName = i.name; changed = true; }
    const id = p.vendorId && p.itemId ? lineKey(p.vendorId, p.itemId, p.brand) : '';
    if (id && p.id !== id) { p.id = id; changed = true; }
    if (changed) { stamp(p); db.touch('prices', p); }
  }
}

function bootstrap(host: Host, db: Db, user: User, all: boolean) {
  repairHandTypedRows(host, db);
  const s = settingsOf(db);
  const recent = Math.max(1, Number(s.RecentMonths) || 6);
  const cutoff = monthsAgo(host.now().slice(0, 10), recent);

  const pos = db.rows('pos').filter(r => r.id);
  const lines = db.rows('poLines').filter(r => r.id);
  const receipts = db.rows('receipts').filter(r => r.id);
  const payments = db.rows('payments').filter(r => r.id);
  const stock = db.rows('stock').filter(r => r.id);

  // A PO is "settled" when everything is received, accepted and paid. Old settled POs are not loaded by default.
  const group = <T,>(rows: T[], key: (r: T) => string) => { const m = new Map<string, T[]>(); rows.forEach(r => { const k = key(r); if (k) (m.get(k) || m.set(k, []).get(k)!).push(r); }); return m; };
  const linesByPO = group(lines, l => l.poId);
  const receiptsByPO = group(receipts, r => r.poId);
  const rcptPO = new Map(receipts.map(r => [r.id, r.poId]));
  const inQty = new Map<string, number>();
  stock.forEach(x => {
    const po = x.type === 'IN' ? rcptPO.get(x.receiptId) : '';
    if (po) inQty.set(lineKey(po, x.itemId, x.brand), (inQty.get(lineKey(po, x.itemId, x.brand)) || 0) + x.qty);
  });
  const paid = new Map<string, number>();
  payments.forEach(p => { if (p.receiptId) paid.set(p.receiptId, (paid.get(p.receiptId) || 0) + p.amount); });
  const settledReceipt = (r: any) => r.accepted && (paid.get(r.id) || 0) >= r.payable - 0.01;
  const settledPO = (po: any) => {
    const ls = linesByPO.get(po.id) || [];
    return po.status === 'Sent to Vendor' && ls.length > 0 && ls.every(l => (inQty.get(lineKey(po.id, l.itemId, l.brand)) || 0) >= l.qty)
      && (receiptsByPO.get(po.id) || []).every(settledReceipt);
  };
  const poIn = new Set(pos.filter(p => all || p.date >= cutoff || !settledPO(p)).map(p => p.id));
  const rcIn = new Set(receipts.filter(r => (r.poId ? poIn.has(r.poId) : all || r.invoiceDate >= cutoff || !settledReceipt(r))).map(r => r.id));
  const stockOut = stock.filter(x => (x.type === 'IN' ? rcIn.has(x.receiptId) : all || x.date >= cutoff));
  const full = balances(db);
  const shown: Record<string, number> = {};
  stockOut.forEach(x => { const k = stockKey(x.itemId, x.brand); shown[k] = r2((shown[k] || 0) + signed(x)); });
  const stockBase: Record<string, number> = {};
  Object.keys(full).forEach(k => { stockBase[k] = r2(full[k] - (shown[k] || 0)); });

  const data: Record<string, any[]> = {
    items: db.rows('items').filter(r => r.id).map(clean),
    // bank details go only to people who pay vendors or maintain the vendor list
    vendors: db.rows('vendors').filter(r => r.id).map(r => (user.permissions.indexOf('payment.make') >= 0 || user.permissions.indexOf('master.manage') >= 0
      ? clean(r) : { ...clean(r), bankName: '', accountNo: '', ifsc: '' })),
    prices: db.rows('prices').filter(r => r.id).map(clean),
    pos: pos.filter(p => poIn.has(p.id)).map(clean),
    poLines: lines.filter(l => poIn.has(l.poId)).map(clean),
    receipts: receipts.filter(r => rcIn.has(r.id)).map(clean),
    payments: payments.filter(p => (p.receiptId ? rcIn.has(p.receiptId) : poIn.has(p.poId))).map(clean),
    stock: stockOut.map(clean),
  };
  delete s.DriveFolderId;
  const roles = db.rows('roles').map(clean);
  return {
    user,
    config: { settings: s, roles, approvers: approversOf(roles) },
    data,
    stockBase,
    partial: !all && (poIn.size < pos.length || rcIn.size < receipts.length || stockOut.length < stock.length),
    cutoff,
    stamp: host.stamp(),
  };
}

// ---------------------------------------------------------------- writes
interface Op { t: 'upsert' | 'delete'; table: TableKey; row?: any; id?: string }

/** Keep only known columns, correct types, neutralise spreadsheet formulas. */
function sanitize(k: TableKey, row: any): any {
  const d = def(k);
  const out: any = {};
  for (const col of d.cols) {
    const v = row[col.key];
    if (col.type === 'num') out[col.key] = Number.isFinite(Number(v)) ? Number(v) : 0;
    else if (col.type === 'bool') out[col.key] = v === true || v === 'Yes';
    else {
      let s = v == null ? '' : String(v).slice(0, 2000);
      if (col.key === 'brand') s = normBrand(s).slice(0, 60);
      if (/^[=+@]/.test(s)) s = ' ' + s;
      out[col.key] = s;
    }
  }
  if (d.kind === 'data') out._v = row._v === undefined || row._v === null ? undefined : Number(row._v);
  return out;
}

/** The data as it will be once this request is applied (existing rows overlaid with the changes). */
class View {
  constructor(private db: Db, private ops: Op[]) {}
  get(k: TableKey, id: string) {
    for (let i = this.ops.length - 1; i >= 0; i--) {
      const o = this.ops[i];
      if (o.table !== k) continue;
      if (o.t === 'delete' && o.id === id) return undefined;
      if (o.t === 'upsert' && o.row[def(k).id] === id) return o.row;
    }
    return this.db.find(k, id);
  }
  ups(k: TableKey): any[] { return this.ops.filter(o => o.t === 'upsert' && o.table === k).map(o => o.row); }
  fresh(k: TableKey): any[] { return this.ups(k).filter(r => !this.db.find(k, r[def(k).id])); }
  lines(poId: string): any[] {
    const m = new Map<string, any>();
    this.db.rows('poLines').filter(l => l.poId === poId).forEach(l => m.set(l.id, l));
    this.ops.forEach(o => { if (o.table === 'poLines') { if (o.t === 'delete') m.delete(o.id as string); else if (o.row.poId === poId) m.set(o.row.id, o.row); } });
    return Array.from(m.values());
  }
}

const same = (a: any, b: any, keys: string[]) => keys.every(k => a[k] === b[k]);
const PENDING = (role: string) => 'Pending ' + role;
const PO_FROZEN = ['vendorId', 'terms', 'expectedDate', 'advanceRequired', 'advanceAmount', 'route', 'date'];

function guards(action: string, user: User, ops: Op[], db: Db) {
  const v = new View(db, ops);
  const bad = (m: string, code = 'FORBIDDEN'): never => { throw new ApiError(m, code); };
  const approvers = approversOf(db.rows('roles'));

  // ---- purchase orders
  for (const p of v.ups('pos')) {
    const cur = db.find('pos', p.id);
    if (action === 'po.save' || action === 'po.submit') {
      if (cur && cur.status !== 'Draft' && cur.status !== 'Rejected') bad('This PO can no longer be edited');
      if (action === 'po.submit' && !cur) bad('Save the PO first');
      if (!db.find('vendors', p.vendorId)) bad('Unknown vendor');
      if (p.status === 'Draft' || (cur && cur.status === 'Rejected' && p.status === 'Rejected')) continue;
      // submitting: the server decides the route, never the browser
      const value = r2(v.lines(p.id).reduce((a, l) => a + l.qty * l.price, 0));
      const route = routeFor(approvers, value);
      const want = route.length ? PENDING(route[0]) : 'Approved';
      if (p.status !== want || p.route !== route.join(',') || p.step !== 0) bad('Approval route does not match the Roles tab (Approves POs above)');
      if (!route.length && p.advanceStatus !== (p.advanceRequired ? 'Requested' : 'Not Required')) bad('Advance status is wrong');
    } else if (action === 'po.approve' || action === 'po.reject') {
      if (!cur || lc(cur.status) !== lc(PENDING(user.role))) bad(`This PO is not waiting for the ${user.role}`);
      PO_FROZEN.forEach(f => { if (cur[f] !== p[f]) bad('Only the approval status can change here'); });
      if (action === 'po.reject') { if (p.status !== 'Rejected') bad('Invalid status'); continue; }
      const route = String(cur.route).split(',').filter(Boolean);
      const step = (cur.step || 0) + 1;
      const want = step < route.length ? PENDING(route[step]) : 'Approved';
      if (p.status !== want || p.step !== step) bad('Invalid approval step');
      if (want === 'Approved' && p.advanceStatus !== (cur.advanceRequired ? 'Requested' : 'Not Required')) bad('Advance status is wrong');
    } else if (action === 'po.send') {
      if (!cur || cur.status !== 'Approved' || cur.advanceStatus === 'Requested' || p.status !== 'Sent to Vendor') bad('PO cannot be sent now');
      PO_FROZEN.forEach(f => { if (cur[f] !== p[f]) bad('Only sending details can change here'); });
    } else if (action === 'advance.pay') {
      if (!cur || cur.advanceStatus !== 'Requested' || ['Advance Paid', 'Fully Paid'].indexOf(p.advanceStatus) < 0 || p.status !== cur.status) bad('No advance is pending for this PO');
      PO_FROZEN.forEach(f => { if (cur[f] !== p[f]) bad('Only the advance status can change here'); });
    }
  }
  if (action === 'po.save') {
    for (const l of v.ups('poLines')) {
      if (l.id !== lineKey(l.poId, l.itemId, l.brand)) bad('Invalid PO line');
      const cur = db.find('poLines', l.id);
      if (cur) { if (cur.price !== l.price || cur.itemId !== l.itemId || !sameBrand(cur.brand, l.brand)) bad('PO price cannot be changed. Ask the Admin to update the vendor price.'); continue; }
      const po = v.get('pos', l.poId);
      const pr = po && db.find('prices', lineKey(po.vendorId, l.itemId, l.brand));
      if (!pr || pr.price !== l.price) bad('PO price must match the vendor price list');
      if (!(l.qty > 0)) bad('Quantity must be more than zero');
    }
  }

  // ---- advance payment
  if (action === 'advance.pay') {
    const pays = v.ups('payments');
    if (!pays.length || !v.ups('pos').length) bad('Nothing to pay');
    if (pays.some(x => x.kind !== 'advance' || !(x.amount > 0) || !db.find('pos', x.poId))) bad('Only advance payments here');
  }

  // ---- goods receipt (stock in)
  if (action === 'receipt.create') {
    const rs = v.fresh('receipts');
    if (rs.length !== 1) bad('One receipt at a time');
    const r = rs[0];
    const po = db.find('pos', r.poId);
    if (!po || po.status !== 'Sent to Vendor' || r.type !== 'Invoice' || r.accepted || r.vendorId !== po.vendorId) bad('PO is not open for receipt');
    if (!r.invoiceNo) bad('Enter the invoice number', 'ERROR');
    if (db.rows('receipts').some(x => lc(x.invoiceNo) === lc(r.invoiceNo) && x.vendorId === r.vendorId && x.type === 'Invoice')) bad('This invoice number is already booked for this vendor', 'ERROR');
    const ins = v.ups('stock');
    if (!ins.length) bad('Select the items received', 'ERROR');
    let sub = 0, tax = 0;
    for (const s of ins) {
      const pl = v.get('poLines', lineKey(po.id, s.itemId, s.brand));
      if (s.type !== 'IN' || s.receiptId !== r.id || s.id !== lineKey(r.id, s.itemId, s.brand) || !pl) bad('Invalid stock-in row (item or brand is not on the PO)');
      if (pl.price !== s.price) bad('Receipt price must equal the PO price');
      if (!(s.qty > 0) || s.qty > pl.qty - receivedQty(db, po.id, s.itemId, s.brand) + 1e-9) bad('Received quantity is more than the pending PO quantity', 'ERROR');
      sub += s.qty * s.price; tax += (s.qty * s.price * s.taxRate) / 100;
    }
    const tol = Number(settingsOf(db).InvoiceTolerance || 1);
    if (Math.abs(sub + tax - r.grandTotal) > Math.min(0.05, tol)) bad('Receipt total does not match its lines', 'ERROR');
    const avail = Math.max(0, db.rows('payments').filter(x => x.poId === po.id && x.kind === 'advance').reduce((a, x) => a + x.amount, 0)
      - db.rows('receipts').filter(x => x.poId === po.id).reduce((a, x) => a + x.advanceAdjusted, 0));
    const adj = Math.min(r.grandTotal, avail);
    if (Math.abs(r.advanceAdjusted - adj) > 0.01 || Math.abs(r.payable - (r.grandTotal - r.advanceAdjusted)) > 0.01) bad('Advance adjustment is wrong');
    for (const l of v.ups('poLines')) { // quantity may change when the invoice does not match; nothing else may
      const cur = db.find('poLines', l.id);
      if (!cur || cur.poId !== po.id || !same(cur, l, ['price', 'itemId', 'brand', 'queryNote', 'queryStatus'])) bad('Only the PO quantity may change here');
    }
  }
  if (action === 'invoice.accept') {
    for (const r of v.ups('receipts')) {
      const cur = db.find('receipts', r.id);
      if (!cur || cur.accepted || !r.accepted || !same(cur, r, ['grandTotal', 'payable', 'poId', 'vendorId', 'invoiceNo', 'type'])) bad('Invoice cannot be accepted');
    }
  }
  if (action === 'opening.add') {
    const rs = v.ups('receipts');
    if (!rs.length) bad('Nothing to add');
    for (const r of rs) {
      if (db.find('receipts', r.id) || r.type !== 'Opening' || r.poId || !r.accepted || !(r.payable > 0) || r.payable !== r.grandTotal
        || !r.invoiceNo || !db.find('vendors', r.vendorId)) bad('Invalid old balance', 'ERROR');
    }
  }
  if (action === 'payment.make') {
    for (const pay of v.ups('payments')) {
      const r = db.find('receipts', pay.receiptId);
      if (pay.kind !== 'invoice' || !r || !r.accepted) bad('Accept the invoice before paying');
      if (!(pay.amount > 0)) bad('Amount must be positive', 'ERROR');
      const paid = db.rows('payments').filter(x => x.receiptId === r.id).reduce((a, x) => a + x.amount, 0);
      if (paid + pay.amount > r.payable + 0.01) bad('Payment is more than the balance payable', 'ERROR');
    }
  }

  // ---- queries on PO lines
  if (action === 'query.raise') {
    for (const l of v.ups('poLines')) {
      const cur = db.find('poLines', l.id);
      if (!cur || !same(cur, l, ['qty', 'price', 'itemId', 'brand', 'poId']) || l.queryStatus !== 'Open' || !l.queryNote) bad('Invalid price query', 'ERROR');
    }
  }

  // ---- stock out / adjust
  if (action === 'stock.issue' || action === 'stock.adjust') {
    const bal = balances(db);
    const out: Record<string, number> = {};
    for (const s of v.ups('stock')) {
      const item = db.find('items', s.itemId);
      if (!item || !item.active) bad('Unknown or inactive item', 'ERROR');
      if (!s.date) bad('Enter the date', 'ERROR');
      if (action === 'stock.issue') {
        if (s.type !== 'OUT' || !(s.qty > 0) || !s.toDept) bad('Enter quantity and who the stock is issued to', 'ERROR');
        const k = stockKey(s.itemId, s.brand);
        out[k] = (out[k] || 0) + s.qty;
        if (out[k] > (bal[k] || 0) + 1e-9) bad(`Only ${bal[k] || 0} ${item.unit} of ${item.name}${normBrand(s.brand) ? ' (' + normBrand(s.brand) + ')' : ''} in stock`, 'ERROR');
      } else if (s.type !== 'ADJUST' || !s.qty || !s.note) bad('Adjustments need a quantity (+/-) and a reason', 'ERROR');
    }
  }

  // ---- master data
  if (action === 'master.manage') {
    for (const l of v.ups('poLines')) { // the Admin may only close a price query
      const cur = db.find('poLines', l.id);
      if (!cur || !same(cur, l, ['qty', 'price', 'itemId', 'brand', 'poId', 'queryNote', 'queryBy']) || l.queryStatus !== 'Resolved') bad('Only the price query can be closed here');
    }
    for (const p of v.ups('prices')) {
      if (!db.find('vendors', p.vendorId) && !v.get('vendors', p.vendorId)) bad('Unknown vendor in price list', 'ERROR');
      if (!db.find('items', p.itemId) && !v.get('items', p.itemId)) bad('Unknown item in price list', 'ERROR');
      if (p.id !== lineKey(p.vendorId, p.itemId, p.brand) || p.price < 0) bad('Invalid price row', 'ERROR');
    }
  }
}

/** Fill the human-readable helper columns (vendor / item names, PO number…) so the Sheet is easy to read. */
function fillNames(db: Db, k: TableKey, e: any, v: View) {
  const vendor = (id: string) => (db.find('vendors', id) || v.get('vendors', id))?.name;
  const item = (id: string) => (db.find('items', id) || v.get('items', id))?.name;
  const po = (id: string) => db.find('pos', id) || v.get('pos', id);
  if ('itemName' in e || k === 'stock' || k === 'poLines' || k === 'prices') e.itemName = item(e.itemId) ?? e.itemName ?? '';
  if (k === 'prices') e.vendorName = vendor(e.vendorId) ?? e.vendorName ?? '';
  if (k === 'pos') e.vendorName = vendor(e.vendorId) ?? '';
  if (k === 'poLines' || k === 'receipts' || k === 'payments') {
    const p = po(e.poId);
    if (p) { e.poNo = p.poNo || e.poNo || ''; if (k !== 'poLines') e.vendorName = vendor(p.vendorId) ?? ''; }
  }
  if (k === 'receipts') e.vendorName = vendor(e.vendorId) ?? e.vendorName ?? '';
  if (k === 'payments' && e.receiptId) {
    const r = db.find('receipts', e.receiptId);
    if (r) { e.vendorName = vendor(r.vendorId) ?? ''; e.poNo = e.poNo || r.invoiceNo; }
  }
  if (k === 'stock' && e.receiptId) e.grnNo = (db.find('receipts', e.receiptId) || v.get('receipts', e.receiptId))?.grnNo ?? '';
}

function nextNo(db: Db, table: TableKey, key: string, prefix: string): string {
  const used = db.rows(table).reduce((m, r) => Math.max(m, r[key] ? Number(String(r[key]).replace(/\D/g, '')) || 0 : 0), 0);
  return prefix + String(used + 1).padStart(4, '0');
}

function commit(host: Host, db: Db, user: User, name: string, rawOps: any[], note: string) {
  const spec = ACTIONS[name];
  if (!spec) throw new ApiError('Unknown action ' + name);
  need(user, name);
  if (!Array.isArray(rawOps) || rawOps.length > 300) throw new ApiError('Too many changes in one request');
  const ops: Op[] = rawOps.map((o: any) => {
    if (!(o.table in TABLES) || TABLES[o.table as TableKey].kind !== 'data') throw new ApiError('Unknown table ' + o.table);
    return { t: o.t, table: o.table, id: o.id, row: o.row ? sanitize(o.table, o.row) : undefined };
  });
  for (const o of ops) {
    if (spec.tables.indexOf(o.table) < 0) throw new ApiError(`${name} may not change ${o.table}`, 'FORBIDDEN');
    if (o.t === 'delete' && (DELETABLE[name] || []).indexOf(o.table) < 0) throw new ApiError('This cannot be deleted', 'FORBIDDEN');
    if (o.t !== 'upsert' && o.t !== 'delete') throw new ApiError('Bad operation');
    if (o.t === 'upsert' && !o.row[def(o.table).id]) throw new ApiError('Row without an ID');
  }
  for (const o of ops) { // existing rows: version check + only where the action may edit them
    if (o.t !== 'upsert') continue;
    const cur = db.find(o.table, o.row[def(o.table).id]);
    if (!cur) continue;
    if (spec.edit.indexOf(o.table) < 0) throw new ApiError('Existing records cannot be edited here', 'FORBIDDEN');
    if (o.row._v !== undefined && o.row._v !== (cur._v || 0)) {
      throw new ApiError('Someone else has just changed this record. The latest data has been loaded; please try again.', 'CONFLICT');
    }
  }
  guards(name, user, ops, db); // validate everything before writing anything

  const now = host.now();
  const v = new View(db, ops);
  const applied: { table: TableKey; row: any }[] = [];
  const deleted: { table: TableKey; id: string }[] = [];
  for (const table of APPLY_ORDER) {
    for (const o of ops) {
      if (o.table !== table || o.t !== 'upsert') continue;
      const d = def(table);
      const cur = db.find(table, o.row[d.id]);
      const e: any = { ...(cur ? clean(cur) : {}), ...o.row };
      e._v = (cur ? cur._v || 0 : 0) + 1; e._at = now; e._by = user.loginId;
      if (table === 'pos') {
        if (cur) e.poNo = cur.poNo; else { e.poNo = nextNo(db, 'pos', 'poNo', 'PO-'); e.createdBy = user.name; e.department = user.department; }
      }
      if (table === 'receipts') {
        if (cur) e.grnNo = cur.grnNo; else { e.grnNo = e.type === 'Invoice' ? nextNo(db, 'receipts', 'grnNo', 'GRN-') : ''; e.createdBy = user.name; }
      }
      if (table === 'payments') e.paidBy = user.name;
      if (table === 'stock') e.by = user.name;
      if (table === 'poLines' && o.row.queryStatus === 'Open') e.queryBy = user.name;
      fillNames(db, table, e, v);
      db.put(table, e);
      applied.push({ table, row: clean(e) });
    }
  }
  for (const o of ops) {
    if (o.t !== 'delete') continue;
    const rows = db.rows(o.table);
    const i = rows.findIndex(r => r.id === o.id);
    if (i >= 0) {
      host.remove(def(o.table).sheet, rows[i].__row);
      const gone = rows[i].__row;
      rows.splice(i, 1);
      rows.forEach(r => { if (r.__row > gone) r.__row -= 1; });
    }
    deleted.push({ table: o.table, id: o.id as string });
  }
  const poRef = ops.map(o => (o.row ? (o.table === 'pos' ? o.row.id : o.row.poId) : '')).filter(Boolean)[0] || '';
  const detail = ops.map(o => `${o.t} ${o.table}:${o.t === 'upsert' ? o.row[def(o.table).id] : o.id}`).join('; ').slice(0, 1500);
  db.put('log', { id: host.uuid(), time: now, user: user.name, role: user.role, action: name, event: String(note || '').slice(0, 300), ref: poRef, detail });
  host.bumpStamp();
  return { applied, deleted, stamp: host.stamp() };
}

function history(db: Db, ref: string) {
  return { entries: db.rows('log').filter(r => r.ref === ref && r.event).map(r => ({ id: r.id, time: r.time, by: r.user, text: r.event })) };
}

// ---------------------------------------------------------------- files
function upload(host: Host, db: Db, user: User, req: any) {
  if (!user.permissions.some(p => ['advance.pay', 'payment.make', 'receipt.create', 'po.save', 'master.manage'].indexOf(p) >= 0)) throw new ApiError('Not allowed to upload', 'FORBIDDEN');
  const b64 = String(req.data || '');
  if (!b64 || b64.length * 0.75 > MAX_FILE_BYTES) throw new ApiError('File is empty or larger than 8 MB');
  if (!/^(image\/|application\/pdf$)/.test(String(req.mime))) throw new ApiError('Only images and PDF files are allowed');
  const safe = String(req.name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  const sub = String(req.folder || 'General').replace(/[^\w.\- ]+/g, '_').slice(0, 40);
  const s = settingsOf(db);
  const f = host.saveFile(s.DriveFolderId || '', sub, `${host.now().slice(0, 10)}_${user.loginId}_${safe}`, String(req.mime), b64);
  if (f.folderId !== s.DriveFolderId) {
    const row = db.find('settings', 'DriveFolderId');
    db.put('settings', { ...(row || { key: 'DriveFolderId', description: '' }), value: f.folderId });
  }
  return { fileId: f.id, name: safe };
}

// ---------------------------------------------------------------- users (admin)
function usersList(db: Db) {
  return { users: db.rows('users').map(u => ({ loginId: u.loginId, name: u.name, role: u.role, department: u.department, level: u.level, reportsTo: u.reportsTo, active: u.active })), roles: db.rows('roles').map(r => ({ role: r.role, level: r.level })) };
}

const text100 = (s: any) => { const v = String(s ?? '').slice(0, 100); return /^[=+@]/.test(v) ? ' ' + v : v; };

function usersSave(db: Db, req: any) {
  const u = req.user || {};
  const id = String(u.loginId || '').trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(id)) throw new ApiError('Login ID: 3-30 letters, numbers, . _ -');
  if (!db.rows('roles').some(r => lc(r.role) === lc(u.role))) throw new ApiError('Unknown role. Add it to the Roles tab first.');
  const cur = db.rows('users').find(r => lc(r.loginId) === lc(id));
  if (!cur && !u.password) throw new ApiError('Set a password for the new user');
  if (u.password && String(u.password).length < 6) throw new ApiError('Password must be at least 6 characters');
  db.put('users', {
    loginId: cur ? cur.loginId : id, password: u.password ? hashPw(id, String(u.password)) : cur.password,
    name: text100(u.name), role: text100(u.role), department: text100(u.department), level: Number(u.level) || 0,
    reportsTo: text100(u.reportsTo), active: u.active !== false,
  });
}

function changePassword(db: Db, user: User, req: any) {
  const u = db.rows('users').find(r => r.loginId === user.loginId)!;
  if (hashPw(u.loginId, String(req.oldPassword)) !== u.password && u.password !== String(req.oldPassword)) throw new ApiError('Current password is wrong');
  if (String(req.newPassword || '').length < 6) throw new ApiError('New password must be at least 6 characters');
  db.put('users', { ...u, password: hashPw(u.loginId, String(req.newPassword)) });
}

// ---------------------------------------------------------------- entry points
export function handle(host: Host, req: any): any {
  try {
    if (!req || typeof req !== 'object') throw new ApiError('Bad request');
    if (req.action === 'ping') return { ok: true, pong: true };
    if (!host.read(TABLES.users.sheet).length) throw new ApiError('The Sheet is not set up yet. Run setup() in Apps Script first.', 'SETUP');
    const fresh = () => new Db(host);
    switch (req.action) {
      case 'login': return { ok: true, ...host.withLock(() => login(host, fresh(), req)) };
      case 'logout': host.cacheRemove('sess:' + req.token); return { ok: true };
      case 'stamp': { if (!host.cacheGet('sess:' + req.token)) throw new ApiError('Session expired. Please log in again.', 'AUTH'); return { ok: true, stamp: host.stamp() }; }
      case 'bootstrap': return { ok: true, ...host.withLock(() => { const d = fresh(); return bootstrap(host, d, authenticate(host, d, req.token), !!req.all); }) };
      case 'commit': return { ok: true, ...host.withLock(() => { const d = fresh(); return commit(host, d, authenticate(host, d, req.token), String(req.name), req.ops, req.note); }) };
      case 'history': { const d = fresh(); authenticate(host, d, req.token); return { ok: true, ...history(d, String(req.ref)) }; }
      case 'upload': return { ok: true, ...host.withLock(() => { const d = fresh(); return upload(host, d, authenticate(host, d, req.token), req); }) };
      case 'file': { authenticate(host, fresh(), req.token); return { ok: true, ...host.readFile(String(req.fileId)) }; }
      case 'changePassword': return host.withLock(() => { const d = fresh(); changePassword(d, authenticate(host, d, req.token), req); return { ok: true }; });
      case 'users.list': { const d = fresh(); const u = authenticate(host, d, req.token); need(u, 'users.manage'); return { ok: true, ...usersList(d) }; }
      case 'users.save': return host.withLock(() => {
        const d = fresh();
        const u = authenticate(host, d, req.token); need(u, 'users.manage'); usersSave(d, req);
        d.put('log', { id: host.uuid(), time: host.now(), user: u.name, role: u.role, action: 'users.save', event: '', ref: '', detail: 'user ' + String(req.user?.loginId) });
        host.bumpStamp();
        return { ok: true, ...usersList(d) };
      });
      default: throw new ApiError('Unknown request');
    }
  } catch (e: any) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    return { ok: false, error: 'Server error: ' + (e?.message || e), code: 'SERVER' };
  }
}

/**
 * Create the tabs/headers and (on a fresh Sheet) the starting configuration. Never overwrites existing rows.
 * `extra` lets tests pre-fill tables; the shipped app starts with no business data at all.
 */
/**
 * Settings rows that earlier releases created for a PO letterhead (the PO no longer has one). setup() deletes them when
 * they are still blank or exactly as that release pre-filled them; anything you typed yourself is left alone (it is just unused).
 */
const OLD_LETTERHEAD_ROWS: Record<string, string[]> = {
  CompanyLegalName: ['', 'Little Nap Recliners', 'Little Nap Subhav India Pvt. Ltd.'],
  CompanyAddress: ['', 'Shree Shubham Logistics Park, 27-28, AB Road Bypass|Dewas, Indore, Madhya Pradesh 455001, India'],
  CompanyGSTIN: ['', '23AAFCL2047L1ZK'], CompanyCIN: ['', 'U36999MP2022PTC063150'], CompanyPhone: ['', '+91 62320 05722'],
  CompanyEmail: ['', 'inquiry@lnsindia.co.in'], CompanyWebsite: ['', 'www.lnsindia.co.in'],
  DeliverTo: ['', 'Little Nap Subhav Manufacturing Plant, Shree Shubham Logistics Park, 27-28, AB Road Bypass, Dewas, Madhya Pradesh 455001'],
};

/** Column headers renamed in later releases: [tab, old header, new header]. Applied in place so no data is lost. */
const RENAMED_HEADERS: [string, string, string][] = [['POLines', 'Price Query to HO', 'Price Query to Admin']];

/**
 * The CA and HO roles were merged into Admin. On an existing sheet this (once, safely):
 *  - gives Admin the "Approves POs above Rs" limit that CA had, and deletes the CA and HO rows from the Roles tab
 *  - turns real users that had the CA/HO role into Admin, and removes the demo.ca / demo.ho sample logins
 *  - renames "Pending CA" POs to "Pending Admin" and the CA step of every approval route to Admin
 * It does nothing once no CA/HO role is left.
 */
function mergeCaHoIntoAdmin(host: Host) {
  const db = new Db(host);
  const old = db.rows('roles').filter(r => /^(ca|ho)$/i.test(String(r.role).trim()));
  if (!old.length) return;
  const now = host.now();
  const ca = old.find(r => /^ca$/i.test(String(r.role).trim()));
  const admin = db.rows('roles').find(r => lc(r.role) === 'admin');
  if (admin && String(admin.approvesAbove).trim() === '') {
    const limit = ca && String(ca.approvesAbove).trim() !== '' ? ca.approvesAbove : '1000000';
    db.touch('roles', { ...admin, approvesAbove: limit });
  }
  const users = db.rows('users');
  const gone = users.filter(u => /^(ca|ho)$/i.test(String(u.role).trim()) && lc(u.loginId).indexOf('demo.') === 0);
  users.filter(u => /^(ca|ho)$/i.test(String(u.role).trim()) && gone.indexOf(u) < 0).forEach(u => db.touch('users', { ...u, role: 'Admin', level: 5 }));
  for (const p of db.rows('pos')) {
    const route = String(p.route).split(',').map(x => (lc(x) === 'ca' ? 'Admin' : x)).join(',');
    const status = lc(p.status) === 'pending ca' ? 'Pending Admin' : p.status;
    if (route !== p.route || status !== p.status) db.touch('pos', { ...p, route, status, _v: (p._v || 0) + 1, _at: now, _by: 'migration' });
  }
  gone.sort((a, b) => b.__row - a.__row).forEach(u => host.remove(def('users').sheet, u.__row));
  old.sort((a, b) => b.__row - a.__row).forEach(r => host.remove(def('roles').sheet, r.__row));
}

/** Standard roles whose "Screens" cell is still empty (an older sheet) get their starting menu. Never overwrites a value. */
function fillDefaultScreens(host: Host) {
  const db = new Db(host);
  for (const r of db.rows('roles')) {
    const def_ = DEFAULT_SCREENS[String(r.role).trim()];
    if (def_ && !String(r.screens ?? '').trim()) db.touch('roles', { ...r, screens: def_.join(', ') });
  }
}

export function setup(host: Host, extra?: Partial<Record<TableKey, any[]>>): string {
  const keys = Object.keys(TABLES) as TableKey[];
  for (const [sheet, from, to] of RENAMED_HEADERS) host.renameHeader(sheet, from, to);
  for (const k of keys) {
    const d = def(k);
    const cols = allCols(d);
    host.ensureSheet(d.sheet, cols.map(c => c.header), cols.filter(c => c.type === 'text' || c.type === 'date').map(c => c.header), d.color);
  }
  const db = new Db(host);
  const fill = (rows: Partial<Record<TableKey, any[]>>) => {
    for (const k of Object.keys(rows) as TableKey[]) {
      if (db.rows(k).length) continue; // never overwrite existing data
      for (const r of rows[k]!) db.put(k, def(k).kind === 'data' ? { ...r, _v: 1, _at: host.now(), _by: 'setup' } : r);
    }
  };
  if (extra) fill(extra);
  fill(configSeed());
  // An older sheet may lack newer Settings rows: add the missing ones (never touching existing values)
  for (const s of configSeed().settings!) if (!db.find('settings', s.key)) db.put('settings', s);
  const stale = db.rows('settings').filter(r => OLD_LETTERHEAD_ROWS[r.key] && OLD_LETTERHEAD_ROWS[r.key].indexOf(r.value) >= 0);
  stale.sort((a, b) => b.__row - a.__row).forEach(r => host.remove(def('settings').sheet, r.__row)); // bottom-up so row numbers stay valid
  mergeCaHoIntoAdmin(host);
  fillDefaultScreens(host);
  return 'Setup complete.';
}

/**
 * Fill the empty business tabs with realistic SAMPLE data (plus six demo.* logins) so the system can be explored.
 * Refuses if the sheet already holds any business data.
 */
export function loadSample(host: Host, today: string): string {
  const db = new Db(host);
  if (DATA_TABLES.some(k => db.rows(k).length > 0)) return 'Not loaded: the spreadsheet already has data. Sample data is only added to an empty system.';
  const data = sampleData(today) as Record<string, any[]>;
  for (const k of Object.keys(data) as TableKey[]) for (const r of data[k]) db.put(k, r);
  for (const u of sampleUsers()) if (!db.rows('users').some(x => lc(x.loginId) === lc(u.loginId))) db.put('users', u);
  host.bumpStamp();
  return 'Sample data loaded: 7 vendors, 12 items, 19 vendor prices, 10 POs, receipts, payments, stock movements. '
    + 'Log in with demo.purchase / demo.factory / demo.accounts / demo.store (password Demo@1234), and use your own admin login for the Admin parts. '
    + 'Remove everything with clearAllDataBeforeGoingLive() before real use.';
}

/** Delete ALL business data (every row of the data tabs and the Log) and the demo.* logins. Keeps Users, Roles and Settings. */
export function clearAllData(host: Host): number {
  let n = 0;
  const wipe = (sheet: string) => {
    const rows = host.read(sheet);
    rows.sort((a, b) => b.__row - a.__row).forEach(r => { host.remove(sheet, r.__row); n++; });
  };
  DATA_TABLES.forEach(k => wipe(def(k).sheet));
  wipe(def('log').sheet);
  host.read(def('users').sheet).filter(u => lc(u[def('users').cols[0].header]).indexOf(SAMPLE_USER_PREFIX) === 0)
    .sort((a, b) => b.__row - a.__row).forEach(u => { host.remove(def('users').sheet, u.__row); n++; });
  host.bumpStamp();
  return n;
}

export { DATA_TABLES };
