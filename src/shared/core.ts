/**
 * Server logic. Runs inside Google Apps Script (bundled into apps-script/Code.gs),
 * and unchanged in the tests (with an in-memory Host).
 * The environment is injected through `Host`.
 */
import { Book, DATA_TABLES, TABLES, TableKey, allCols, bookOf, def, fromSheet, toSheet } from './schema';
import { sha256 } from './sha256';
import { configSeed } from './seed';

export interface Host {
  now(): string;                                   // ISO timestamp
  uuid(): string;
  // `book` says which Google Spreadsheet file: 'data' (business data) or 'access' (logins, roles, permissions, settings)
  ensureSheet(book: Book, name: string, headers: string[], textHeaders: string[]): void;
  read(book: Book, name: string): Record<string, any>[];       // header → value, plus __row (1-based sheet row index of the data row)
  append(book: Book, name: string, row: Record<string, any>): number; // returns new row index
  update(book: Book, name: string, rowIdx: number, row: Record<string, any>): void;
  remove(book: Book, name: string, rowIdx: number): void;
  withLock<T>(fn: () => T): T;
  cacheGet(key: string): string | null;
  cachePut(key: string, value: string, ttlSeconds: number): void;
  cacheRemove(key: string): void;
  saveFile(folderId: string, subfolder: string, name: string, mime: string, base64: string): { id: string; folderId: string };
  readFile(id: string): { name: string; mime: string; base64: string };
}

export class ApiError extends Error {
  constructor(message: string, public code = 'ERROR') { super(message); }
}

const SESSION_TTL = 6 * 3600;
const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Which tables each named action is allowed to write. */
const ACTION_TABLES: Record<string, TableKey[]> = {
  'po.save': ['pos', 'poLines', 'poHistory'],
  'po.submit': ['pos', 'poHistory'],
  'po.approve': ['pos', 'poHistory'],
  'po.reject': ['pos', 'poHistory'],
  'po.send': ['pos', 'poHistory'],
  'advance.pay': ['pos', 'poHistory', 'payments'],
  'receipt.create': ['receipts', 'receiptLines', 'pos', 'poLines', 'poHistory'],
  'invoice.accept': ['receipts', 'poHistory'],
  'payment.make': ['payments', 'poHistory'],
  'opening.add': ['openings'],
  'query.raise': ['queries'],
  'master.manage': ['vendors', 'vendorItems', 'items', 'queries'],
};

// ---------------------------------------------------------------- data access
class Db {
  private cache: Partial<Record<TableKey, any[]>> = {};
  constructor(private host: Host) {}
  rows(k: TableKey): any[] {
    if (!this.cache[k]) {
      const d = def(k);
      this.cache[k] = this.host.read(bookOf(d), d.sheet).map(raw => ({ ...fromSheet(d, raw), __row: raw.__row }));
    }
    return this.cache[k]!;
  }
  find(k: TableKey, id: string) { return this.rows(k).find(r => r[def(k).id] === id); }
  put(k: TableKey, e: any) {
    const d = def(k);
    const rows = this.rows(k);
    const i = rows.findIndex(r => r[d.id] === e[d.id]);
    if (i >= 0) { this.host.update(bookOf(d), d.sheet, rows[i].__row, toSheet(d, e)); rows[i] = { ...e, __row: rows[i].__row }; }
    else rows.push({ ...e, __row: this.host.append(bookOf(d), d.sheet, toSheet(d, e)) });
  }
  del(k: TableKey, id: string) {
    const d = def(k);
    const rows = this.rows(k);
    const i = rows.findIndex(r => r[d.id] === id);
    if (i < 0) return;
    this.host.remove(bookOf(d), d.sheet, rows[i].__row);
    const gone = rows[i].__row;
    rows.splice(i, 1);
    rows.forEach(r => { if (r.__row > gone) r.__row -= 1; });
  }
}

const clean = (e: any) => { const { __row, ...rest } = e; return rest; };
const lc = (s: any) => String(s ?? '').trim().toLowerCase();

