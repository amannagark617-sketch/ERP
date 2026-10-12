// TEST-ONLY sample data (not shipped in the app's setup). Used by the tests and tests/devserver.mjs.
import { TableKey } from '../src/shared/schema';

type Rows = Partial<Record<TableKey, any[]>>;

const day = (base: string, n: number) => {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function fixtureUsers(): Rows {
  const u = (loginId: string, name: string, role: string, department: string, level: number, reportsTo = '') =>
    ({ loginId, password: loginId + '123', name, role, department, level, reportsTo, active: true });
  return {
    users: [
      u('admin', 'Administrator', 'Admin', 'Management', 5), u('mohit', 'Mohit (CA)', 'CA', 'Finance', 4, 'admin'),
      u('ho', 'Head Office', 'HO', 'Head Office', 4, 'admin'), u('factoryhead', 'Factory Head', 'Factory Head', 'Factory', 3, 'mohit'),
      u('navneet', 'Navneet', 'Purchase', 'Purchase', 2, 'factoryhead'), u('accounts', 'Accounts', 'Accounts', 'Accounts', 2, 'mohit'),
      u('inventory', 'Inventory (Factory)', 'Inventory', 'Factory', 1, 'factoryhead'),
    ],
  };
}

export function demoSeed(t: string): Rows {
  const v = (id: string, name: string, msme: boolean, extra: any = {}) => ({
    id, name, contact: 'Contact ' + id, email: id.toLowerCase() + '@example.com', whatsapp: '9198000000' + id.slice(1), msme, msmeType: msme ? 'Small' : '', udyamNo: msme ? `UDYAM-DL-01-000000${id.slice(1)}` : '',
    gstin: '07AAAAA0000A1Z5', pan: 'AAAAA0000A', address: 'Plot 1', city: 'Delhi', state: 'Delhi', paymentTermsDays: 30, bankName: 'HDFC', accountNo: '5010000000' + id.slice(1), ifsc: 'HDFC0000001', active: true, ...extra,
  });
  const iname: Record<string, string> = { I1: 'Recliner mechanism (manual)', I2: 'Recliner mechanism (motorised)', I3: 'Foam sheet 40D', I4: 'Leatherette fabric', I5: 'Wooden frame set', I6: 'Packing carton' };
  const vname: Record<string, string> = { V1: 'Sharma Mechanisms', V2: 'Foam & Fabric Traders', V3: 'Kailash Timber Works', V4: 'Bharat Foam' };
  const price = (vendorId: string, itemId: string, p: number) => ({ id: `${vendorId}:${itemId}`, vendorId, vendorName: vname[vendorId], itemId, itemName: iname[itemId], price: p });
  const line = (poId: string, poNo: string, itemId: string, qty: number, p: number) => ({ id: `${poId}:${itemId}`, poId, poNo, itemId, itemName: iname[itemId], qty, price: p, queryNote: '', queryStatus: '', queryBy: '' });
  const po = (id: string, poNo: string, date: string, vendorId: string, o: any) => ({
    id, poNo, date, vendorId, vendorName: vname[vendorId], terms: '', advanceRequired: false, advanceAmount: 0, expectedDate: day(t, 10), status: 'Draft', advanceStatus: 'Not Required',
    route: '', step: 0, sentVia: '', sentTo: '', createdBy: 'Navneet', department: 'Purchase', ...o,
  });
  return {
    items: Object.entries(iname).map(([id, name]) => ({ id, name, unit: id === 'I4' ? 'm' : 'pcs', category: '', minStock: id === 'I1' ? 50 : 0, active: true })),
    vendors: [v('V1', vname.V1, true), v('V2', vname.V2, false, { paymentTermsDays: 45 }), v('V3', vname.V3, true, { paymentTermsDays: 15 }), v('V4', vname.V4, false)],
    prices: [price('V1', 'I1', 2400), price('V1', 'I2', 6800), price('V2', 'I3', 1850), price('V2', 'I4', 420), price('V4', 'I3', 1790), price('V3', 'I5', 3200), price('V3', 'I6', 95)],
    pos: [
      po('po1', 'PO-0001', day(t, -20), 'V1', { terms: '30 days credit.', advanceRequired: true, advanceAmount: 100000, expectedDate: day(t, -5), status: 'Sent to Vendor', advanceStatus: 'Advance Paid', route: 'Factory Head', step: 1, sentVia: 'Email', sentTo: 'v1@example.com' }),
      po('po2', 'PO-0002', day(t, -1), 'V2', { status: 'Pending Factory Head', route: 'Factory Head', step: 0 }),
      po('po3', 'PO-0003', t, 'V3', {}),
      // a long-settled PO from two years ago (fully received, accepted and paid)
      po('po9', 'PO-0000', day(t, -730), 'V2', { status: 'Sent to Vendor', route: 'Factory Head', step: 1, sentVia: 'Email', sentTo: 'v2@example.com', expectedDate: day(t, -700) }),
    ],
    poLines: [line('po1', 'PO-0001', 'I1', 200, 2400), line('po2', 'PO-0002', 'I3', 300, 1850), line('po2', 'PO-0002', 'I4', 800, 420), line('po3', 'PO-0003', 'I5', 100, 3200), line('po9', 'PO-0000', 'I4', 10, 420)],
    receipts: [
      { id: 'r9', grnNo: 'GRN-0000', type: 'Invoice', poId: 'po9', poNo: 'PO-0000', vendorId: 'V2', vendorName: vname.V2, invoiceNo: 'OLD-1', invoiceDate: day(t, -720), receivedDate: day(t, -720), subtotal: 4200, taxTotal: 756, grandTotal: 4956, advanceAdjusted: 0, payable: 4956, dueDate: day(t, -675), accepted: true, acceptedDate: day(t, -719), invoiceFile: '', createdBy: 'Inventory' },
      { id: 'ob1', grnNo: '', type: 'Opening', poId: '', poNo: '', vendorId: 'V3', vendorName: vname.V3, invoiceNo: 'Old bill KT-2291', invoiceDate: day(t, -30), receivedDate: day(t, -30), subtotal: 85000, taxTotal: 0, grandTotal: 85000, advanceAdjusted: 0, payable: 85000, dueDate: day(t, -12), accepted: true, acceptedDate: day(t, -30), invoiceFile: '', createdBy: 'Accounts' },
    ],
    payments: [
      { id: 'pay1', kind: 'advance', poId: 'po1', poNo: 'PO-0001', receiptId: '', vendorName: vname.V1, amount: 100000, date: day(t, -18), screenshot: '', paidBy: 'Accounts' },
      { id: 'pay9', kind: 'invoice', poId: 'po9', poNo: 'PO-0000', receiptId: 'r9', vendorName: vname.V2, amount: 4956, date: day(t, -700), screenshot: '', paidBy: 'Accounts' },
    ],
    stock: [
      { id: 'r9:I4', date: day(t, -720), itemId: 'I4', itemName: iname.I4, type: 'IN', qty: 10, receiptId: 'r9', grnNo: 'GRN-0000', price: 420, taxRate: 18, toDept: '', note: '', by: 'Inventory' },
      { id: 'st1', date: day(t, -3), itemId: 'I3', itemName: iname.I3, type: 'ADJUST', qty: 100, receiptId: '', grnNo: '', price: 0, taxRate: 0, toDept: '', note: 'Opening stock', by: 'HO' },
    ],
  };
}

export const fixture = (today: string): Rows => ({ ...fixtureUsers(), ...demoSeed(today) });
