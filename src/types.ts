export type Role = string;

/** Fields the server maintains on every stored row. */
interface Sys { _v?: number; _at?: string; _by?: string }

export interface Item extends Sys { id: string; name: string; unit: string; category: string; minStock: number; active: boolean }
export interface VendorItem extends Sys { itemId: string; price: number }
export interface Vendor extends Sys {
  id: string;
  name: string;
  contact: string;
  email: string;
  whatsapp: string;
  msme: boolean;
  msmeType: string;
  udyamNo: string;
  gstin: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  paymentTermsDays: number;
  bankName: string;
  accountNo: string;
  ifsc: string;
  active: boolean;
  /** this vendor's price list (rows of the Prices tab) */
  items: VendorItem[];
}

/** 'Draft' | 'Pending <Role>' | 'Rejected' | 'Approved' | 'Sent to Vendor' */
export type PoStatus = string;
export type AdvanceStatus = 'Not Required' | 'Requested' | 'Advance Paid' | 'Fully Paid';

export interface PoLine extends Sys { itemId: string; qty: number; price: number; queryNote?: string; queryStatus?: '' | 'Open' | 'Resolved'; queryBy?: string }
export interface PurchaseOrder extends Sys {
  id: string;
  poNo: string;
  date: string;
  vendorId: string;
  lines: PoLine[];
  terms: string;
  advanceRequired: boolean;
  advanceAmount: number;
  expectedDate: string;
  status: PoStatus;
  advanceStatus: AdvanceStatus;
  route: string[];
  step: number;
  sentVia?: 'Email' | 'WhatsApp' | '';
  sentTo?: string;
  /** The PDF that was sent to the vendor (Drive file id) */
  poFile?: string;
  createdBy: string;
  department: string;
}

/** Items received on a receipt are rows of the Stock tab (type IN). */
export interface ReceiptLine extends Sys { itemId: string; qty: number; price: number; taxRate: number }
export interface Receipt extends Sys {
  id: string;
  grnNo: string;
  /** 'Invoice' = goods received against a PO. 'Opening' = an old pending balance entered by Accounts. */
  type: 'Invoice' | 'Opening';
  poId: string;
  vendorId: string;
  invoiceNo: string;
  invoiceDate: string;
  receivedDate: string;
  lines: ReceiptLine[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  advanceAdjusted: number;
  payable: number;
  dueDate: string;
  accepted: boolean;
  acceptedDate?: string;
  invoiceFile?: string;
  createdBy: string;
}

export interface Payment extends Sys {
  id: string;
  poId?: string;
  receiptId?: string;
  kind: 'advance' | 'invoice';
  amount: number;
  date: string;
  screenshot?: string; // Drive file id
  paidBy?: string;
}

/** Stock movements other than goods receipts: OUT (issue) and ADJUST (+/- correction). */
export interface StockMove extends Sys {
  id: string;
  date: string;
  itemId: string;
  type: 'OUT' | 'ADJUST';
  qty: number; // OUT: positive quantity issued. ADJUST: signed correction
  toDept: string;
  note: string;
  by?: string;
}

export interface AppState {
  items: Item[];
  vendors: Vendor[];
  pos: PurchaseOrder[];
  receipts: Receipt[];
  payments: Payment[];
  stock: StockMove[];
  /** stock balance contributed by older records that are not loaded (see "Load full history") */
  stockBase: Record<string, number>;
}

export interface User {
  loginId: string;
  name: string;
  role: Role;
  department: string;
  level: number;
  permissions: string[];
}

export interface Approver { role: string; above: number; level: number }
export interface RoleInfo { role: string; level: number }
export interface HistoryEntry { id: string; time: string; by: string; text: string }
