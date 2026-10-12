import { useSyncExternalStore } from 'react';
import { AppState, PoLine, PurchaseOrder, ReceiptLine, RoleInfo, User, Vendor } from './types';
import { Flat, diff, emptyFlat, flatten, nest } from './model';
import { Applied, ApiError, api, isConnected } from './api';
import { applyConfig, cfg } from './config';
import { advanceAvailable, approvalRoute, computeReceipt, poValue, receiptBalance, receivedQty, vendorOf } from './domain';
import { UploadFile, fileToUpload, round2, today, uid } from './utils';
import { DATA_TABLES } from './shared/schema';

// ------------------------------------------------------------------ session + snapshot
export type Phase = 'boot' | 'setup' | 'login' | 'ready';
export interface Snap {
  phase: Phase;
  user: User | null;
  roles: RoleInfo[];
  state: AppState;
  busy: number;      // saves in flight
  syncedAt: number;
  error: string;
}

const SESSION_KEY = 'littlenap-session';
let token = '';
let flat: Flat = emptyFlat();
let snap: Snap = { phase: 'boot', user: null, roles: [], state: nest(flat), busy: 0, syncedAt: 0, error: '' };
const listeners = new Set<() => void>();

function set(patch: Partial<Snap>) { snap = { ...snap, ...patch }; listeners.forEach(l => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useSnap = () => useSyncExternalStore(subscribe, () => snap);
export const useStore = (): AppState => useSyncExternalStore(subscribe, () => snap.state);
export const useAuth = () => {
  const s = useSnap();
  return { user: s.user, can: (perm: string) => !!s.user?.permissions.includes(perm), role: s.user?.role ?? '' };
};
export const currentUser = () => snap.user!;

const store = {
  get: () => { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } },
  put: (v: string) => { try { sessionStorage.setItem(SESSION_KEY, v); } catch { /* ignore */ } },
  del: () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } },
};

function applyBoot(b: Awaited<ReturnType<typeof api.bootstrap>>) {
  const f = emptyFlat();
  for (const k of DATA_TABLES) f[k] = b.data[k] ?? [];
  flat = f;
  applyConfig(b.config.settings, b.config.approvalRules);
  set({ user: b.user, roles: b.config.roles, state: nest(flat), syncedAt: Date.now(), phase: 'ready', error: '' });
}

export async function init() {
  if (!isConnected()) return set({ phase: 'setup' });
  const saved = store.get();
  if (saved) {
    token = saved;
    try { return applyBoot(await api.bootstrap(token)); } catch (e) {
      if (e instanceof ApiError && e.code !== 'AUTH') { set({ phase: 'login', error: e.message }); return; }
      token = ''; store.del();
    }
  }
  set({ phase: 'login' });
}

export async function login(loginId: string, password: string) {
  const r = await api.login(loginId, password);
  token = r.token;
  store.put(token);
  applyBoot(await api.bootstrap(token));
}

export async function logout() {
  if (token) await api.logout(token);
  token = ''; store.del(); flat = emptyFlat();
  set({ phase: isConnected() ? 'login' : 'setup', user: null, state: nest(flat) });
}

export const goSetup = () => set({ phase: 'setup' });
export const goLogin = () => set({ phase: 'login' });

/** Re-read everything from the Sheet. */
export async function reload() {
  if (!token) return;
  try { applyBoot(await api.bootstrap(token)); } catch (e) {
    if (e instanceof ApiError && e.code === 'AUTH') { token = ''; store.del(); set({ phase: 'login', user: null, error: (e as Error).message }); return; }
    throw e;
  }
}

// Pick up other people's changes every minute while the tab is visible
setInterval(() => {
  if (snap.phase === 'ready' && snap.busy === 0 && typeof document !== 'undefined' && !document.hidden) reload().catch(() => undefined);
}, 60_000);

// ------------------------------------------------------------------ saving
let chain: Promise<unknown> = Promise.resolve();

