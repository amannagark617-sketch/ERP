import { AppState, PurchaseOrder, Receipt, Vendor, Item } from './types';
import { addDays, round2, today } from './utils';

export const CA_LIMIT = 1_000_000; // Rs 10 Lac: POs above this also need CA approval
export const MSME_MAX_DAYS = 45;

export const poValue = (po: PurchaseOrder) => round2(po.lines.reduce((s, l) => s + l.qty * l.price, 0));
export const needsCA = (po: PurchaseOrder) => poValue(po) > CA_LIMIT;

export const vendorOf = (s: AppState, id: string): Vendor | undefined => s.vendors.find(v => v.id === id);
export const itemOf = (s: AppState, id: string): Item | undefined => s.items.find(i => i.id === id);
export const itemName = (s: AppState, id: string) => itemOf(s, id)?.name ?? id;

export const receiptsOf = (s: AppState, poId: string) => s.receipts.filter(r => r.poId === poId);
export const receivedQty = (s: AppState, poId: string, itemId: string) =>
  receiptsOf(s, poId).reduce((q, r) => q + r.lines.filter(l => l.itemId === itemId).reduce((a, l) => a + l.qty, 0), 0);
export const pendingQty = (s: AppState, po: PurchaseOrder, itemId: string) => {
  const line = po.lines.find(l => l.itemId === itemId);
  return Math.max(0, (line?.qty ?? 0) - receivedQty(s, po.id, itemId));
};
export const totalPending = (s: AppState, po: PurchaseOrder) => po.lines.reduce((a, l) => a + pendingQty(s, po, l.itemId), 0);

export const receivedValue = (s: AppState, poId: string) => round2(receiptsOf(s, poId).reduce((a, r) => a + r.grandTotal, 0));
export const advancePaid = (s: AppState, poId: string) =>
  round2(s.payments.filter(p => p.poId === poId && p.kind === 'advance').reduce((a, p) => a + p.amount, 0));
export const paidTotal = (s: AppState, poId: string) =>
  round2(s.payments.filter(p => p.poId === poId).reduce((a, p) => a + p.amount, 0));
export const advanceAdjusted = (s: AppState, poId: string) =>
  round2(receiptsOf(s, poId).reduce((a, r) => a + r.advanceAdjusted, 0));
/** Received value (per invoices) less everything already paid. */
export const outstanding = (s: AppState, poId: string) => Math.max(0, round2(receivedValue(s, poId) - paidTotal(s, poId)));

export const isOpenPO = (s: AppState, po: PurchaseOrder) => po.status === 'Sent to Vendor' && totalPending(s, po) > 0;
export const isDelayed = (s: AppState, po: PurchaseOrder) => isOpenPO(s, po) && po.expectedDate < today();

export const receiptPaid = (s: AppState, r: Receipt) =>
  round2(s.payments.filter(p => p.receiptId === r.id).reduce((a, p) => a + p.amount, 0));
export const receiptBalance = (s: AppState, r: Receipt) => Math.max(0, round2(r.payable - receiptPaid(s, r)));
export const receiptDue = (s: AppState, r: Receipt) => {
  const po = s.pos.find(p => p.id === r.poId);
  const v = po && vendorOf(s, po.vendorId);
  const days = v ? (v.msme ? Math.min(v.paymentTermsDays, MSME_MAX_DAYS) : v.paymentTermsDays) : 0;
  return addDays(r.invoiceDate, days);
};

export const openingPaid = (s: AppState, id: string) =>
  round2(s.payments.filter(p => p.openingId === id).reduce((a, p) => a + p.amount, 0));

/** What a PO looks like to users, combining workflow status with receipt progress. */
export function displayStatus(s: AppState, po: PurchaseOrder): string {
  if (po.status !== 'Sent to Vendor') return po.status;
  const pend = totalPending(s, po);
  const received = po.lines.some(l => receivedQty(s, po.id, l.itemId) > 0);
  if (pend === 0) {
    const open = receiptsOf(s, po.id).some(r => !r.accepted || receiptBalance(s, r) > 0);
    return open ? 'Received – payment open' : 'Closed';
  }
  return received ? 'Partially Received' : 'Sent to Vendor';
}

export function computeReceipt(lines: { qty: number; price: number; taxRate: number }[]) {
  const subtotal = round2(lines.reduce((a, l) => a + l.qty * l.price, 0));
  const taxTotal = round2(lines.reduce((a, l) => a + (l.qty * l.price * l.taxRate) / 100, 0));
  return { subtotal, taxTotal, grandTotal: round2(subtotal + taxTotal) };
}

/** Advance still available to deduct from the next invoice of this PO. */
export const advanceAvailable = (s: AppState, poId: string) =>
  Math.max(0, round2(advancePaid(s, poId) - advanceAdjusted(s, poId)));
