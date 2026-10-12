export type Role = string;

/** Fields the server maintains on every stored row. */
interface Sys { _v?: number; _at?: string; _by?: string }

export interface Item extends Sys { id: string; name: string; unit: string }
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
  items: VendorItem[];
}

/** 'Draft' | 'Pending <Role>' | 'Rejected' | 'Approved' | 'Sent to Vendor' */
export type PoStatus = string;
export type AdvanceStatus = 'Not Required' | 'Requested' | 'Advance Paid' | 'Fully Paid';

export interface PoLine extends Sys { itemId: string; qty: number; price: number }
export interface HistoryEntry extends Sys { id: string; date: string; by: string; text: string }
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
  createdBy: string;
  department: string;
  history: HistoryEntry[];
}

export interface ReceiptLine extends Sys { itemId: string; qty: number; price: number; taxRate: number }
export interface Receipt extends Sys {
  id: string;
  grnNo: string;
  poId: string;
  invoiceNo: string;
  invoiceDate: string;
  receivedDate: string;
  lines: ReceiptLine[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  advanceAdjusted: number;
  payable: number;
  accepted: boolean;
  acceptedDate?: string;
  invoiceFile?: string;
  createdBy: string;
}

export interface Payment extends Sys {
  id: string;
  poId?: string;
  receiptId?: string;
  openingId?: string;
  kind: 'advance' | 'invoice' | 'opening';
  amount: number;
  date: string;
  screenshot?: string; // Drive file id
  paidBy?: string;
}

export interface OpeningBalance extends Sys { id: string; vendorId: string; ref: string; amount: number; dueDate: string }

export interface PriceQuery extends Sys {
  id: string;
  poId: string;
  itemId: string;
  note: string;
  raisedBy: string;
  date: string;
  status: 'Open' | 'Resolved';
}

export interface AppState {
  items: Item[];
  vendors: Vendor[];
  pos: PurchaseOrder[];
  receipts: Receipt[];
  payments: Payment[];
  openings: OpeningBalance[];
  queries: PriceQuery[];
}

export interface User {
  loginId: string;
  name: string;
  role: Role;
  department: string;
  level: number;
  permissions: string[];
}

export interface ApprovalRule { step: number; fromValue: number; approverRole: string; description?: string }
export interface RoleInfo { role: string; level: number; department: string; description: string }
