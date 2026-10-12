/**
 * Sheet layout - ONE Google Spreadsheet, 12 tabs.
 *   Tabs you edit by hand:   Users, Roles, Settings, Vendors, Items, Prices
 *   Tabs the app writes:     PurchaseOrders, POLines, Receipts, Payments, Stock, Log
 * Column HEADERS are what people see/edit in the Sheet; KEYS are used in code.
 * Columns are matched by header name, so you can re-order or add your own extra columns freely.
 */
export type ColType = 'text' | 'num' | 'bool' | 'date';
export interface Col { key: string; header: string; type: ColType; dflt?: boolean }
export interface TableDef {
  sheet: string;
  id: string;                    // key of the unique-ID column
  kind: 'data' | 'config';       // data tables get Version / Updated At / Updated By columns and are sent to the app
  cols: Col[];
  color: string;                 // tab colour: orange = access, green = master data you edit, grey = written by the app
  autoId?: string;               // prefix used to fill a blank ID (e.g. rows typed by hand)
  deriveId?: (r: any) => string; // ID computed from other columns
}

const c = (key: string, header: string, type: ColType = 'text', dflt = false): Col => ({ key, header, type, dflt });

export const SYSTEM_COLS: Col[] = [c('_v', 'Version', 'num'), c('_at', 'Updated At'), c('_by', 'Updated By')];

const ACCESS = '#e69138', MASTER = '#38761d', APP = '#999999';