function settingsOf(db: Db): Record<string, string> {
  const o: Record<string, string> = {};
  db.rows('settings').forEach(r => { o[r.key] = r.value; });
  return o;
}

// ---------------------------------------------------------------- auth
const hashPw = (loginId: string, pw: string) => 'sha256:' + sha256(lc(loginId) + ':' + pw);

interface User { loginId: string; name: string; role: string; department: string; level: number; permissions: string[] }

function permissionsFor(db: Db, role: string, level: number): string[] {
  const out: string[] = [];
  db.rows('permissions').forEach(p => {
    const roles = String(p.roles).split(',').map(lc).filter(Boolean);
    if (roles.includes('*') || roles.includes(lc(role)) || (p.minLevel > 0 && level >= p.minLevel)) out.push(p.action);
  });
  return out;
}

function buildUser(db: Db, u: any): User {
  const roleRow = db.rows('roles').find(r => lc(r.role) === lc(u.role));
  const level = u.level || roleRow?.level || 0;
  return { loginId: u.loginId, name: u.name || u.loginId, role: u.role, department: u.department || roleRow?.department || '', level, permissions: permissionsFor(db, u.role, level) };
}

function login(host: Host, db: Db, req: any) {
  const id = lc(req.loginId);
  const pw = String(req.password ?? '');
  if (!id || !pw) throw new ApiError('Enter Login ID and password', 'AUTH');
  const pending = db.rows('users').find(r => lc(r.loginId) === id);
  if (pending && pending.active && !pending.password) throw new ApiError('No password has been set for this login yet. Ask the Admin to type one in the Users sheet.', 'AUTH');
  const failKey = 'fail:' + id;
  if (Number(host.cacheGet(failKey) || 0) >= MAX_FAILS) throw new ApiError('Too many wrong attempts. Try again in 15 minutes.', 'AUTH');
  const u = db.rows('users').find(r => lc(r.loginId) === id);
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
  if (!user.permissions.includes(perm)) throw new ApiError(`Your role (${user.role}) is not allowed to do this (${perm})`, 'FORBIDDEN');
};

// ---------------------------------------------------------------- reads
function bootstrap(host: Host, db: Db, user: User) {
  // Fill blank IDs typed by hand in the Sheet (e.g. a new vendor row)
  for (const k of ['vendors', 'items'] as TableKey[]) {
    const d = def(k);
    const rows = db.rows(k);
    let n = rows.reduce((m, r) => Math.max(m, Number(String(r[d.id]).replace(/\D/g, '')) || 0), 0);
    rows.filter(r => !r[d.id] && (r.name || r.contact)).forEach(r => {
      r[d.id] = d.autoId! + ++n;
      db.put(k, { ...r, _v: (r._v || 0) + 1, _at: host.now(), _by: 'sheet' });
    });
  }
  const data: Record<string, any[]> = {};
  for (const k of DATA_TABLES) data[k] = db.rows(k).filter(r => r[def(k).id]).map(clean);
  const s = settingsOf(db);
  delete s.DriveFolderId;
  return {
    user,
    config: {
      settings: s,
      roles: db.rows('roles').map(clean),
      approvalRules: db.rows('approvalRules').map(clean).sort((a, b) => a.step - b.step),
    },
    data,
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
      if (/^[=+@]/.test(s)) s = ' ' + s;
      out[col.key] = s;
    }
  }
  if (d.kind === 'data') out._v = row._v === undefined || row._v === null ? undefined : Number(row._v);
  return out;
}

const PENDING = (role: string) => 'Pending ' + role;

/** Approval route for a PO value, from the ApprovalRules sheet. */
export function routeFor(rules: { step: number; fromValue: number; approverRole: string }[], value: number): string[] {
  const out: string[] = [];
  [...rules].sort((a, b) => a.step - b.step).filter(r => value > r.fromValue && r.approverRole).forEach(r => {
    if (out[out.length - 1] !== r.approverRole) out.push(r.approverRole);
  });
  return out;
}

