import { AppState, PurchaseOrder, Receipt, Vendor, Item, Payment } from './types';
import { round2, today } from './utils';
import { cfg } from './config';
import { routeFor } from './shared/approval';
import { normBrand, sameBrand, stockKey } from './shared/keys';

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
/** A PO line is an item in one brand. */
export const sameLine = (a: { itemId: string; brand?: string }, b: { itemId: string; brand?: string }) => a.itemId === b.itemId && sameBrand(a.brand, b.brand);
export const receivedQty = (s: AppState, poId: string, itemId: string, brand?: string) =>
  invoicesOf(s, poId).reduce((q, r) => q + r.lines.filter(l => sameLine(l, { itemId, brand })).reduce((a, l) => a + l.qty, 0), 0);
export const pendingQty = (s: AppState, po: PurchaseOrder, line: { itemId: string; brand?: string }) => {
  const l = po.lines.find(x => sameLine(x, line));
  return Math.max(0, (l?.qty ?? 0) - receivedQty(s, po.id, line.itemId, line.brand));
};
export const totalPending = (s: AppState, po: PurchaseOrder) => po.lines.reduce((a, l) => a + pendingQty(s, po, l), 0);
/** "Foam sheet 40D (Kurlon)" */
export const lineName = (s: AppState, l: { itemId: string; brand?: string }) => itemName(s, l.itemId) + (normBrand(l.brand) ? ` (${normBrand(l.brand)})` : '');

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
  const received = po.lines.some(l => receivedQty(s, po.id, l.itemId, l.brand) > 0);
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
/** Stock on hand of an item. With a brand: that brand only. Without: the total of all brands. */
export function stockOnHand(s: AppState, itemId: string, brand?: string): number {
  const match = (l: { itemId: string; brand?: string }) => l.itemId === itemId && (brand === undefined || sameBrand(l.brand, brand));
  const base = Object.entries(s.stockBase).filter(([k]) => (brand === undefined ? k.startsWith(itemId + '|') : k === stockKey(itemId, brand))).reduce((a, [, v]) => a + v, 0);
  const ins = s.receipts.reduce((a, r) => a + r.lines.filter(match).reduce((b, l) => b + l.qty, 0), 0);
  const moves = s.stock.filter(match).reduce((a, m) => a + (m.type === 'OUT' ? -m.qty : m.qty), 0);
  return round2(base + ins + moves);
}
export const isLowStock = (s: AppState, item: Item) => item.minStock > 0 && stockOnHand(s, item.id) <= item.minStock;

/** Every brand an item has stock history in (blank brand = '' when unbranded stock exists), with proper capitalisation. */
export function brandsInStock(s: AppState, itemId: string): string[] {
  // Proper spelling: from anything that carries the brand as typed (price lists, PO lines, receipts, movements)
  const proper = new Map<string, string>();
  const note = (b?: string) => { const n = normBrand(b); if (n && !proper.has(n.toLowerCase())) proper.set(n.toLowerCase(), n); };
  s.vendors.forEach(v => v.items.forEach(i => { if (i.itemId === itemId) note(i.brand); }));
  s.pos.forEach(p => p.lines.forEach(l => { if (l.itemId === itemId) note(l.brand); }));
  s.receipts.forEach(r => r.lines.forEach(l => { if (l.itemId === itemId) note(l.brand); }));
  s.stock.forEach(m => { if (m.itemId === itemId) note(m.brand); });
  const keys = new Set<string>();
  Object.keys(s.stockBase).forEach(k => { if (k.startsWith(itemId + '|')) keys.add(k.slice(itemId.length + 1)); });
  s.receipts.forEach(r => r.lines.forEach(l => { if (l.itemId === itemId) keys.add(normBrand(l.brand).toLowerCase()); }));
  s.stock.forEach(m => { if (m.itemId === itemId) keys.add(normBrand(m.brand).toLowerCase()); });
  return [...keys].map(k => proper.get(k) ?? k).sort((x, y) => x.localeCompare(y));
}

/** Brands the vendors list for an item (for suggestions when typing a brand). */
export const knownBrands = (s: AppState, itemId?: string): string[] =>
  [...new Set(s.vendors.flatMap(v => v.items.filter(i => !itemId || i.itemId === itemId).map(i => normBrand(i.brand))).filter(Boolean))].sort();

/** All movements (receipts, issues, adjustments) newest first, for the stock log. */
export function ledger(s: AppState) {
  const rows: { key: string; date: string; itemId: string; brand: string; type: 'IN' | 'OUT' | 'ADJUST'; qty: number; ref: string; note: string; by: string }[] = [];
  s.receipts.forEach(r => r.lines.forEach(l => rows.push({
    key: `${r.id}:${l.itemId}:${normBrand(l.brand)}`, date: r.receivedDate, itemId: l.itemId, brand: l.brand, type: 'IN', qty: l.qty,
    ref: `${r.grnNo || 'GRN'} · ${poOf(s, r.poId)?.poNo ?? ''} · ${r.invoiceNo}`, note: vendorOf(s, r.vendorId)?.name ?? '', by: r.createdBy,
  })));
  s.stock.forEach(m => rows.push({ key: m.id, date: m.date, itemId: m.itemId, brand: m.brand, type: m.type, qty: m.qty, ref: m.type === 'OUT' ? m.toDept : 'Adjustment', note: m.note, by: m.by ?? '' }));
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

// ---------------------------------------------------------------- prices
/** Every vendor offer for an item (each brand separately), cheapest first. */
export function offersFor(s: AppState, itemId: string) {
  return s.vendors.filter(v => v.active).flatMap(v => v.items.filter(i => i.itemId === itemId).map(i => ({ vendor: v, brand: normBrand(i.brand), price: i.price })))
    .sort((a, b) => a.price - b.price);
}
/** The cheapest offer of each brand (the fair comparison: same item, same brand). */
export function cheapestPerBrand(offers: ReturnType<typeof offersFor>) {
  const best = new Map<string, (typeof offers)[number]>();
  offers.forEach(o => { const k = o.brand.toLowerCase(); if (!best.has(k)) best.set(k, o); });
  return best;
}
