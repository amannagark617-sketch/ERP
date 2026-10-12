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

/** Configuration written on first setup (policy from the process design, no business data). */
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
    // One starter login with NO password: the admin types one into the Users sheet before first use.
    users: [{ loginId: 'admin', password: '', name: 'Administrator', role: 'Admin', department: 'Management', level: 5, reportsTo: '', active: true }],
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