function poValueOf(db: Db, ops: Op[], poId: string): number {
  const lines = new Map<string, any>();
  db.rows('poLines').filter(l => l.poId === poId).forEach(l => lines.set(l.id, l));
  ops.forEach(o => {
    if (o.table !== 'poLines') return;
    if (o.t === 'delete') lines.delete(o.id as string);
    else if (o.row.poId === poId) lines.set(o.row.id, o.row);
  });
  let v = 0; lines.forEach(l => { v += l.qty * l.price; });
  return Math.round(v * 100) / 100;
}

function guards(action: string, user: User, ops: Op[], db: Db) {
  const ups = (k: TableKey) => ops.filter(o => o.t === 'upsert' && o.table === k).map(o => o.row);
  const rules = db.rows('approvalRules');
  const FROZEN = ['vendorId', 'terms', 'expectedDate', 'advanceRequired', 'advanceAmount', 'route', 'date'];

  for (const p of ups('pos')) {
    const cur = db.find('pos', p.id);
    const bad = (m: string) => { throw new ApiError(m, 'FORBIDDEN'); };
    if (action === 'po.save' || action === 'po.submit') {
      if (cur && cur.status !== 'Draft' && cur.status !== 'Rejected') bad('This PO can no longer be edited');
      if (action === 'po.submit' && !cur) bad('Save the PO first');
      if (p.status === 'Draft' || (cur && cur.status === 'Rejected' && p.status === 'Rejected')) continue;
      // submitting: the server decides the route, never the browser
      const route = routeFor(rules, poValueOf(db, ops, p.id));
      const want = route.length ? PENDING(route[0]) : 'Approved';
      if (p.status !== want || p.route !== route.join(',') || p.step !== (route.length ? 0 : route.length)) bad('Approval route does not match the ApprovalRules sheet');
      if (!route.length && p.advanceStatus !== (p.advanceRequired ? 'Requested' : 'Not Required')) bad('Advance status is wrong');
    } else if (action === 'po.approve' || action === 'po.reject') {
      if (!cur || lc(cur.status) !== lc(PENDING(user.role))) bad(`This PO is not waiting for the ${user.role}`);
      FROZEN.forEach(f => { if (cur[f] !== p[f]) bad('Only the approval status can change here'); });
      if (action === 'po.reject') { if (p.status !== 'Rejected') bad('Invalid status'); continue; }
      const route = String(cur.route).split(',').filter(Boolean);
      const step = (cur.step || 0) + 1;
      const want = step < route.length ? PENDING(route[step]) : 'Approved';
      if (p.status !== want || p.step !== step) bad('Invalid approval step');
      if (want === 'Approved' && p.advanceStatus !== (cur.advanceRequired ? 'Requested' : 'Not Required')) bad('Advance status is wrong');
    } else if (action === 'po.send') {
      if (!cur || cur.status !== 'Approved' || cur.advanceStatus === 'Requested' || p.status !== 'Sent to Vendor') bad('PO cannot be sent now');
      FROZEN.forEach(f => { if (cur[f] !== p[f]) bad('Only sending details can change here'); });
    } else if (action === 'advance.pay') {
      if (!cur || cur.advanceStatus !== 'Requested' || !['Advance Paid', 'Fully Paid'].includes(p.advanceStatus) || p.status !== cur.status) bad('No advance is pending for this PO');
      FROZEN.forEach(f => { if (cur[f] !== p[f]) bad('Only the advance status can change here'); });
    } else if (action === 'receipt.create') {
      if (!cur || cur.status !== 'Sent to Vendor' || p.status !== cur.status || p.vendorId !== cur.vendorId || p.route !== cur.route) bad('PO is not open for receipt');
    }
  }
  if (action === 'advance.pay') {
    if (ups('payments').some(x => x.kind !== 'advance')) throw new ApiError('Only advance payments here', 'FORBIDDEN');
    if (!ups('pos').length) throw new ApiError('Nothing to pay');
  }
  if (action === 'payment.make') {
    for (const pay of ups('payments')) {
      if (pay.kind === 'advance') throw new ApiError('Use the advance flow for advances', 'FORBIDDEN');
      if (pay.amount <= 0) throw new ApiError('Amount must be positive');
      if (pay.kind === 'invoice') {
        const r = db.find('receipts', pay.receiptId);
        if (!r || !r.accepted) throw new ApiError('Accept the invoice before paying', 'FORBIDDEN');
        const paid = db.rows('payments').filter(x => x.receiptId === r.id).reduce((a, x) => a + x.amount, 0);
        if (paid + pay.amount > r.payable + 0.01) throw new ApiError('Payment is more than the balance payable');
      }
      if (pay.kind === 'opening') {
        const o = db.find('openings', pay.openingId);
        const paid = db.rows('payments').filter(x => x.openingId === pay.openingId).reduce((a, x) => a + x.amount, 0);
        if (!o || paid + pay.amount > o.amount + 0.01) throw new ApiError('Payment is more than the balance payable');
      }
    }
  }
  if (action === 'invoice.accept') {
    for (const r of ups('receipts')) {
      const cur = db.find('receipts', r.id);
      if (!cur || cur.accepted || !r.accepted || cur.grandTotal !== r.grandTotal || cur.payable !== r.payable) throw new ApiError('Invoice cannot be accepted', 'FORBIDDEN');
    }
  }
  // Prices can never be typed in: new PO lines carry the vendor-master price; existing lines keep theirs.
  for (const l of ups('poLines')) {
    const cur = db.find('poLines', l.id);
    if (cur) { if (cur.price !== l.price) throw new ApiError('PO price cannot be changed. Ask HO to update the vendor price.', 'FORBIDDEN'); continue; }
    const po = ups('pos').find(p => p.id === l.poId) ?? db.find('pos', l.poId);
    const vi = po && db.find('vendorItems', `${po.vendorId}:${l.itemId}`);
    if (!vi || vi.price !== l.price) throw new ApiError('PO price must match the vendor price list', 'FORBIDDEN');
  }
  for (const l of ups('receiptLines')) {
    const rc = ups('receipts').find(r => r.id === l.receiptId) ?? db.find('receipts', l.receiptId);
    const pl = rc && (ups('poLines').find(x => x.id === `${rc.poId}:${l.itemId}`) ?? db.find('poLines', `${rc.poId}:${l.itemId}`));
    if (!pl || pl.price !== l.price) throw new ApiError('Receipt price must equal the PO price', 'FORBIDDEN');
  }
  if (action === 'receipt.create') {
    const tol = Number(settingsOf(db).InvoiceTolerance || 1);
    for (const r of ups('receipts')) {
      if (db.find('receipts', r.id)) throw new ApiError('Receipts cannot be edited', 'FORBIDDEN');
      const lines = ups('receiptLines').filter(l => l.receiptId === r.id);
      const sub = lines.reduce((a, l) => a + l.qty * l.price, 0);
      const tax = lines.reduce((a, l) => a + (l.qty * l.price * l.taxRate) / 100, 0);
      if (!lines.length || Math.abs(sub + tax - r.grandTotal) > 0.05) throw new ApiError('Receipt total does not match its lines');
      void tol;
    }
  }
}

