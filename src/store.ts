import { useSyncExternalStore } from 'react';
import {
  AppState, PoLine, PurchaseOrder, ReceiptLine, Role, TaxRate, Vendor,
} from './types';
import { seedState } from './seed';
import { advanceAvailable, computeReceipt, needsCA, poValue, receiptBalance, receivedQty, vendorOf } from './domain';
import { round2, today, uid } from './utils';

const KEY = 'littlenap-erp-v1';
const ROLE_KEY = 'littlenap-erp-role';

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch { /* fall through to seed */ }
  return seedState();
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveError = '';

function commit(next: AppState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    saveError = '';
  } catch {
    saveError = 'Browser storage is full – attached screenshots may not be saved.';
  }
  listeners.forEach(l => l());
}

function update(fn: (draft: AppState) => void) {
  const draft = structuredClone(state);
  fn(draft);
  commit(draft);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useStore = () => useSyncExternalStore(subscribe, () => state);
export const getStorageError = () => saveError;

let role: Role = (localStorage.getItem(ROLE_KEY) as Role) || 'Purchase';
const roleListeners = new Set<() => void>();
export const useRole = () =>
  useSyncExternalStore(l => { roleListeners.add(l); return () => { roleListeners.delete(l); }; }, () => role);
export function setRole(r: Role) {
  role = r;
  try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignore */ }
  roleListeners.forEach(l => l());
}

