/**
 * Sheet layout. Every table here is one tab in the Google Sheet.
 * Column HEADERS are what people see/edit in the Sheet; KEYS are used in code.
 * Columns are matched by header name, so you can re-order or add your own columns freely.
 */
export type ColType = 'text' | 'num' | 'bool' | 'date';
export interface Col { key: string; header: string; type: ColType }
export interface TableDef {
  sheet: string;
  id: string;                    // key of the unique-ID column
  kind: 'data' | 'config';       // data tables get Version / Updated At / Updated By columns
  book?: 'data' | 'access';      // which Google Spreadsheet file holds the tab (default 'data'); logins & config live in 'access'
  cols: Col[];
  autoId?: string;               // prefix used to fill a blank ID (e.g. rows typed by hand)
  deriveId?: (r: any) => string; // ID computed from other columns
}

const c = (key: string, header: string, type: ColType = 'text'): Col => ({ key, header, type });

export const SYSTEM_COLS: Col[] = [c('_v', 'Version', 'num'), c('_at', 'Updated At'), c('_by', 'Updated By')];

export const TABLES = {
  // ---------- Master data (HO) ----------
  items: {
    sheet: 'Items', id: 'id', kind: 'data', autoId: 'I',
    cols: [c('id', 'Item ID'), c('name', 'Item Name'), c('unit', 'Unit')],
  },
  vendors: {
    sheet: 'Vendors', id: 'id', kind: 'data', autoId: 'V',
    cols: [
      c('id', 'Vendor ID'), c('name', 'Vendor Name'), c('contact', 'Contact Person'), c('email', 'Email'), c('whatsapp', 'WhatsApp'),
      c('msme', 'MSME (Yes/No)', 'bool'), c('msmeType', 'MSME Type'), c('udyamNo', 'Udyam Registration No'),
      c('gstin', 'GSTIN'), c('pan', 'PAN'), c('address', 'Address'), c('city', 'City'), c('state', 'State'),
      c('paymentTermsDays', 'Payment Terms (days)', 'num'),
      c('bankName', 'Bank Name'), c('accountNo', 'Bank Account No'), c('ifsc', 'IFSC'), c('active', 'Active (Yes/No)', 'bool'),
    ],
  },
  vendorItems: {
    sheet: 'VendorItems', id: 'id', kind: 'data', deriveId: (r: any) => `${r.vendorId}:${r.itemId}`,
    cols: [c('id', 'Key (auto)'), c('vendorId', 'Vendor ID'), c('itemId', 'Item ID'), c('price', 'Agreed Price', 'num')],
  },
  // ---------- Purchase orders ----------
  pos: {
    sheet: 'PurchaseOrders', id: 'id', kind: 'data',
    cols: [
      c('id', 'PO Key'), c('poNo', 'PO No'), c('date', 'PO Date', 'date'), c('vendorId', 'Vendor ID'), c('terms', 'Terms & Conditions'),
      c('advanceRequired', 'Advance Required (Yes/No)', 'bool'), c('advanceAmount', 'Advance Amount', 'num'),
      c('expectedDate', 'Expected Delivery', 'date'), c('status', 'Status'), c('advanceStatus', 'Advance Status'),
      c('route', 'Approval Route'), c('step', 'Approval Step', 'num'),
      c('sentVia', 'Sent Via'), c('sentTo', 'Sent To'), c('createdBy', 'Created By'), c('department', 'Department'),
    ],
  },
  poLines: {
    sheet: 'POLines', id: 'id', kind: 'data', deriveId: (r: any) => `${r.poId}:${r.itemId}`,
    cols: [c('id', 'Key (auto)'), c('poId', 'PO Key'), c('itemId', 'Item ID'), c('qty', 'Quantity', 'num'), c('price', 'Price', 'num')],
  },
  poHistory: {
    sheet: 'POHistory', id: 'id', kind: 'data',
    cols: [c('id', 'Key'), c('poId', 'PO Key'), c('date', 'Date', 'date'), c('by', 'By'), c('text', 'Event')],
  },
  // ---------- Goods receipt ----------
  receipts: {
    sheet: 'Receipts', id: 'id', kind: 'data',
    cols: [
      c('id', 'Receipt Key'), c('grnNo', 'GRN No'), c('poId', 'PO Key'), c('invoiceNo', 'Invoice No'), c('invoiceDate', 'Invoice Date', 'date'),
      c('receivedDate', 'Received Date (Factory In)', 'date'), c('subtotal', 'Sub-total', 'num'), c('taxTotal', 'Tax', 'num'),
      c('grandTotal', 'Grand Total', 'num'), c('advanceAdjusted', 'Advance Adjusted', 'num'), c('payable', 'Payable', 'num'),
      c('accepted', 'Accepted by Accounts (Yes/No)', 'bool'), c('acceptedDate', 'Accepted Date', 'date'),
      c('invoiceFile', 'Invoice File (Drive ID)'), c('createdBy', 'Created By'),
    ],
  },
  receiptLines: {
    sheet: 'ReceiptLines', id: 'id', kind: 'data', deriveId: (r: any) => `${r.receiptId}:${r.itemId}`,
    cols: [c('id', 'Key (auto)'), c('receiptId', 'Receipt Key'), c('itemId', 'Item ID'), c('qty', 'Quantity', 'num'), c('price', 'Price', 'num'), c('taxRate', 'Tax %', 'num')],
  },
  // ---------- Payments ----------
  payments: {
    sheet: 'Payments', id: 'id', kind: 'data',
    cols: [
      c('id', 'Key'), c('kind', 'Type'), c('poId', 'PO Key'), c('receiptId', 'Receipt Key'), c('openingId', 'Opening Balance Key'),
      c('amount', 'Amount', 'num'), c('date', 'Payment Date', 'date'), c('screenshot', 'Screenshot (Drive ID)'), c('paidBy', 'Paid By'),
    ],
  },
  openings: {
    sheet: 'OpeningBalances', id: 'id', kind: 'data',
    cols: [c('id', 'Key'), c('vendorId', 'Vendor ID'), c('ref', 'Reference'), c('amount', 'Amount', 'num'), c('dueDate', 'Due Date', 'date')],
  },
  queries: {
    sheet: 'PriceQueries', id: 'id', kind: 'data',
    cols: [c('id', 'Key'), c('poId', 'PO Key'), c('itemId', 'Item ID'), c('note', 'Note'), c('raisedBy', 'Raised By'), c('date', 'Date', 'date'), c('status', 'Status')],
  },
  counters: {
    sheet: 'Counters', id: 'id', kind: 'config',
    cols: [c('id', 'Counter'), c('value', 'Last Number', 'num')],
  },
  // ---------- Access control & configuration (edit directly in the Sheet) ----------
  users: {
    sheet: 'Users', id: 'loginId', kind: 'config', book: 'access',
    cols: [
      c('loginId', 'Login ID'), c('password', 'Password'), c('name', 'Full Name'), c('role', 'Role'), c('department', 'Department'),
      c('level', 'Level', 'num'), c('reportsTo', 'Reports To (Login ID)'), c('active', 'Active (Yes/No)', 'bool'),
    ],
  },
  roles: {
    sheet: 'Roles', id: 'role', kind: 'config', book: 'access',
    cols: [c('role', 'Role'), c('level', 'Default Level', 'num'), c('department', 'Department'), c('description', 'Description')],
  },
  permissions: {
    sheet: 'Permissions', id: 'action', kind: 'config', book: 'access',
    cols: [c('action', 'Action'), c('roles', 'Allowed Roles (comma separated, * = everyone)'), c('minLevel', 'Or Level At Least', 'num'), c('description', 'What it allows')],
  },
  approvalRules: {
    sheet: 'ApprovalRules', id: 'step', kind: 'config', book: 'access',
    cols: [c('step', 'Step', 'num'), c('fromValue', 'Applies When PO Value Above', 'num'), c('approverRole', 'Approver Role'), c('description', 'Note')],
  },
  settings: {
    sheet: 'Settings', id: 'key', kind: 'config', book: 'access',
    cols: [c('key', 'Setting'), c('value', 'Value'), c('description', 'Meaning')],
  },
  audit: {
    sheet: 'AuditLog', id: 'id', kind: 'config',
    cols: [c('id', 'Key'), c('time', 'Time'), c('user', 'User'), c('role', 'Role'), c('action', 'Action'), c('detail', 'Detail')],
  },
} as const satisfies Record<string, TableDef>;

