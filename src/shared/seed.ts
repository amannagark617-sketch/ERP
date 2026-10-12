import { TableKey } from './schema';

type Rows = Partial<Record<TableKey, any[]>>;

export const PERMISSION_ROWS = [
  ['po.save', 'Purchase', 'Create and edit a PO (draft / rejected)'],
  ['po.submit', 'Purchase', 'Submit a PO for approval'],
  ['po.send', 'Purchase', 'Send an approved PO to the vendor'],
  ['po.approve', 'Factory Head,CA', 'Approve a PO that is waiting for the user\'s role'],
  ['po.reject', 'Factory Head,CA', 'Return a PO that is waiting for the user\'s role'],
  ['advance.pay', 'Accounts', 'Pay / record a PO advance'],
  ['receipt.create', 'Inventory', 'Record goods receipt and invoice details'],
  ['invoice.accept', 'Accounts', 'Accept (book) an invoice'],
  ['payment.make', 'Accounts', 'Record invoice / old-balance payments'],
  ['opening.add', 'Accounts', 'Add old pending balances'],
  ['query.raise', 'Inventory,Purchase', 'Refer a price difference to HO'],
  ['master.manage', 'HO', 'Edit vendors, vendor prices, items and resolve price queries'],
  ['users.manage', '', 'Add / edit users in the app'],
];

/** Configuration written on first setup. Passwords are plain text here; they are hashed on the user's first login. */
export function configSeed(): Rows {
  return {
    roles: [
      { role: 'Admin', level: 5, department: 'Management', description: 'Full control, user management' },
      { role: 'CA', level: 4, department: 'Finance', description: 'Second-level approver for POs above the limit' },
      { role: 'HO', level: 4, department: 'Head Office', description: 'Backend master data: vendors, items, prices' },
      { role: 'Factory Head', level: 3, department: 'Factory', description: 'First-level PO approver' },
      { role: 'Purchase', level: 2, department: 'Purchase', description: 'Creates POs' },
      { role: 'Accounts', level: 2, department: 'Accounts', description: 'Advances, invoices, payments' },
      { role: 'Inventory', level: 1, department: 'Factory', description: 'Goods receipt at the factory' },
    ],
    users: [
      { loginId: 'admin', password: 'admin123', name: 'Administrator', role: 'Admin', department: 'Management', level: 5, reportsTo: '', active: true },
      { loginId: 'mohit', password: 'mohit123', name: 'Mohit (CA)', role: 'CA', department: 'Finance', level: 4, reportsTo: 'admin', active: true },
      { loginId: 'ho', password: 'ho123', name: 'Head Office', role: 'HO', department: 'Head Office', level: 4, reportsTo: 'admin', active: true },
      { loginId: 'factoryhead', password: 'factoryhead123', name: 'Factory Head', role: 'Factory Head', department: 'Factory', level: 3, reportsTo: 'mohit', active: true },
      { loginId: 'navneet', password: 'navneet123', name: 'Navneet', role: 'Purchase', department: 'Purchase', level: 2, reportsTo: 'factoryhead', active: true },
      { loginId: 'accounts', password: 'accounts123', name: 'Accounts', role: 'Accounts', department: 'Accounts', level: 2, reportsTo: 'mohit', active: true },
      { loginId: 'inventory', password: 'inventory123', name: 'Inventory (Factory)', role: 'Inventory', department: 'Factory', level: 1, reportsTo: 'factoryhead', active: true },
    ],
    permissions: PERMISSION_ROWS.map(([action, roles, description]) => ({ action, roles, minLevel: 5, description })),
    approvalRules: [
      { step: 1, fromValue: 0, approverRole: 'Factory Head', description: 'Every PO' },
      { step: 2, fromValue: 1000000, approverRole: 'CA', description: 'POs above Rs 10 Lac also go to the CA' },
    ],
    settings: [
      { key: 'CompanyName', value: 'Little Nap Recliners', description: 'Shown in the app header' },
      { key: 'MsmeMaxDays', value: '45', description: 'Maximum payment days for MSME vendors' },
      { key: 'TaxRates', value: '0,5,18', description: 'Tax rates offered at goods receipt (%)' },
      { key: 'InvoiceTolerance', value: '1', description: 'Allowed difference (Rs) between system total and invoice total' },
      { key: 'DriveFolderId', value: '', description: 'Drive folder for uploads (filled in automatically)' },
    ],
    counters: [{ id: 'po', value: 0 }, { id: 'grn', value: 0 }],
  };
}