function mutate(name: string, fn: (draft: AppState) => void): Promise<void> {
  const run = async () => {
    const draft = structuredClone(snap.state);
    fn(draft); // business-rule errors are thrown here, before anything is sent
    const next = flatten(draft);
    const ops = diff(flat, next);
    if (!ops.length) return;
    flat = next;
    set({ state: nest(flat), busy: snap.busy + 1 });
    try {
      const res: Applied = await api.commit(token, name, ops);
      for (const { table, row } of res.applied) {
        const rows = (flat as any)[table] as any[];
        const i = rows.findIndex(r => r.id === row.id);
        if (i >= 0) rows[i] = row; else rows.push(row);
      }
      for (const { table, id } of res.deleted) (flat as any)[table] = (flat as any)[table].filter((r: any) => r.id !== id);
      set({ state: nest(flat), busy: snap.busy - 1, syncedAt: Date.now() });
    } catch (e) {
      set({ busy: snap.busy - 1 });
      await reload().catch(() => undefined); // drop the optimistic change and show the real data
      throw e;
    }
  };
  const p = chain.then(run);
  chain = p.catch(() => undefined);
  return p;
}

// ------------------------------------------------------------------ files (Google Drive)
export async function uploadFile(file: File | undefined, folder: string): Promise<string | undefined> {
  if (!file) return undefined;
  const f: UploadFile = await fileToUpload(file);
  return (await api.upload(token, folder, f)).fileId;
}
export async function fetchFile(id: string) { return api.file(token, id); }

// ------------------------------------------------------------------ workflow actions
const me = () => snap.user!;
const findPO = (s: AppState, id: string) => {
  const po = s.pos.find(p => p.id === id);
  if (!po) throw new Error('PO not found');
  return po;
};
const log = (po: PurchaseOrder, text: string) => po.history.push({ id: uid(), date: today(), by: me().name, text });
const PENDING = (role: string) => 'Pending ' + role;

/** Move a PO into approval using the route from the ApprovalRules sheet. */
function startApproval(po: PurchaseOrder) {
  po.route = approvalRoute(po);
  po.step = 0;
  if (po.route.length) po.status = PENDING(po.route[0]);
  else { po.status = 'Approved'; po.advanceStatus = po.advanceRequired ? 'Requested' : 'Not Required'; }
  log(po, 'Submitted for approval');
}

export interface PoInput {
  id?: string;
  vendorId: string;
  lines: PoLine[];
  terms: string;
  advanceRequired: boolean;
  advanceAmount: number;
  expectedDate: string;
}