export type TableKey = keyof typeof TABLES;
export const DATA_TABLES = (Object.keys(TABLES) as TableKey[]).filter(k => TABLES[k].kind === 'data');
export const def = (k: TableKey): TableDef => TABLES[k] as TableDef;
export type Book = 'data' | 'access';
export const bookOf = (d: TableDef): Book => d.book ?? 'data';
export const allCols = (d: TableDef): Col[] => (d.kind === 'data' ? [...d.cols, ...SYSTEM_COLS] : d.cols);

const truthy = (v: any) => v === true || /^(yes|y|true|1)$/i.test(String(v ?? '').trim());

/** Sheet row (header → cell) → entity (key → typed value) */
export function fromSheet(d: TableDef, raw: Record<string, any>): any {
  const e: any = {};
  for (const col of allCols(d)) {
    const v = raw[col.header];
    if (col.type === 'num') e[col.key] = v === '' || v == null ? 0 : Number(v) || 0;
    else if (col.type === 'bool') e[col.key] = truthy(v);
    else e[col.key] = v == null ? '' : String(v).trim();
  }
  if (!e[d.id] && d.deriveId) e[d.id] = d.deriveId(e);
  return e;
}

/** Entity → sheet row */
export function toSheet(d: TableDef, e: any): Record<string, any> {
  const r: Record<string, any> = {};
  for (const col of allCols(d)) {
    const v = e[col.key];
    if (col.type === 'bool') r[col.header] = v ? 'Yes' : 'No';
    else if (col.type === 'num') r[col.header] = v == null || v === '' ? '' : Number(v);
    else r[col.header] = v == null ? '' : String(v);
  }
  return r;
}