function nextNumber(db: Db, name: string, prefix: string): string {
  const cur = db.find('counters', name);
  const used = db.rows(name === 'po' ? 'pos' : 'receipts').reduce((m, r) => Math.max(m, Number(String(r[name === 'po' ? 'poNo' : 'grnNo']).replace(/\D/g, '')) || 0), 0);
  const v = Math.max(cur?.value || 0, used) + 1; // never reuse a number, even if the Sheet was edited by hand
  db.put('counters', { id: name, value: v });
  return prefix + String(v).padStart(4, '0');
}

function commit(host: Host, db: Db, user: User, name: string, rawOps: any[]) {
  const tables = ACTION_TABLES[name];
  if (!tables) throw new ApiError('Unknown action ' + name);
  need(user, name);
  if (!Array.isArray(rawOps) || rawOps.length > 200) throw new ApiError('Too many changes in one request');
  const ops: Op[] = rawOps.map((o: any) => ({ t: o.t, table: o.table, id: o.id, row: o.row ? sanitizeRow(o.table, o.row) : undefined }));
  for (const o of ops) {
    if (!tables.includes(o.table)) throw new ApiError(`${name} may not change ${o.table}`, 'FORBIDDEN');
    if (o.t !== 'upsert' && o.t !== 'delete') throw new ApiError('Bad operation');
    if (o.t === 'delete' && (o.table === 'poHistory' || o.table === 'payments')) throw new ApiError('This cannot be deleted', 'FORBIDDEN');
    if (o.t === 'upsert' && !o.row[def(o.table).id]) throw new ApiError('Row without an ID');
  }
  for (const o of ops) {
    if (o.t !== 'upsert') continue;
    const cur = db.find(o.table, o.row[def(o.table).id]);
    if (cur && (o.table === 'payments' || o.table === 'poHistory' || o.table === 'receiptLines')) throw new ApiError('Existing records cannot be edited', 'FORBIDDEN');
    if (cur && o.row._v !== undefined && o.row._v !== (cur._v || 0)) {
      throw new ApiError('Someone else has just changed this record. The latest data has been loaded; please try again.', 'CONFLICT');
    }
  }
  guards(name, user, ops, db); // validate everything before writing anything
  const now = host.now();
  const applied: { table: TableKey; row: any }[] = [];
  const deleted: { table: TableKey; id: string }[] = [];
  for (const o of ops) {
    if (o.t !== 'upsert') continue;
    const d = def(o.table);
    const cur = db.find(o.table, o.row[d.id]);
    const e: any = { ...(cur ? clean(cur) : {}), ...o.row };
    e._v = (cur ? cur._v || 0 : 0) + 1; e._at = now; e._by = user.loginId;
    if (o.table === 'pos') {
      if (cur) e.poNo = cur.poNo; else { e.poNo = nextNumber(db, 'po', 'PO-'); e.createdBy = user.name; e.department = user.department; }
    }
    if (o.table === 'receipts') {
      if (cur) e.grnNo = cur.grnNo; else { e.grnNo = nextNumber(db, 'grn', 'GRN-'); e.createdBy = user.name; }
    }
    if (o.table === 'poHistory') { e.by = user.name; e.date = e.date || now.slice(0, 10); }
    if (o.table === 'payments') e.paidBy = user.name;
    db.put(o.table, e);
    applied.push({ table: o.table, row: clean(e) });
  }
  for (const o of ops) {
    if (o.t === 'delete') { db.del(o.table, o.id as string); deleted.push({ table: o.table, id: o.id as string }); }
  }
  const detail = ops.map(o => `${o.t} ${o.table}:${o.t === 'upsert' ? o.row[def(o.table).id] : o.id}`).join('; ').slice(0, 1500);
  db.put('audit', { id: host.uuid(), time: now, user: user.loginId, role: user.role, action: name, detail });
  return { applied, deleted };
}
const sanitizeRow = (k: string, row: any) => {
  if (!(k in TABLES) || TABLES[k as TableKey].kind !== 'data') throw new ApiError('Unknown table ' + k);
  return sanitize(k as TableKey, row);
};