export const TABLES = {
  // ---------- Access & settings (Admin) ----------
  users: {
    sheet: 'Users', id: 'loginId', kind: 'config', color: ACCESS,
    cols: [
      c('loginId', 'Login ID'), c('password', 'Password'), c('name', 'Full Name'), c('role', 'Role'), c('department', 'Department'),
      c('level', 'Level', 'num'), c('reportsTo', 'Reports To (Login ID)'), c('active', 'Active (Yes/No)', 'bool'),
    ],
  },
  roles: {
    sheet: 'Roles', id: 'role', kind: 'config', color: ACCESS,
    cols: [
      c('role', 'Role'), c('level', 'Level', 'num'), c('approvesAbove', 'Approves POs above Rs (blank = not an approver)'),
      c('cPo', 'Create & Send POs', 'bool'), c('cAdvance', 'Pay Advances', 'bool'), c('cReceive', 'Receive Goods (Stock In)', 'bool'),
      c('cIssue', 'Issue Stock (Stock Out)', 'bool'), c('cAdjust', 'Adjust Stock', 'bool'), c('cPay', 'Accept Invoices & Pay', 'bool'),
      c('cMaster', 'Manage Vendors, Items & Prices', 'bool'), c('cUsers', 'Manage Users', 'bool'),
    ],
  },
  settings: {
    sheet: 'Settings', id: 'key', kind: 'config', color: ACCESS,
    cols: [c('key', 'Setting'), c('value', 'Value'), c('description', 'Meaning')],
  },
  // ---------- Master data (HO) ----------
  vendors: {
    sheet: 'Vendors', id: 'id', kind: 'data', color: MASTER, autoId: 'V',
    cols: [
      c('id', 'Vendor ID'), c('name', 'Vendor Name'), c('contact', 'Contact Person'), c('email', 'Email'), c('whatsapp', 'WhatsApp'),
      c('msme', 'MSME (Yes/No)', 'bool'), c('msmeType', 'MSME Type'), c('udyamNo', 'Udyam Registration No'),
      c('gstin', 'GSTIN'), c('pan', 'PAN'), c('address', 'Address'), c('city', 'City'), c('state', 'State'),
      c('paymentTermsDays', 'Payment Terms (days)', 'num'),
      c('bankName', 'Bank Name'), c('accountNo', 'Bank Account No'), c('ifsc', 'IFSC'), c('active', 'Active (Yes/No)', 'bool', true),
    ],
  },
  items: {
    sheet: 'Items', id: 'id', kind: 'data', color: MASTER, autoId: 'I',
    cols: [
      c('id', 'Item ID'), c('name', 'Item Name'), c('unit', 'Unit'), c('category', 'Category'),
      c('minStock', 'Min Stock (low-stock alert)', 'num'), c('active', 'Active (Yes/No)', 'bool', true),
    ],
  },
  prices: {
    sheet: 'Prices', id: 'id', kind: 'data', color: MASTER, deriveId: (r: any) => (r.vendorId && r.itemId ? `${r.vendorId}:${r.itemId}` : ''),
    cols: [
      c('id', 'Key (auto)'), c('vendorName', 'Vendor Name'), c('itemName', 'Item Name'), c('price', 'Agreed Price (Rs)', 'num'),
      c('vendorId', 'Vendor ID'), c('itemId', 'Item ID'),
    ],
  },
  // ---------- Written by the app ----------
  pos: {
    sheet: 'PurchaseOrders', id: 'id', kind: 'data', color: APP,
    cols: [
      c('poNo', 'PO No'), c('date', 'PO Date', 'date'), c('vendorName', 'Vendor'), c('status', 'Status'), c('advanceStatus', 'Advance Status'),
      c('expectedDate', 'Expected Delivery', 'date'), c('advanceRequired', 'Advance Required (Yes/No)', 'bool'), c('advanceAmount', 'Advance Amount', 'num'),
      c('terms', 'Terms & Conditions'), c('route', 'Approval Route'), c('step', 'Approval Step', 'num'),
      c('sentVia', 'Sent Via'), c('sentTo', 'Sent To'), c('poFile', 'PO PDF sent (Drive ID)'), c('createdBy', 'Created By'), c('department', 'Department'),
      c('vendorId', 'Vendor ID'), c('id', 'PO Key'),
    ],
  },
  poLines: {
    sheet: 'POLines', id: 'id', kind: 'data', color: APP, deriveId: (r: any) => (r.poId && r.itemId ? `${r.poId}:${r.itemId}` : ''),
    cols: [
      c('poNo', 'PO No'), c('itemName', 'Item'), c('qty', 'Quantity', 'num'), c('price', 'Price', 'num'),
      c('queryNote', 'Price Query to HO'), c('queryStatus', 'Query Status'), c('queryBy', 'Query Raised By'),
      c('poId', 'PO Key'), c('itemId', 'Item ID'), c('id', 'Key (auto)'),
    ],
  },
  receipts: {
    sheet: 'Receipts', id: 'id', kind: 'data', color: APP,
    cols: [
      c('grnNo', 'GRN No'), c('type', 'Type (Invoice / Opening)'), c('poNo', 'PO No'), c('vendorName', 'Vendor'),
      c('invoiceNo', 'Invoice No / Reference'), c('invoiceDate', 'Invoice Date', 'date'), c('receivedDate', 'Received Date (Factory In)', 'date'),
      c('subtotal', 'Sub-total', 'num'), c('taxTotal', 'Tax', 'num'), c('grandTotal', 'Grand Total', 'num'),
      c('advanceAdjusted', 'Advance Adjusted', 'num'), c('payable', 'Payable', 'num'), c('dueDate', 'Payment Due Date', 'date'),
      c('accepted', 'Accepted by Accounts (Yes/No)', 'bool'), c('acceptedDate', 'Accepted Date', 'date'),
      c('invoiceFile', 'Invoice File (Drive ID)'), c('createdBy', 'Created By'),
      c('poId', 'PO Key'), c('vendorId', 'Vendor ID'), c('id', 'Receipt Key'),
    ],
  },
  payments: {
    sheet: 'Payments', id: 'id', kind: 'data', color: APP,
    cols: [
      c('date', 'Payment Date', 'date'), c('kind', 'Type (advance / invoice)'), c('vendorName', 'Vendor'), c('poNo', 'PO No'), c('amount', 'Amount', 'num'),
      c('screenshot', 'Screenshot (Drive ID)'), c('paidBy', 'Paid By'), c('poId', 'PO Key'), c('receiptId', 'Receipt Key'), c('id', 'Key'),
    ],
  },
  stock: {
    sheet: 'Stock', id: 'id', kind: 'data', color: APP,
    cols: [
      c('date', 'Date', 'date'), c('itemName', 'Item'), c('type', 'Type (IN / OUT / ADJUST)'), c('qty', 'Quantity', 'num'),
      c('toDept', 'Issued To (Dept / Purpose)'), c('note', 'Note'), c('grnNo', 'GRN No'), c('price', 'Price', 'num'), c('taxRate', 'Tax %', 'num'),
      c('by', 'By'), c('itemId', 'Item ID'), c('receiptId', 'Receipt Key'), c('id', 'Key'),
    ],
  },
  log: {
    sheet: 'Log', id: 'id', kind: 'config', color: APP,
    cols: [c('time', 'Time'), c('user', 'User'), c('role', 'Role'), c('action', 'Action'), c('event', 'Event'), c('ref', 'PO Key'), c('detail', 'Detail'), c('id', 'Key')],
  },
} as const satisfies Record<string, TableDef>;

export type TableKey = keyof typeof TABLES;
export const DATA_TABLES = (Object.keys(TABLES) as TableKey[]).filter(k => TABLES[k].kind === 'data');
export const def = (k: TableKey): TableDef => TABLES[k] as TableDef;
export const allCols = (d: TableDef): Col[] => (d.kind === 'data' ? [...d.cols, ...SYSTEM_COLS] : d.cols);

const truthy = (v: any) => v === true || /^(yes|y|true|1)$/i.test(String(v ?? '').trim());

/** Sheet row (header → cell) → entity (key → typed value) */
export function fromSheet(d: TableDef, raw: Record<string, any>): any {
  const e: any = {};
  for (const col of allCols(d)) {
    const v = raw[col.header];
    const blank = v === '' || v == null;
    if (col.type === 'num') e[col.key] = blank ? 0 : Number(v) || 0;
    else if (col.type === 'bool') e[col.key] = blank && col.dflt ? true : truthy(v);
    else e[col.key] = blank ? '' : String(v).trim();
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