const day = (base: string, n: number) => {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Optional demo masters + a few sample POs. */
export function demoSeed(today: string): Rows {
  const t = today;
  const h = (id: string, poId: string, d: string, by: string, text: string) => ({ id, poId, date: d, by, text });
  return {
    items: [
      { id: 'I1', name: 'Recliner mechanism (manual)', unit: 'pcs' },
      { id: 'I2', name: 'Recliner mechanism (motorised)', unit: 'pcs' },
      { id: 'I3', name: 'Foam sheet 40D', unit: 'sheet' },
      { id: 'I4', name: 'Leatherette fabric', unit: 'm' },
      { id: 'I5', name: 'Wooden frame set', unit: 'set' },
      { id: 'I6', name: 'Packing carton', unit: 'pcs' },
    ],
    vendors: [
      { id: 'V1', name: 'Sharma Mechanisms Pvt Ltd', contact: 'Rakesh Sharma', email: 'sales@sharmamech.example', whatsapp: '919800000001', msme: true, msmeType: 'Small', udyamNo: 'UDYAM-DL-01-0000001', gstin: '07AAAAA0000A1Z5', pan: 'AAAAA0000A', address: 'Plot 12, Industrial Area', city: 'Delhi', state: 'Delhi', paymentTermsDays: 30, bankName: 'HDFC Bank', accountNo: '50100000000001', ifsc: 'HDFC0000001', active: true },
      { id: 'V2', name: 'Foam & Fabric Traders', contact: 'Anita Verma', email: 'orders@foamfabric.example', whatsapp: '919800000002', msme: false, msmeType: '', udyamNo: '', gstin: '06BBBBB1111B1Z6', pan: 'BBBBB1111B', address: 'Sector 5', city: 'Gurugram', state: 'Haryana', paymentTermsDays: 45, bankName: 'ICICI Bank', accountNo: '000405000002', ifsc: 'ICIC0000004', active: true },
      { id: 'V3', name: 'Kailash Timber Works', contact: 'Kailash Rao', email: 'kailash@timber.example', whatsapp: '919800000003', msme: true, msmeType: 'Micro', udyamNo: 'UDYAM-UP-02-0000002', gstin: '09CCCCC2222C1Z7', pan: 'CCCCC2222C', address: 'Saw Mill Road', city: 'Saharanpur', state: 'Uttar Pradesh', paymentTermsDays: 15, bankName: 'SBI', accountNo: '30000000003', ifsc: 'SBIN0000003', active: true },
    ],
    vendorItems: [
      { vendorId: 'V1', itemId: 'I1', price: 2400 }, { vendorId: 'V1', itemId: 'I2', price: 6800 },
      { vendorId: 'V2', itemId: 'I3', price: 1850 }, { vendorId: 'V2', itemId: 'I4', price: 420 },
      { vendorId: 'V3', itemId: 'I5', price: 3200 }, { vendorId: 'V3', itemId: 'I6', price: 95 },
    ].map(r => ({ id: `${r.vendorId}:${r.itemId}`, ...r })),
    pos: [
      { id: 'po1', poNo: 'PO-0001', date: day(t, -20), vendorId: 'V1', terms: '30 days credit. Delivery at factory gate.', advanceRequired: true, advanceAmount: 100000, expectedDate: day(t, -5), status: 'Sent to Vendor', advanceStatus: 'Advance Paid', route: 'Factory Head', step: 1, sentVia: 'Email', sentTo: 'sales@sharmamech.example', createdBy: 'Navneet', department: 'Purchase' },
      { id: 'po2', poNo: 'PO-0002', date: day(t, -1), vendorId: 'V2', terms: 'Delivery within 10 days.', advanceRequired: false, advanceAmount: 0, expectedDate: day(t, 9), status: 'Pending Factory Head', advanceStatus: 'Not Required', route: 'Factory Head', step: 0, sentVia: '', sentTo: '', createdBy: 'Navneet', department: 'Purchase' },
      { id: 'po3', poNo: 'PO-0003', date: t, vendorId: 'V3', terms: '', advanceRequired: false, advanceAmount: 0, expectedDate: day(t, 14), status: 'Draft', advanceStatus: 'Not Required', route: '', step: 0, sentVia: '', sentTo: '', createdBy: 'Navneet', department: 'Purchase' },
    ],
    poLines: [
      { poId: 'po1', itemId: 'I1', qty: 200, price: 2400 },
      { poId: 'po2', itemId: 'I3', qty: 300, price: 1850 }, { poId: 'po2', itemId: 'I4', qty: 800, price: 420 },
      { poId: 'po3', itemId: 'I5', qty: 100, price: 3200 },
    ].map(r => ({ id: `${r.poId}:${r.itemId}`, ...r })),
    poHistory: [
      h('h1', 'po1', day(t, -20), 'Navneet', 'PO created and submitted'), h('h2', 'po1', day(t, -19), 'Factory Head', 'Approved'),
      h('h3', 'po1', day(t, -18), 'Accounts', 'Advance Paid: 100000'), h('h4', 'po1', day(t, -18), 'Navneet', 'Sent to vendor via Email'),
      h('h5', 'po2', day(t, -1), 'Navneet', 'PO created and submitted'), h('h6', 'po3', t, 'Navneet', 'Draft created'),
    ],
    payments: [{ id: 'pay1', kind: 'advance', poId: 'po1', receiptId: '', openingId: '', amount: 100000, date: day(t, -18), screenshot: '', paidBy: 'Accounts' }],
    openings: [{ id: 'ob1', vendorId: 'V3', ref: 'Old bill KT-2291 (opening balance)', amount: 85000, dueDate: day(t, -12) }],
    counters: [{ id: 'po', value: 3 }, { id: 'grn', value: 0 }],
  };
}
