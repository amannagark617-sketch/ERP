import { useSyncExternalStore } from 'react';
import { AppState, HistoryEntry, Item, PoLine, PurchaseOrder, ReceiptLine, RoleInfo, User, Vendor } from './types';
import { Flat, diff, emptyFlat, flatten, nest } from './model';
import { Applied, ApiError, api, isConnected } from './api';
import { applyConfig, cfg } from './config';
import { advanceAvailable, approvalRoute, computeReceipt, dueDateFor, itemOf, lineName, poValue, receiptBalance, receivedQty, sameLine, stockOnHand, vendorOf } from './domain';
import { normBrand } from './shared/keys';
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
  /** older settled records are not loaded; "Load full history" fetches them */
  partial: boolean;
  cutoff: string;
}

const SESSION_KEY = 'littlenap-session';
let token = '';
let lastStamp = '';
let loadAll = false;
let stockBase: Record<string, number> = {};
let flat: Flat = emptyFlat();
let snap: Snap = { phase: 'boot', user: null, roles: [], state: nest(flat), busy: 0, syncedAt: 0, error: '', partial: false, cutoff: '' };
const listeners = new Set<() => void>();

function set(patch: Partial<Snap>) { snap = { ...snap, ...patch }; listeners.forEach(l => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useSnap = () => useSyncExternalStore(subscribe, () => snap);
export const useStore = (): AppState => useSyncExternalStore(subscribe, () => snap.state);
export const useAuth = () => {
  const s = useSnap();
  return {
    user: s.user, role: s.user?.role ?? '',
    can: (perm: string) => !!s.user?.permissions.includes(perm),
    /** does this role's menu include the screen? (Roles tab: "Screens this role sees") */
    sees: (screen: string) => !!s.user?.screens.includes(screen),
  };
};
export const currentToken = () => token;

const store = {
  get: () => { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } },
  put: (v: string) => { try { sessionStorage.setItem(SESSION_KEY, v); } catch { /* ignore */ } },
  del: () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } },
};

function applyBoot(b: Awaited<ReturnType<typeof api.bootstrap>>) {
  const f = emptyFlat();
  for (const k of DATA_TABLES) f[k] = b.data[k] ?? [];
  flat = f;
  stockBase = b.stockBase || {};
  lastStamp = b.stamp;
  applyConfig(b.config.settings, b.config.approvers);
  set({ user: b.user, roles: b.config.roles, state: nest(flat, stockBase), syncedAt: Date.now(), phase: 'ready', error: '', partial: b.partial, cutoff: b.cutoff });
}