const log = (po: PurchaseOrder, by: string, text: string) => po.history.push({ date: today(), by, text });
const findPO = (s: AppState, id: string) => {
  const po = s.pos.find(p => p.id === id);
  if (!po) throw new Error('PO not found');
  return po;
};

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
  reset() { commit(seedState()); },

  /** Create or edit a PO (Purchase). Prices always come from the vendor master. */
  savePO(input: PoInput, submit: boolean): string {
    let id = input.id ?? '';
    update(s => {
      const vendor = vendorOf(s, input.vendorId);
      if (!vendor) throw new Error('Select a vendor');
      const lines = input.lines
        .filter(l => l.qty > 0)
        .map(l => {
          const vi = vendor.items.find(i => i.itemId === l.itemId);
          if (!vi) throw new Error('Item is not on this vendor\'s list');
          return { itemId: l.itemId, qty: l.qty, price: vi.price }; // price is not editable here
        });
      if (!lines.length) throw new Error('Add at least one item with a quantity');
      if (input.advanceRequired && !(input.advanceAmount > 0)) throw new Error('Enter the advance amount');
      let po: PurchaseOrder;
      if (input.id) {
        po = findPO(s, input.id);
        if (po.status !== 'Draft' && po.status !== 'Rejected') throw new Error('This PO can no longer be edited');
        po.lines = lines;
        log(po, 'Navneet', 'PO edited');
      } else {
        s.seq.po += 1;
        id = uid();
        po = {
          id, poNo: 'PO-' + String(s.seq.po).padStart(4, '0'), date: today(), vendorId: input.vendorId, lines,
          terms: '', advanceRequired: false, advanceAmount: 0, expectedDate: input.expectedDate,
          status: 'Draft', advanceStatus: 'Not Required', history: [],
        };
        log(po, 'Navneet', 'Draft created');
        s.pos.push(po);
      }
      po.terms = input.terms;
      po.advanceRequired = input.advanceRequired;
      po.advanceAmount = input.advanceRequired ? input.advanceAmount : 0;
      po.expectedDate = input.expectedDate;
      if (po.advanceAmount > poValue(po) * 1.4) throw new Error('Advance is too high for this PO value');
      if (submit) {
        po.status = 'Pending Factory Head';
        log(po, 'Navneet', 'Submitted for approval');
      }
    });
    return id;
  },

  submitPO(id: string) {
    update(s => {
      const po = findPO(s, id);
      po.status = 'Pending Factory Head';
      log(po, 'Navneet', 'Submitted for approval');
    });
  },

  approve(id: string, by: Role, remark: string) {
    update(s => {
      const po = findPO(s, id);
      if (by === 'Factory Head' && po.status === 'Pending Factory Head') {
        po.status = needsCA(po) ? 'Pending CA' : 'Approved';
      } else if (by === 'CA' && po.status === 'Pending CA') {
        po.status = 'Approved';
      } else throw new Error('This PO is not waiting for your approval');
      log(po, by, 'Approved' + (remark ? ` – ${remark}` : ''));
      if (po.status === 'Approved') {
        po.advanceStatus = po.advanceRequired ? 'Requested' : 'Not Required';
        if (po.advanceRequired) log(po, 'System', 'Advance request sent to Accounts');
      }
    });
  },

  reject(id: string, by: Role, remark: string) {
    update(s => {
      const po = findPO(s, id);
      po.status = 'Rejected';
      log(po, by, 'Not approved' + (remark ? ` – ${remark}` : ''));
    });
  },

  payAdvance(id: string, amount: number, date: string, fully: boolean, screenshot?: string) {
    update(s => {
      const po = findPO(s, id);
      if (po.advanceStatus !== 'Requested') throw new Error('No advance is pending for this PO');
      if (!(amount > 0)) throw new Error('Enter the amount paid');
      s.payments.push({ id: uid(), poId: id, kind: 'advance', amount: round2(amount), date, screenshot });
      po.advanceStatus = fully ? 'Fully Paid' : 'Advance Paid';
      log(po, 'Accounts', `${po.advanceStatus}: ${amount}`);
    });
  },

  sendToVendor(id: string, via: 'Email' | 'WhatsApp') {
    update(s => {
      const po = findPO(s, id);
      const v = vendorOf(s, po.vendorId)!;
      if (po.status !== 'Approved') throw new Error('PO is not approved');
      if (po.advanceStatus === 'Requested') throw new Error('Advance has not been paid yet');
      po.status = 'Sent to Vendor';
      po.sentVia = via;
      po.sentTo = via === 'Email' ? v.email : v.whatsapp;
      log(po, 'Navneet', `Sent to vendor via ${via} (${po.sentTo})`);
    });
  },

  /** Goods receipt (Inventory). poQty edits are only honoured when the invoice does not match the PO. */
  createReceipt(input: {
    poId: string; invoiceNo: string; invoiceDate: string; receivedDate: string; invoiceTotal: number;
    lines: { itemId: string; qty: number; taxRate: TaxRate; poQty?: number }[];
  }) {
    update(s => {
      const po = findPO(s, input.poId);
      if (po.status !== 'Sent to Vendor') throw new Error('PO has not been sent to the vendor');
      if (!input.invoiceNo.trim()) throw new Error('Enter the invoice number');
      if (s.receipts.some(r => r.invoiceNo.trim().toLowerCase() === input.invoiceNo.trim().toLowerCase()
        && vendorOf(s, findPO(s, r.poId).vendorId)?.id === po.vendorId)) {
        throw new Error('This invoice number is already booked for this vendor');
      }
      const picked = input.lines.filter(l => l.qty > 0);
      if (!picked.length) throw new Error('Select the items received');
      const lines: ReceiptLine[] = [];
      for (const l of picked) {
        const pl = po.lines.find(x => x.itemId === l.itemId);
        if (!pl) throw new Error('Item is not on this PO');
        if (l.poQty !== undefined && l.poQty !== pl.qty) {
          log(po, 'Inventory', `PO quantity changed ${pl.qty} → ${l.poQty} (invoice mismatch)`);
          pl.qty = l.poQty;
        }
        if (l.qty > pl.qty - receivedQty(s, po.id, l.itemId) + 1e-9) throw new Error('Received quantity is more than the pending PO quantity');
        lines.push({ itemId: l.itemId, qty: l.qty, price: pl.price, taxRate: l.taxRate });
      }
      const t = computeReceipt(lines);
      if (Math.abs(t.grandTotal - input.invoiceTotal) > 1) throw new Error('Grand total does not match the invoice total');
      const adjusted = Math.min(t.grandTotal, advanceAvailable(s, po.id));
      s.seq.grn += 1;
      const r = {
        id: uid(), grnNo: 'GRN-' + String(s.seq.grn).padStart(4, '0'), poId: po.id, invoiceNo: input.invoiceNo.trim(),
        invoiceDate: input.invoiceDate, receivedDate: input.receivedDate, lines, ...t,
        advanceAdjusted: round2(adjusted), payable: round2(t.grandTotal - adjusted), accepted: false,
      };
      s.receipts.push(r);
      log(po, 'Inventory', `Goods received (${r.grnNo}), invoice ${r.invoiceNo}`);
    });
  },

  acceptInvoice(receiptId: string) {
    update(s => {
      const r = s.receipts.find(x => x.id === receiptId)!;
      r.accepted = true;
      r.acceptedDate = today();
      log(findPO(s, r.poId), 'Accounts', `Invoice ${r.invoiceNo} accepted`);
    });
  },

  payInvoice(receiptId: string, amount: number, date: string, screenshot?: string) {
    update(s => {
      const r = s.receipts.find(x => x.id === receiptId)!;
      if (!r.accepted) throw new Error('Accept the invoice before paying');
      if (!(amount > 0) || amount > receiptBalance(s, r) + 0.005) throw new Error('Amount must be between 0 and the balance');
      s.payments.push({ id: uid(), poId: r.poId, receiptId, kind: 'invoice', amount: round2(amount), date, screenshot });
      log(findPO(s, r.poId), 'Accounts', `Paid ${amount} against invoice ${r.invoiceNo}`);
    });
  },

  addOpening(vendorId: string, ref: string, amount: number, dueDate: string) {
    update(s => { s.openings.push({ id: uid(), vendorId, ref, amount, dueDate }); });
  },

  payOpening(openingId: string, amount: number, date: string, screenshot?: string) {
    update(s => {
      s.payments.push({ id: uid(), openingId, kind: 'opening', amount: round2(amount), date, screenshot });
    });
  },

  raiseQuery(poId: string, itemId: string, note: string, by: string) {
    update(s => { s.queries.push({ id: uid(), poId, itemId, note, raisedBy: by, date: today(), status: 'Open' }); });
  },
  resolveQuery(id: string) {
    update(s => { s.queries.find(q => q.id === id)!.status = 'Resolved'; });
  },

  // ---- Backend / HO master data ----
  addItem(name: string, unit: string) {
    update(s => { s.items.push({ id: uid(), name, unit }); });
  },
  saveVendor(v: Omit<Vendor, 'id'> & { id?: string }) {
    update(s => {
      if (v.id) Object.assign(s.vendors.find(x => x.id === v.id)!, v);
      else s.vendors.push({ ...v, id: uid() } as Vendor);
    });
  },
};