export const actions = {
  /** Create or edit a PO. Prices always come from the vendor master. */
  savePO(input: PoInput, submit: boolean): Promise<string> {
    const id = input.id ?? uid();
    return mutate('po.save', s => {
      const vendor = vendorOf(s, input.vendorId);
      if (!vendor) throw new Error('Select a vendor');
      const lines = input.lines.filter(l => l.qty > 0).map(l => {
        const vi = vendor.items.find(i => i.itemId === l.itemId);
        if (!vi) throw new Error('Item is not on this vendor\'s list');
        const old = s.pos.find(p => p.id === id)?.lines.find(x => x.itemId === l.itemId);
        return { ...(old ?? {}), itemId: l.itemId, qty: l.qty, price: old ? old.price : vi.price }; // price is not editable
      });
      if (!lines.length) throw new Error('Add at least one item with a quantity');
      if (input.advanceRequired && !(input.advanceAmount > 0)) throw new Error('Enter the advance amount');
      let po = s.pos.find(p => p.id === id);
      if (po) {
        if (po.status !== 'Draft' && po.status !== 'Rejected') throw new Error('This PO can no longer be edited');
        po.lines = lines;
        log(po, 'PO edited');
      } else {
        po = {
          id, poNo: '', date: today(), vendorId: input.vendorId, lines, terms: '', advanceRequired: false, advanceAmount: 0,
          expectedDate: input.expectedDate, status: 'Draft', advanceStatus: 'Not Required', route: [], step: 0,
          createdBy: me().name, department: me().department, history: [],
        };
        log(po, 'Draft created');
        s.pos.push(po);
      }
      po.terms = input.terms;
      po.advanceRequired = input.advanceRequired;
      po.advanceAmount = input.advanceRequired ? input.advanceAmount : 0;
      po.expectedDate = input.expectedDate;
      if (submit) startApproval(po);
    }).then(() => id);
  },

  submitPO: (id: string) => mutate('po.submit', s => startApproval(findPO(s, id))),

  approve: (id: string, remark: string) => mutate('po.approve', s => {
    const po = findPO(s, id);
    if (po.status !== PENDING(me().role)) throw new Error('This PO is not waiting for your approval');
    po.step += 1;
    po.status = po.step < po.route.length ? PENDING(po.route[po.step]) : 'Approved';
    log(po, 'Approved' + (remark ? ` – ${remark}` : ''));
    if (po.status === 'Approved') {
      po.advanceStatus = po.advanceRequired ? 'Requested' : 'Not Required';
      if (po.advanceRequired) log(po, 'Advance request sent to Accounts');
    }
  }),

  reject: (id: string, remark: string) => mutate('po.reject', s => {
    const po = findPO(s, id);
    if (po.status !== PENDING(me().role)) throw new Error('This PO is not waiting for your approval');
    po.status = 'Rejected';
    log(po, 'Not approved' + (remark ? ` – ${remark}` : ''));
  }),

  payAdvance: (id: string, amount: number, date: string, fully: boolean, screenshot?: string) => mutate('advance.pay', s => {
    const po = findPO(s, id);
    if (po.advanceStatus !== 'Requested') throw new Error('No advance is pending for this PO');
    if (!(amount > 0)) throw new Error('Enter the amount paid');
    s.payments.push({ id: uid(), poId: id, kind: 'advance', amount: round2(amount), date, screenshot });
    po.advanceStatus = fully ? 'Fully Paid' : 'Advance Paid';
    log(po, `${po.advanceStatus}: ${amount}`);
  }),

  sendToVendor: (id: string, via: 'Email' | 'WhatsApp') => mutate('po.send', s => {
    const po = findPO(s, id);
    const v = vendorOf(s, po.vendorId)!;
    if (po.status !== 'Approved') throw new Error('PO is not approved');
    if (po.advanceStatus === 'Requested') throw new Error('Advance has not been paid yet');
    po.status = 'Sent to Vendor';
    po.sentVia = via;
    po.sentTo = via === 'Email' ? v.email : v.whatsapp;
    log(po, `Sent to vendor via ${via} (${po.sentTo})`);
  }),

  /** Goods receipt. PO quantity edits are honoured only when the invoice does not match the PO. */
  createReceipt: (input: {
    poId: string; invoiceNo: string; invoiceDate: string; receivedDate: string; invoiceTotal: number; invoiceFile?: string;
    lines: { itemId: string; qty: number; taxRate: number; poQty?: number }[];
  }) => mutate('receipt.create', s => {
    const po = findPO(s, input.poId);
    if (po.status !== 'Sent to Vendor') throw new Error('PO has not been sent to the vendor');
    const invNo = input.invoiceNo.trim();
    if (!invNo) throw new Error('Enter the invoice number');
    if (s.receipts.some(r => r.invoiceNo.toLowerCase() === invNo.toLowerCase() && findPO(s, r.poId).vendorId === po.vendorId)) {
      throw new Error('This invoice number is already booked for this vendor');
    }
    const picked = input.lines.filter(l => l.qty > 0);
    if (!picked.length) throw new Error('Select the items received');
    const lines: ReceiptLine[] = [];
    for (const l of picked) {
      const pl = po.lines.find(x => x.itemId === l.itemId);
      if (!pl) throw new Error('Item is not on this PO');
      if (l.poQty !== undefined && l.poQty !== pl.qty) {
        log(po, `PO quantity changed ${pl.qty} → ${l.poQty} (invoice mismatch)`);
        pl.qty = l.poQty;
      }
      if (l.qty > pl.qty - receivedQty(s, po.id, l.itemId) + 1e-9) throw new Error('Received quantity is more than the pending PO quantity');
      lines.push({ itemId: l.itemId, qty: l.qty, price: pl.price, taxRate: l.taxRate });
    }
    const t = computeReceipt(lines);
    if (Math.abs(t.grandTotal - input.invoiceTotal) > cfg.tolerance) throw new Error('Grand total does not match the invoice total');
    const adjusted = Math.min(t.grandTotal, advanceAvailable(s, po.id));
    const id = uid();
    s.receipts.push({
      id, grnNo: '', poId: po.id, invoiceNo: invNo, invoiceDate: input.invoiceDate, receivedDate: input.receivedDate, lines, ...t,
      advanceAdjusted: round2(adjusted), payable: round2(t.grandTotal - adjusted), accepted: false, acceptedDate: '',
      invoiceFile: input.invoiceFile ?? '', createdBy: me().name,
    });
    log(po, `Goods received, invoice ${invNo}`);
  }),

  acceptInvoice: (receiptId: string) => mutate('invoice.accept', s => {
    const r = s.receipts.find(x => x.id === receiptId)!;
    r.accepted = true;
    r.acceptedDate = today();
    log(findPO(s, r.poId), `Invoice ${r.invoiceNo} accepted`);
  }),

  payInvoice: (receiptId: string, amount: number, date: string, screenshot?: string) => mutate('payment.make', s => {
    const r = s.receipts.find(x => x.id === receiptId)!;
    if (!r.accepted) throw new Error('Accept the invoice before paying');
    if (!(amount > 0) || amount > receiptBalance(s, r) + 0.005) throw new Error('Amount must be between 0 and the balance');
    s.payments.push({ id: uid(), poId: r.poId, receiptId, kind: 'invoice', amount: round2(amount), date, screenshot });
    log(findPO(s, r.poId), `Paid ${amount} against invoice ${r.invoiceNo}`);
  }),

  addOpening: (vendorId: string, ref: string, amount: number, dueDate: string) =>
    mutate('opening.add', s => { s.openings.push({ id: uid(), vendorId, ref, amount, dueDate }); }),

  payOpening: (openingId: string, amount: number, date: string, screenshot?: string) => mutate('payment.make', s => {
    s.payments.push({ id: uid(), openingId, kind: 'opening', amount: round2(amount), date, screenshot });
  }),

  raiseQuery: (poId: string, itemId: string, note: string) =>
    mutate('query.raise', s => { s.queries.push({ id: uid(), poId, itemId, note, raisedBy: me().name, date: today(), status: 'Open' }); }),
  resolveQuery: (id: string) => mutate('master.manage', s => { s.queries.find(q => q.id === id)!.status = 'Resolved'; }),

  // ---- Backend / HO master data ----
  addItem: (name: string, unit: string) => mutate('master.manage', s => { s.items.push({ id: uid(), name, unit }); }),
  saveVendor: (v: Omit<Vendor, 'id'> & { id?: string }) => mutate('master.manage', s => {
    if (v.id) {
      const cur = s.vendors.find(x => x.id === v.id)!;
      // keep each price row's version so concurrent edits are detected
      const items = v.items.map(i => ({ ...(cur.items.find(c => c.itemId === i.itemId) ?? {}), itemId: i.itemId, price: i.price }));
      Object.assign(cur, v, { items });
    } else s.vendors.push({ ...v, id: uid() } as Vendor);
  }),
};

export const poTotal = poValue;

export const currentToken = () => token;