// ---------------------------------------------------------------- files
function upload(host: Host, db: Db, user: User, req: any) {
  if (!(user.permissions.some(p => ['advance.pay', 'payment.make', 'receipt.create', 'po.save', 'master.manage'].includes(p)))) throw new ApiError('Not allowed to upload', 'FORBIDDEN');
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
  return { users: db.rows('users').map(u => ({ loginId: u.loginId, name: u.name, role: u.role, department: u.department, level: u.level, reportsTo: u.reportsTo, active: u.active })), roles: db.rows('roles').map(clean) };
}

function usersSave(db: Db, req: any) {
  const u = req.user || {};
  const id = String(u.loginId || '').trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(id)) throw new ApiError('Login ID: 3-30 letters, numbers, . _ -');
  if (!db.rows('roles').some(r => lc(r.role) === lc(u.role))) throw new ApiError('Unknown role. Add it to the Roles sheet first.');
  const cur = db.rows('users').find(r => lc(r.loginId) === lc(id));
  if (!cur && !u.password) throw new ApiError('Set a password for the new user');
  if (u.password && String(u.password).length < 6) throw new ApiError('Password must be at least 6 characters');
  db.put('users', {
    loginId: cur ? cur.loginId : id, password: u.password ? hashPw(id, String(u.password)) : cur.password,
    name: sanitize2(u.name), role: sanitize2(u.role), department: sanitize2(u.department), level: Number(u.level) || 0,
    reportsTo: sanitize2(u.reportsTo), active: u.active !== false,
  });
}
const sanitize2 = (s: any) => { const v = String(s ?? '').slice(0, 100); return /^[=+@]/.test(v) ? ' ' + v : v; };