export async function init() {
  if (!isConnected()) return set({ phase: 'setup' });
  const saved = store.get();
  if (saved) {
    token = saved;
    try { return applyBoot(await api.bootstrap(token, loadAll)); } catch (e) {
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
  applyBoot(await api.bootstrap(token, loadAll));
}

export async function logout() {
  if (token) await api.logout(token);
  token = ''; store.del(); flat = emptyFlat(); loadAll = false;
  set({ phase: isConnected() ? 'login' : 'setup', user: null, state: nest(flat) });
}

export const goSetup = () => set({ phase: 'setup' });
export const goLogin = () => set({ phase: 'login' });

/** Re-read everything from the Sheet. */
export async function reload() {
  if (!token) return;
  try { applyBoot(await api.bootstrap(token, loadAll)); } catch (e) {
    if (e instanceof ApiError && e.code === 'AUTH') { token = ''; store.del(); set({ phase: 'login', user: null, error: (e as Error).message }); return; }
    throw e;
  }
}

export async function loadFullHistory() { loadAll = true; await reload(); }

// Cheap check for news every 30 s: only reloads when the spreadsheet actually changed.
setInterval(async () => {
  if (snap.phase !== 'ready' || snap.busy > 0 || (typeof document !== 'undefined' && document.hidden)) return;
  try {
    const { stamp } = await api.stamp(token);
    if (stamp !== lastStamp && snap.busy === 0) await reload();
  } catch { /* offline or session ended: the next action will say so */ }
}, 30_000);

export const fetchHistory = async (ref: string): Promise<HistoryEntry[]> => (await api.history(token, ref)).entries;

// ------------------------------------------------------------------ saving
let chain: Promise<unknown> = Promise.resolve();

/** Apply a change locally, send it to the Sheet, and roll back by reloading if the server refuses. */
function mutate(name: string, note: string | (() => string), fn: (draft: AppState) => void): Promise<void> {
  const run = async () => {
    const draft = structuredClone(snap.state);
    fn(draft); // business-rule errors are thrown here, before anything is sent
    const next = flatten(draft);
    const ops = diff(flat, next);
    if (!ops.length) return;
    flat = next;
    set({ state: nest(flat, stockBase), busy: snap.busy + 1 });
    try {
      const res: Applied = await api.commit(token, name, ops, typeof note === 'function' ? note() : note);
      for (const { table, row } of res.applied) {
        const rows = (flat as any)[table] as any[];
        const i = rows.findIndex(r => r.id === row.id);
        if (i >= 0) rows[i] = row; else rows.push(row);
      }
      for (const { table, id } of res.deleted) (flat as any)[table] = (flat as any)[table].filter((r: any) => r.id !== id);
      lastStamp = res.stamp;
      set({ state: nest(flat, stockBase), busy: snap.busy - 1, syncedAt: Date.now() });
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
const PENDING = (role: string) => 'Pending ' + role;

/** Move a PO into approval using the route from the Roles tab. */
function startApproval(po: PurchaseOrder) {
  po.route = approvalRoute(po);
  po.step = 0;
  if (po.route.length) po.status = PENDING(po.route[0]);
  else { po.status = 'Approved'; po.advanceStatus = po.advanceRequired ? 'Requested' : 'Not Required'; }
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
  /** Create or edit a PO. Prices always come from the vendor's price list. */
  savePO(input: PoInput, submit: boolean): Promise<string> {
    const id = input.id ?? uid();
    const note = (input.id ? 'PO edited' : 'Draft created') + (submit ? ' and submitted for approval' : '');
    return mutate('po.save', note, s => {
      const vendor = vendorOf(s, input.vendorId);
      if (!vendor) throw new Error('Select a vendor');
      const lines = input.lines.filter(l => l.qty > 0).map(l => {
        const brand = normBrand(l.brand);
        const vi = vendor.items.find(i => sameLine(i, { itemId: l.itemId, brand }));
        if (!vi) throw new Error('This item / brand is not on the vendor\'s price list');
        const old = s.pos.find(p => p.id === id)?.lines.find(x => sameLine(x, { itemId: l.itemId, brand }));
        return { ...(old ?? {}), itemId: l.itemId, brand: vi.brand ? vi.brand : brand, qty: l.qty, price: old ? old.price : vi.price }; // price is not editable
      });
      if (!lines.length) throw new Error('Add at least one item with a quantity');
      if (input.advanceRequired && !(input.advanceAmount > 0)) throw new Error('Enter the advance amount');
      let po = s.pos.find(p => p.id === id);
      if (po) {
        if (po.status !== 'Draft' && po.status !== 'Rejected') throw new Error('This PO can no longer be edited');
        po.lines = lines;
      } else {
        po = {
          id, poNo: '', date: today(), vendorId: input.vendorId, lines, terms: '', advanceRequired: false, advanceAmount: 0,
          expectedDate: input.expectedDate, status: 'Draft', advanceStatus: 'Not Required', route: [], step: 0,
          createdBy: me().name, department: me().department,
        };
        s.pos.push(po);
      }
      po.terms = input.terms;
      po.advanceRequired = input.advanceRequired;
      po.advanceAmount = input.advanceRequired ? input.advanceAmount : 0;
      po.expectedDate = input.expectedDate;
      if (submit) startApproval(po);
    }).then(() => id);
  },

  submitPO: (id: string) => mutate('po.submit', 'Submitted for approval', s => startApproval(findPO(s, id))),

  approve: (id: string, remark: string) => mutate('po.approve', 'Approved' + (remark ? ` – ${remark}` : ''), s => {
    const po = findPO(s, id);
    if (po.status !== PENDING(me().role)) throw new Error('This PO is not waiting for your approval');
    po.step += 1;
    po.status = po.step < po.route.length ? PENDING(po.route[po.step]) : 'Approved';
    if (po.status === 'Approved') po.advanceStatus = po.advanceRequired ? 'Requested' : 'Not Required';
  }),

  reject: (id: string, remark: string) => mutate('po.reject', 'Not approved' + (remark ? ` – ${remark}` : ''), s => {
    const po = findPO(s, id);
    if (po.status !== PENDING(me().role)) throw new Error('This PO is not waiting for your approval');
    po.status = 'Rejected';
  }),

  payAdvance: (id: string, amount: number, date: string, fully: boolean, screenshot?: string) =>
    mutate('advance.pay', `${fully ? 'Fully Paid' : 'Advance Paid'}: ${amount}`, s => {
      const po = findPO(s, id);
      if (po.advanceStatus !== 'Requested') throw new Error('No advance is pending for this PO');
      if (!(amount > 0)) throw new Error('Enter the amount paid');
      s.payments.push({ id: uid(), poId: id, kind: 'advance', amount: round2(amount), date, screenshot });
      po.advanceStatus = fully ? 'Fully Paid' : 'Advance Paid';
    }),

  sendToVendor: (id: string, via: 'Email' | 'WhatsApp', poFile?: string) => mutate('po.send', `Sent to vendor via ${via}`, s => {
    const po = findPO(s, id);
    const v = vendorOf(s, po.vendorId)!;
    if (po.status !== 'Approved') throw new Error('PO is not approved');
    if (po.advanceStatus === 'Requested') throw new Error('Advance has not been paid yet');
    po.status = 'Sent to Vendor';
    po.sentVia = via;
    po.sentTo = via === 'Email' ? v.email : v.whatsapp;
    if (poFile) po.poFile = poFile;
  }),

  /** Goods receipt = stock in. PO quantity edits are honoured only when the invoice does not match the PO. */
  createReceipt: (input: {
    poId: string; invoiceNo: string; invoiceDate: string; receivedDate: string; invoiceTotal: number; invoiceFile?: string;
    lines: { itemId: string; brand: string; qty: number; taxRate: number; poQty?: number }[];
  }) => {
    let note = `Goods received, invoice ${input.invoiceNo.trim()}`;
    return mutate('receipt.create', () => note, s => {
      const po = findPO(s, input.poId);
      if (po.status === 'Approved') { // goods arrived before Purchase marked it sent: receiving counts as sent
        po.status = 'Sent to Vendor'; po.sentVia = 'Received directly'; po.sentTo = 'Factory';
        note += ' (PO was not marked as sent – received directly)';
      } else if (po.status !== 'Sent to Vendor') throw new Error('PO is not approved yet');
      const invNo = input.invoiceNo.trim();
      if (!invNo) throw new Error('Enter the invoice number');
      if (s.receipts.some(r => r.type === 'Invoice' && r.invoiceNo.toLowerCase() === invNo.toLowerCase() && r.vendorId === po.vendorId)) {
        throw new Error('This invoice number is already booked for this vendor');
      }
      const picked = input.lines.filter(l => l.qty > 0);
      if (!picked.length) throw new Error('Select the items received');
      const lines: ReceiptLine[] = [];
      for (const l of picked) {
        const pl = po.lines.find(x => sameLine(x, l));
        if (!pl) throw new Error('This item / brand is not on the PO');
        if (l.poQty !== undefined && l.poQty !== pl.qty) {
          note += `; PO quantity of ${lineName(s, pl)} changed ${pl.qty} → ${l.poQty} (invoice mismatch)`;
          pl.qty = l.poQty;
        }
        if (l.qty > pl.qty - receivedQty(s, po.id, l.itemId, pl.brand) + 1e-9) throw new Error('Received quantity is more than the pending PO quantity');
        lines.push({ itemId: l.itemId, brand: pl.brand, qty: l.qty, price: pl.price, taxRate: l.taxRate });
      }
      const t = computeReceipt(lines);
      if (Math.abs(t.grandTotal - input.invoiceTotal) > cfg.tolerance) throw new Error('Grand total does not match the invoice total');
      const adjusted = Math.min(t.grandTotal, advanceAvailable(s, po.id));
      s.receipts.push({
        id: uid(), grnNo: '', type: 'Invoice', poId: po.id, vendorId: po.vendorId, invoiceNo: invNo, invoiceDate: input.invoiceDate,
        receivedDate: input.receivedDate, lines, ...t, advanceAdjusted: round2(adjusted), payable: round2(t.grandTotal - adjusted),
        dueDate: dueDateFor(vendorOf(s, po.vendorId), input.invoiceDate), accepted: false, acceptedDate: '',
        invoiceFile: input.invoiceFile ?? '', createdBy: me().name,
      });
    });
  },

  acceptInvoice: (receiptId: string) => mutate('invoice.accept', 'Invoice accepted', s => {
    const r = s.receipts.find(x => x.id === receiptId)!;
    r.accepted = true;
    r.acceptedDate = today();
  }),

  payInvoice: (receiptId: string, amount: number, date: string, screenshot?: string) =>
    mutate('payment.make', `Paid ${amount} against invoice`, s => {
      const r = s.receipts.find(x => x.id === receiptId)!;
      if (!r.accepted) throw new Error('Accept the invoice before paying');
      if (!(amount > 0) || amount > receiptBalance(s, r) + 0.005) throw new Error('Amount must be between 0 and the balance');
      s.payments.push({ id: uid(), poId: r.poId, receiptId, kind: 'invoice', amount: round2(amount), date, screenshot });
    }),

  /** An old pending balance (bill from before the app) - payable like any invoice. */
  addOpening: (vendorId: string, ref: string, amount: number, dueDate: string) => mutate('opening.add', () => 'Old balance added', s => {
    if (!vendorOf(s, vendorId)) throw new Error('Select a vendor');
    if (!ref.trim()) throw new Error('Enter a reference');
    if (!(amount > 0)) throw new Error('Enter the amount');
    s.receipts.push({
      id: uid(), grnNo: '', type: 'Opening', poId: '', vendorId, invoiceNo: ref.trim(), invoiceDate: today(), receivedDate: today(), lines: [],
      subtotal: amount, taxTotal: 0, grandTotal: amount, advanceAdjusted: 0, payable: amount, dueDate, accepted: true, acceptedDate: today(), createdBy: me().name,
    });
  }),

  // ---- stock out / adjustments
  issueStock: (itemId: string, brand: string, qty: number, toDept: string, note: string, date: string) => mutate('stock.issue', `Issued ${qty} to ${toDept}`, s => {
    const item = itemOf(s, itemId);
    if (!item) throw new Error('Select an item');
    if (!(qty > 0)) throw new Error('Enter the quantity');
    if (!toDept.trim()) throw new Error('Enter who the stock is issued to (department / purpose)');
    const have = stockOnHand(s, itemId, brand);
    if (qty > have) throw new Error(`Only ${have} ${item.unit} of ${lineName(s, { itemId, brand })} in stock`);
    s.stock.push({ id: uid(), date, itemId, brand: normBrand(brand), type: 'OUT', qty, toDept: toDept.trim(), note: note.trim() });
  }),
  adjustStock: (itemId: string, brand: string, qty: number, note: string, date: string) => mutate('stock.adjust', `Stock adjusted by ${qty}`, s => {
    if (!itemOf(s, itemId)) throw new Error('Select an item');
    if (!qty) throw new Error('Enter the quantity (use a minus sign to reduce stock)');
    if (!note.trim()) throw new Error('Give a reason for the adjustment');
    s.stock.push({ id: uid(), date, itemId, brand: normBrand(brand), type: 'ADJUST', qty, toDept: '', note: note.trim() });
  }),

  // ---- price queries (on PO lines)
  raiseQuery: (poId: string, line0: { itemId: string; brand: string }, noteText: string) => mutate('query.raise', 'Price query raised to Admin: ' + noteText, s => {
    const line = findPO(s, poId).lines.find(l => sameLine(l, line0));
    if (!line) throw new Error('Item is not on this PO');
    line.queryNote = noteText;
    line.queryStatus = 'Open';
  }),
  resolveQuery: (poId: string, line0: { itemId: string; brand: string }) => mutate('master.manage', 'Price query resolved by Admin', s => {
    const line = findPO(s, poId).lines.find(l => sameLine(l, line0));
    if (line) line.queryStatus = 'Resolved';
  }),

  // ---- Master data (Admin)
  saveItem: (it: Partial<Item> & { name: string }) => mutate('master.manage', '', s => {
    if (!it.name.trim()) throw new Error('Enter the item name');
    if (s.items.some(x => x.id !== it.id && x.name.trim().toLowerCase() === it.name.trim().toLowerCase())) throw new Error('An item with this name already exists');
    if (it.id) Object.assign(s.items.find(x => x.id === it.id)!, it);
    else s.items.push({ id: uid(), name: it.name.trim(), unit: it.unit || 'pcs', category: it.category || '', minStock: it.minStock || 0, active: true });
  }),
  saveVendor: (v: Omit<Vendor, 'id'> & { id?: string }) => mutate('master.manage', '', s => {
    if (!v.name.trim()) throw new Error('Enter the vendor name');
    if (v.id) {
      const cur = s.vendors.find(x => x.id === v.id)!;
      const items = v.items.map(i => ({ ...(cur.items.find(c => sameLine(c, i)) ?? {}), itemId: i.itemId, brand: normBrand(i.brand), price: i.price })); // keep row versions
      Object.assign(cur, v, { items });
    } else s.vendors.push({ ...v, id: uid() } as Vendor);
  }),
  /** Set (or with undefined, remove) one vendor's price for one item in one brand. */
  setPrice: (vendorId: string, itemId: string, brand: string, price: number | undefined) => mutate('master.manage', '', s => {
    const v = vendorOf(s, vendorId);
    if (!v) throw new Error('Unknown vendor');
    const b = normBrand(brand);
    if (price === undefined) { v.items = v.items.filter(i => !sameLine(i, { itemId, brand: b })); return; }
    if (!(price >= 0)) throw new Error('Enter a valid price');
    const cur = v.items.find(i => sameLine(i, { itemId, brand: b }));
    if (cur) cur.price = price; else v.items.push({ itemId, brand: b, price });
  }),
};

export const poTotal = poValue;
