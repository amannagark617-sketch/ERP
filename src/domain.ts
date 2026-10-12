import { AppState, PurchaseOrder, Receipt, Vendor, Item, Payment } from './types';
import { round2, today } from './utils';
import { cfg } from './config';
import { routeFor } from './shared/approval';

export const poValue = (po: PurchaseOrder) => round2(po.lines.reduce((s, l) => s + l.qty * l.price, 0));
/** Approvers needed for this PO value, from the Roles tab ("Approves POs above Rs"). */
export const approvalRoute = (po: { lines: { qty: number; price: number }[] }) =>
  routeFor(cfg.approvers, round2(po.lines.reduce((s, l) => s + l.qty * l.price, 0)));

export const vendorOf = (s: AppState, id: string): Vendor | undefined => s.vendors.find(v => v.id === id);
export const itemOf = (s: AppState, id: string): Item | undefined => s.items.find(i => i.id === id);
export const itemName = (s: AppState, id: string) => itemOf(s, id)?.name ?? id;
export const poOf = (s: AppState, id: string) => s.pos.find(p => p.id === id);

// ---------------------------------------------------------------- receipts, payments
export const invoicesOf = (s: AppState, poId: string) => s.receipts.filter(r => r.poId === poId);
export const receiptsOf = invoicesOf;
export const receivedQty = (s: AppState, poId: string, itemId: string) =>
  invoicesOf(s, poId).reduce((q, r) => q + r.lines.filter(l => l.itemId === itemId).reduce((a, l) => a + l.qty, 0), 0);
export const pendingQty = (s: AppState, po: PurchaseOrder, itemId: string) => {
  const line = po.lines.find(l => l.itemId === itemId);
  return Math.max(0, (line?.qty ?? 0) - receivedQty(s, po.id, itemId));
};
export const totalPending = (s: AppState, po: PurchaseOrder) => po.lines.reduce((a, l) => a + pendingQty(s, po, l.itemId), 0);

export const receivedValue = (s: AppState, poId: string) => round2(invoicesOf(s, poId).reduce((a, r) => a + r.grandTotal, 0));
const sum = (ps: Payment[]) => round2(ps.reduce((a, p) => a + p.amount, 0));
export const advancePaid = (s: AppState, poId: string) => sum(s.payments.filter(p => p.poId === poId && p.kind === 'advance'));
export const paidTotal = (s: AppState, poId: string) => sum(s.payments.filter(p => p.poId === poId));
export const advanceAdjusted = (s: AppState, poId: string) => round2(invoicesOf(s, poId).reduce((a, r) => a + r.advanceAdjusted, 0));
/** Received value (per invoices) less everything already paid. */
export const outstanding = (s: AppState, poId: string) => Math.max(0, round2(receivedValue(s, poId) - paidTotal(s, poId)));
/** Advance still available to deduct from the next invoice of this PO. */
export const advanceAvailable = (s: AppState, poId: string) => Math.max(0, round2(advancePaid(s, poId) - advanceAdjusted(s, poId)));

export const isOpenPO = (s: AppState, po: PurchaseOrder) => po.status === 'Sent to Vendor' && totalPending(s, po) > 0;
export const isDelayed = (s: AppState, po: PurchaseOrder) => isOpenPO(s, po) && po.expectedDate < today();

export const receiptPaid = (s: AppState, r: Receipt) => sum(s.payments.filter(p => p.receiptId === r.id));
export const receiptBalance = (s: AppState, r: Receipt) => Math.max(0, round2(r.payable - receiptPaid(s, r)));
/** Due date for a new invoice: invoice date + vendor payment terms (MSME vendors capped by the Settings tab). */
export function dueDateFor(v: Vendor | undefined, invoiceDate: string): string {
  const days = v ? (v.msme ? Math.min(v.paymentTermsDays, cfg.msmeMaxDays) : v.paymentTermsDays) : 0;
  const d = new Date(invoiceDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** What a PO looks like to users, combining workflow status with receipt progress. */
export function displayStatus(s: AppState, po: PurchaseOrder): string {
  if (po.status !== 'Sent to Vendor') return po.status;
  const pend = totalPending(s, po);
  const received = po.lines.some(l => receivedQty(s, po.id, l.itemId) > 0);
  if (pend === 0) {
    const open = invoicesOf(s, po.id).some(r => !r.accepted || receiptBalance(s, r) > 0);
    return open ? 'Received – payment open' : 'Closed';
  }
  return received ? 'Partially Received' : 'Sent to Vendor';
}

export function computeReceipt(lines: { qty: number; price: number; taxRate: number }[]) {
  const subtotal = round2(lines.reduce((a, l) => a + l.qty * l.price, 0));
  const taxTotal = round2(lines.reduce((a, l) => a + (l.qty * l.price * l.taxRate) / 100, 0));
  return { subtotal, taxTotal, grandTotal: round2(subtotal + taxTotal) };
}

// ---------------------------------------------------------------- stock
/** Stock on hand = older records (base) + receipts (IN) - issues (OUT) +/- adjustments. */
export function stockOnHand(s: AppState, itemId: string): number {
  const ins = s.receipts.reduce((a, r) => a + r.lines.filter(l => l.itemId === itemId).reduce((b, l) => b + l.qty, 0), 0);
  const moves = s.stock.filter(m => m.itemId === itemId).reduce((a, m) => a + (m.type === 'OUT' ? -m.qty : m.qty), 0);
  return round2((s.stockBase[itemId] || 0) + ins + moves);
}
export const isLowStock = (s: AppState, item: Item) => item.minStock > 0 && stockOnHand(s, item.id) <= item.minStock;

/** All movements (receipts, issues, adjustments) newest first, for the stock log. */
export function ledger(s: AppState) {
  const rows: { key: string; date: string; itemId: string; type: 'IN' | 'OUT' | 'ADJUST'; qty: number; ref: string; note: string; by: string }[] = [];
  s.receipts.forEach(r => r.lines.forEach(l => rows.push({
    key: `${r.id}:${l.itemId}`, date: r.receivedDate, itemId: l.itemId, type: 'IN', qty: l.qty,
    ref: `${r.grnNo || 'GRN'} · ${poOf(s, r.poId)?.poNo ?? ''} · ${r.invoiceNo}`, note: vendorOf(s, r.vendorId)?.name ?? '', by: r.createdBy,
  })));
  s.stock.forEach(m => rows.push({ key: m.id, date: m.date, itemId: m.itemId, type: m.type, qty: m.qty, ref: m.type === 'OUT' ? m.toDept : 'Adjustment', note: m.note, by: m.by ?? '' }));
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

// ---------------------------------------------------------------- prices
/** Every vendor that supplies an item, cheapest first. */
export function offersFor(s: AppState, itemId: string) {
  return s.vendors.filter(v => v.active).flatMap(v => v.items.filter(i => i.itemId === itemId).map(i => ({ vendor: v, price: i.price })))
    .sort((a, b) => a.price - b.price);
}