function changePassword(host: Host, db: Db, user: User, req: any) {
  const u = db.rows('users').find(r => r.loginId === user.loginId)!;
  if (hashPw(u.loginId, String(req.oldPassword)) !== u.password && u.password !== String(req.oldPassword)) throw new ApiError('Current password is wrong');
  if (String(req.newPassword || '').length < 6) throw new ApiError('New password must be at least 6 characters');
  db.put('users', { ...u, password: hashPw(u.loginId, String(req.newPassword)) });
  void host;
}

// ---------------------------------------------------------------- entry points
export function handle(host: Host, req: any): any {
  try {
    if (!req || typeof req !== 'object') throw new ApiError('Bad request');
    const db = new Db(host);
    if (!host.read('access', TABLES.users.sheet).length && req.action !== 'ping') throw new ApiError('The Sheet is not set up yet. Run setup() in Apps Script first.', 'SETUP');
    switch (req.action) {
      case 'ping': return { ok: true, pong: true };
      case 'login': return { ok: true, ...host.withLock(() => login(host, db, req)) };
      case 'logout': host.cacheRemove('sess:' + req.token); return { ok: true };
      case 'bootstrap': return { ok: true, ...host.withLock(() => { const d2 = new Db(host); return bootstrap(host, d2, authenticate(host, d2, req.token)); }) };
      case 'commit': return { ok: true, ...host.withLock(() => { const d2 = new Db(host); return commit(host, d2, authenticate(host, d2, req.token), String(req.name), req.ops); }) };
      case 'upload': return { ok: true, ...host.withLock(() => { const d2 = new Db(host); return upload(host, d2, authenticate(host, d2, req.token), req); }) };
      case 'file': {
        authenticate(host, db, req.token);
        const f = host.readFile(String(req.fileId));
        return { ok: true, ...f };
      }
      case 'changePassword': return host.withLock(() => { const d2 = new Db(host); changePassword(host, d2, authenticate(host, d2, req.token), req); return { ok: true }; });
      case 'users.list': { const u = authenticate(host, db, req.token); need(u, 'users.manage'); return { ok: true, ...usersList(db) }; }
      case 'users.save': return host.withLock(() => {
        const d2 = new Db(host);
        const u = authenticate(host, d2, req.token); need(u, 'users.manage'); usersSave(d2, req);
        d2.put('audit', { id: host.uuid(), time: host.now(), user: u.loginId, role: u.role, action: 'users.save', detail: String(req.user?.loginId) });
        return { ok: true, ...usersList(d2) };
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
export function setup(host: Host, extra?: Partial<Record<TableKey, any[]>>): string {
  const keys = Object.keys(TABLES) as TableKey[];
  for (const k of keys) {
    const d = def(k);
    const cols = allCols(d);
    host.ensureSheet(bookOf(d), d.sheet, cols.map(c => c.header), cols.filter(c => c.type === 'text' || c.type === 'date').map(c => c.header));
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
  return 'Setup complete.';
}
