// Optional SAMPLE DATA so a new owner can see what a working system looks like.
// Loaded only when someone runs loadSampleData() in Apps Script; removed by clearAllDataBeforeGoingLive().
import { TableKey } from './schema';

type Rows = Partial<Record<TableKey, any[]>>;

export const SAMPLE_PASSWORD = 'Demo@1234';
export const SAMPLE_USER_PREFIX = 'demo.';

const addDays = (base: string, n: number) => {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function sampleUsers(): any[] {
  const u = (id: string, name: string, role: string, department: string, level: number) =>
    ({ loginId: SAMPLE_USER_PREFIX + id, password: SAMPLE_PASSWORD, name, role, department, level, reportsTo: 'admin', active: true });
  return [
    u('purchase', 'Demo Purchase', 'Purchase', 'Purchase', 2), u('factory', 'Demo Factory Head', 'Factory Head', 'Factory', 3),
    u('accounts', 'Demo Accounts', 'Accounts', 'Accounts', 2), u('store', 'Demo Store', 'Inventory', 'Factory', 1),
  ];
}

export function sampleData(t: string): Rows {
  const D = (n: number) => addDays(t, n);
  const iso = (n: number) => D(n) + 'T10:00:00.000Z';

  // ------------------------------------------------------------ masters
  const itemSpec: [string, string, string, string, number, boolean][] = [
    ['I1', 'Recliner mechanism (manual)', 'pcs', 'Mechanism', 50, true], ['I2', 'Recliner mechanism (motorised)', 'pcs', 'Mechanism', 20, true],
    ['I3', 'Foam sheet 40D', 'sheet', 'Foam', 100, true], ['I4', 'Leatherette fabric', 'm', 'Fabric', 300, true],
    ['I5', 'Wooden frame set', 'set', 'Wood', 40, true], ['I6', 'Packing carton', 'pcs', 'Packing', 100, true],
    ['I7', 'Steel spring set', 'set', 'Hardware', 0, true], ['I8', 'Headrest cushion', 'pcs', 'Foam', 0, true],
    ['I9', 'Velvet fabric', 'm', 'Fabric', 0, true], ['I10', 'Staples box', 'pcs', 'Hardware', 0, true],
    ['I11', 'Adhesive 20L', 'can', 'Consumable', 0, true], ['I12', 'Castor wheel set (old model)', 'set', 'Hardware', 0, false],
  ];
  const iName: Record<string, string> = Object.fromEntries(itemSpec.map(i => [i[0], i[1]]));

  const vendorSpec: [string, string, string, string, string, boolean, string, number, string, string, boolean][] = [
    ['V1', 'Sharma Mechanisms Pvt Ltd', 'Rakesh Sharma', 'Delhi', 'Delhi', true, 'Small', 30, 'HDFC Bank', '50100011112222', true],
    ['V2', 'Foam & Fabric Traders', 'Anita Verma', 'Gurugram', 'Haryana', false, '', 45, 'ICICI Bank', '000405001234', true],
    ['V3', 'Kailash Timber Works', 'Kailash Rao', 'Saharanpur', 'Uttar Pradesh', true, 'Micro', 15, 'SBI', '30000111222', true],
    ['V4', 'Bharat Foam Industries', 'Mohan Lal', 'Panipat', 'Haryana', false, '', 30, 'Axis Bank', '917020012345', true],
    ['V5', 'Royal Leather House', 'Sana Khan', 'Agra', 'Uttar Pradesh', true, 'Medium', 30, 'PNB', '1234002100005678', true],
    ['V6', 'Delhi Hardware Mart', 'Vikas Gupta', 'Delhi', 'Delhi', false, '', 30, 'Kotak Bank', '2345678901', true],
    ['V7', 'Old Supplier (not used now)', 'N/A', 'Jaipur', 'Rajasthan', false, '', 30, '', '', false],
  ];
  const vName: Record<string, string> = Object.fromEntries(vendorSpec.map(v => [v[0], v[1]]));
  const vendorOf = Object.fromEntries(vendorSpec.map(v => [v[0], { msme: v[5], terms: v[7] }]));

  // ONE row per vendor + item: several vendors can sell the same item at different prices
  const priceSpec: [string, string, number][] = [
    ['V1', 'I1', 2400], ['V1', 'I2', 6800],
    ['V2', 'I3', 1850], ['V4', 'I3', 1790], ['V6', 'I3', 1880],
    ['V2', 'I4', 420], ['V5', 'I4', 395],
    ['V3', 'I5', 3200], ['V3', 'I6', 95], ['V6', 'I6', 102],
    ['V6', 'I7', 650], ['V4', 'I8', 310], ['V2', 'I8', 330],
    ['V5', 'I9', 520], ['V2', 'I9', 540], ['V6', 'I10', 180],
    ['V4', 'I11', 2100], ['V6', 'I11', 2250],
  ];
  const price = (v: string, i: string) => priceSpec.find(p => p[0] === v && p[1] === i)![2];

  // ------------------------------------------------------------ purchase orders (numbered in date order)
  interface PoSpec { n: number; vendor: string; date: number; lines: [string, number][]; status: string; route: string[]; step: number; advance: number; advStatus: string; expected: number; sent?: number; terms: string; events: [number, string, string][] }
  const P = 'Demo Purchase', F = 'Demo Factory Head', A = 'Demo Accounts', S = 'Demo Store', H = 'Administrator';
  const pos: PoSpec[] = [
    { n: 1, vendor: 'V6', date: -60, lines: [['I6', 400]], status: 'Sent to Vendor', route: ['Factory Head'], step: 1, advance: 0, advStatus: 'Not Required', expected: -45, sent: -58, terms: 'Delivery at factory gate.',
      events: [[-60, P, 'Draft created and submitted for approval'], [-59, F, 'Approved'], [-58, P, 'Sent to vendor via Email'], [-55, S, 'Goods received, invoice DH-221'], [-53, A, 'Invoice accepted'], [-40, A, 'Paid 48144 against invoice']] },
    { n: 2, vendor: 'V1', date: -48, lines: [['I1', 200]], status: 'Sent to Vendor', route: ['Factory Head'], step: 1, advance: 100000, advStatus: 'Advance Paid', expected: -30, sent: -45, terms: '30 days credit. 50% advance.',
      events: [[-48, P, 'Draft created and submitted for approval'], [-47, F, 'Approved'], [-46, A, 'Advance Paid: 100000'], [-45, P, 'Sent to vendor via Email'], [-35, S, 'Goods received, invoice SM/114 (120 of 200 pcs)'], [-33, A, 'Invoice accepted'], [-20, A, 'Part payment 150000 against invoice SM/114 (balance 89840 is overdue)']] },
    { n: 3, vendor: 'V2', date: -28, lines: [['I3', 300], ['I4', 800]], status: 'Sent to Vendor', route: ['Factory Head'], step: 1, advance: 0, advStatus: 'Not Required', expected: -12, sent: -26, terms: 'Delivery within 15 days.',
      events: [[-28, P, 'Draft created and submitted for approval'], [-27, F, 'Approved'], [-26, P, 'Sent to vendor via WhatsApp'], [-20, S, 'Goods received, invoice FF-778'], [-18, A, 'Invoice accepted'], [-8, A, 'Paid 500000 against invoice']] },
    { n: 4, vendor: 'V3', date: -14, lines: [['I5', 100], ['I6', 500]], status: 'Sent to Vendor', route: ['Factory Head'], step: 1, advance: 0, advStatus: 'Not Required', expected: 3, sent: -12, terms: 'Part delivery allowed.',
      events: [[-14, P, 'Draft created and submitted for approval'], [-13, F, 'Approved'], [-12, P, 'Sent to vendor via Email'], [-2, S, 'Goods received, invoice KT-5502 (60 of 100 sets)']] },
    { n: 5, vendor: 'V3', date: -7, lines: [['I6', 600]], status: 'Sent to Vendor', route: ['Factory Head'], step: 1, advance: 0, advStatus: 'Not Required', expected: 5, sent: -5, terms: '',
      events: [[-7, P, 'Draft created and submitted for approval'], [-6, F, 'Approved'], [-5, P, 'Sent to vendor via Email'], [-1, S, 'Price query raised to Admin: Vendor invoice shows Rs 99 per carton, PO says Rs 95']] },
    { n: 6, vendor: 'V2', date: -6, lines: [['I8', 200]], status: 'Rejected', route: ['Factory Head'], step: 0, advance: 0, advStatus: 'Not Required', expected: 10, terms: '',
      events: [[-6, P, 'Draft created and submitted for approval'], [-5, F, 'Not approved – Bharat Foam is cheaper for headrests, please re-raise']] },
    { n: 7, vendor: 'V5', date: -4, lines: [['I4', 1500], ['I9', 800]], status: 'Pending Admin', route: ['Factory Head', 'Admin'], step: 1, advance: 200000, advStatus: 'Not Required', expected: 20, terms: '20% advance, balance 30 days.',
      events: [[-4, P, 'Draft created and submitted for approval'], [-3, F, 'Approved – OK to proceed, needs the Admin since above Rs 10 Lac']] },
    { n: 8, vendor: 'V6', date: -2, lines: [['I7', 100], ['I10', 50]], status: 'Approved', route: ['Factory Head'], step: 1, advance: 30000, advStatus: 'Requested', expected: 12, terms: 'Advance before dispatch.',
      events: [[-2, P, 'Draft created and submitted for approval'], [-1, F, 'Approved'], [-1, 'System', 'Advance request sent to Accounts']] },
    { n: 9, vendor: 'V4', date: -1, lines: [['I3', 200], ['I11', 20]], status: 'Pending Factory Head', route: ['Factory Head'], step: 0, advance: 0, advStatus: 'Not Required', expected: 14, terms: '',
      events: [[-1, P, 'Draft created and submitted for approval']] },
    { n: 10, vendor: 'V1', date: 0, lines: [['I2', 25]], status: 'Draft', route: [], step: 0, advance: 0, advStatus: 'Not Required', expected: 21, terms: '',
      events: [[0, P, 'Draft created']] },
  ];
  const poNo = (n: number) => 'PO-' + String(n).padStart(4, '0');
  const lineRows: any[] = [];
  const logRows: any[] = [];
  let lg = 0;
  const poRows = pos.map(p => {
    p.lines.forEach(([item, qty]) => lineRows.push({
      id: `po${p.n}:${item}`, poId: `po${p.n}`, poNo: poNo(p.n), itemId: item, itemName: iName[item], qty, price: price(p.vendor, item),
      queryNote: p.n === 5 ? 'Vendor invoice shows Rs 99 per carton, PO says Rs 95' : '', queryStatus: p.n === 5 ? 'Open' : '', queryBy: p.n === 5 ? S : '',
    }));
    p.events.forEach(([d, who, text]) => logRows.push({ id: 'lg' + ++lg, time: iso(d), user: who, role: '', action: 'sample', event: text, ref: `po${p.n}`, detail: 'sample data' }));
    const sentVia = p.n === 3 ? 'WhatsApp' : p.sent !== undefined ? 'Email' : '';
    return {
      id: `po${p.n}`, poNo: poNo(p.n), date: D(p.date), vendorId: p.vendor, vendorName: vName[p.vendor], terms: p.terms, advanceRequired: p.advance > 0, advanceAmount: p.advance,
      expectedDate: D(p.expected), status: p.status, advanceStatus: p.advStatus, route: p.route.join(','), step: p.step,
      sentVia, sentTo: sentVia === 'Email' ? p.vendor.toLowerCase() + '@example.com' : sentVia === 'WhatsApp' ? '9198000000' + p.vendor.slice(1) : '', createdBy: P, department: 'Purchase',
    };
  });

  // ------------------------------------------------------------ goods receipts (= stock IN), invoices, payments
  interface RcSpec { id: string; po: number; grn: number; inv: string; date: number; lines: [string, number, number][]; advAdj: number; accepted?: number }
  const rcs: RcSpec[] = [
    { id: 'r1', po: 1, grn: 1, inv: 'DH-221', date: -55, lines: [['I6', 400, 18]], advAdj: 0, accepted: -53 },
    { id: 'r2', po: 2, grn: 2, inv: 'SM/114', date: -35, lines: [['I1', 120, 18]], advAdj: 100000, accepted: -33 },
    { id: 'r3', po: 3, grn: 3, inv: 'FF-778', date: -20, lines: [['I3', 300, 18], ['I4', 800, 18]], advAdj: 0, accepted: -18 },
    { id: 'r4', po: 4, grn: 4, inv: 'KT-5502', date: -2, lines: [['I5', 60, 18]], advAdj: 0 },
  ];
  const receiptRows: any[] = [], stockRows: any[] = [];
  const payable: Record<string, number> = {};
  for (const r of rcs) {
    const po = pos.find(p => p.n === r.po)!;
    const priced = r.lines.map(([item, qty, tax]) => ({ item, qty, tax, price: price(po.vendor, item) }));
    const sub = r2(priced.reduce((a, l) => a + l.qty * l.price, 0));
    const tax = r2(priced.reduce((a, l) => a + (l.qty * l.price * l.tax) / 100, 0));
    const vi = vendorOf[po.vendor];
    payable[r.id] = r2(sub + tax - r.advAdj);
    receiptRows.push({
      id: r.id, grnNo: 'GRN-' + String(r.grn).padStart(4, '0'), type: 'Invoice', poId: `po${po.n}`, poNo: poNo(po.n), vendorId: po.vendor, vendorName: vName[po.vendor],
      invoiceNo: r.inv, invoiceDate: D(r.date), receivedDate: D(r.date), subtotal: sub, taxTotal: tax, grandTotal: r2(sub + tax), advanceAdjusted: r.advAdj, payable: payable[r.id],
      dueDate: addDays(D(r.date), vi.msme ? Math.min(vi.terms, 45) : vi.terms), accepted: r.accepted !== undefined, acceptedDate: r.accepted !== undefined ? D(r.accepted) : '', invoiceFile: '', createdBy: S,
    });
    priced.forEach(l => stockRows.push({ id: `${r.id}:${l.item}`, date: D(r.date), itemId: l.item, itemName: iName[l.item], type: 'IN', qty: l.qty, receiptId: r.id,
      grnNo: 'GRN-' + String(r.grn).padStart(4, '0'), price: l.price, taxRate: l.tax, toDept: '', note: '', by: S }));
  }
  // old pending balances (bills from before this system)
  const opening = (id: string, vendor: string, ref: string, amount: number, due: number) => ({
    id, grnNo: '', type: 'Opening', poId: '', poNo: '', vendorId: vendor, vendorName: vName[vendor], invoiceNo: ref, invoiceDate: D(-40), receivedDate: D(-40), subtotal: amount, taxTotal: 0,
    grandTotal: amount, advanceAdjusted: 0, payable: amount, dueDate: D(due), accepted: true, acceptedDate: D(-40), invoiceFile: '', createdBy: A,
  });
  receiptRows.push(opening('ob1', 'V3', 'Old bill KT-2291 (before this system)', 85000, -12), opening('ob2', 'V2', 'Old bill FF-0912 (before this system)', 42000, 10));

  const pay = (id: string, kind: 'advance' | 'invoice', poN: number | null, receiptId: string, amount: number, date: number, vendor: string) => ({
    id, kind, poId: poN ? `po${poN}` : '', poNo: poN ? poNo(poN) : '', receiptId, vendorName: vName[vendor], amount, date: D(date), screenshot: '', paidBy: A,
  });
  const paymentRows = [
    pay('pay1', 'invoice', 1, 'r1', payable.r1, -40, 'V6'),
    pay('pay2', 'advance', 2, '', 100000, -46, 'V1'),
    pay('pay3', 'invoice', 2, 'r2', 150000, -20, 'V1'), // part payment: leaves an overdue MSME balance
    pay('pay4', 'invoice', 3, 'r3', 500000, -8, 'V2'),
    pay('pay5', 'invoice', null, 'ob2', 10000, -3, 'V2'),
  ];

  // ------------------------------------------------------------ stock out & corrections
  const mv = (id: string, d: number, item: string, type: 'OUT' | 'ADJUST', qty: number, toDept: string, note: string, by: string) =>
    ({ id, date: D(d), itemId: item, itemName: iName[item], type, qty, receiptId: '', grnNo: '', price: 0, taxRate: 0, toDept, note, by });
  const opening60 = (id: string, item: string, qty: number) => mv(id, -62, item, 'ADJUST', qty, '', 'Opening stock', H);
  stockRows.push(
    opening60('os1', 'I1', 30), opening60('os2', 'I2', 12), opening60('os3', 'I3', 40), opening60('os4', 'I4', 100), opening60('os5', 'I5', 25), opening60('os6', 'I6', 150),
    opening60('os7', 'I7', 60), opening60('os8', 'I8', 80), opening60('os9', 'I9', 200), opening60('os10', 'I10', 20), opening60('os11', 'I11', 5),
    mv('o1', -15, 'I1', 'OUT', 60, 'Production', 'Batch 14', S), mv('o2', -3, 'I1', 'OUT', 50, 'Assembly', '', S), mv('o3', -6, 'I2', 'OUT', 4, 'Production', 'Motorised model', S),
    mv('o4', -10, 'I3', 'OUT', 120, 'Production', '', S), mv('o5', -9, 'I3', 'ADJUST', -5, '', 'Damaged in handling', H), mv('o6', -8, 'I4', 'OUT', 250, 'Cutting', 'Batch 14', S),
    mv('o7', -1, 'I5', 'OUT', 30, 'Assembly', '', S), mv('o8', -5, 'I6', 'OUT', 200, 'Packing', '', S), mv('o9', -7, 'I8', 'OUT', 30, 'Assembly', '', S),
  );

  // ------------------------------------------------------------ assemble
  const sys = (rows: any[]) => rows.map(r => ({ ...r, _v: 1, _at: iso(0), _by: 'sample' }));
  return {
    items: sys(itemSpec.map(i => ({ id: i[0], name: i[1], unit: i[2], category: i[3], minStock: i[4], active: i[5] }))),
    vendors: sys(vendorSpec.map(v => ({
      id: v[0], name: v[1], contact: v[2], email: v[0].toLowerCase() + '@example.com', whatsapp: '9198000000' + v[0].slice(1), msme: v[5], msmeType: v[6],
      udyamNo: v[5] ? `UDYAM-${v[4].slice(0, 2).toUpperCase()}-01-000000${v[0].slice(1)}` : '', gstin: `07AAAAA000${v[0].slice(1)}A1Z5`, pan: `AAAAA000${v[0].slice(1)}A`,
      address: 'Industrial Area, Plot ' + v[0].slice(1), city: v[3], state: v[4], paymentTermsDays: v[7], bankName: v[8], accountNo: v[9], ifsc: 'BANK0001234', active: v[10],
    }))),
    prices: sys(priceSpec.map(([v, i, p]) => ({ id: `${v}:${i}`, vendorId: v, vendorName: vName[v], itemId: i, itemName: iName[i], price: p }))),
    pos: sys(poRows), poLines: sys(lineRows), receipts: sys(receiptRows), payments: sys(paymentRows), stock: sys(stockRows),
    log: logRows,
  };
}
