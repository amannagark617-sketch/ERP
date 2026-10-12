export type Role = 'Purchase' | 'Factory Head' | 'CA' | 'HO' | 'Accounts' | 'Inventory';
export const ROLES: Role[] = ['Purchase', 'Factory Head', 'CA', 'HO', 'Accounts', 'Inventory'];
export const ROLE_LABEL: Record<Role, string> = {
  Purchase: 'Purchase (Navneet)',
  'Factory Head': 'Factory Head',
  CA: 'CA (Mohit)',
  HO: 'Backend / HO',
  Accounts: 'Accounts',
  Inventory: 'Inventory (Factory)',
};
export const ROLE_USER: Record<Role, string> = {
  Purchase: 'Navneet',
  'Factory Head': 'Factory Head',
  CA: 'Mohit',
  HO: 'HO',
  Accounts: 'Accounts',
  Inventory: 'Inventory',
};

export interface Item { id: string; name: string; unit: string }
export interface VendorItem { itemId: string; price: number }
export interface Vendor {
  id: string;
  name: string;
  contact: string;
  email: string;
  whatsapp: string;
  msme: boolean;
  paymentTermsDays: number;
  items: VendorItem[];
}

export type PoStatus = 'Draft' | 'Pending Factory Head' | 'Pending CA' | 'Rejected' | 'Approved' | 'Sent to Vendor';
export type AdvanceStatus = 'Not Required' | 'Requested' | 'Advance Paid' | 'Fully Paid';

export interface PoLine { itemId: string; qty: number; price: number }
export interface HistoryEntry { date: string; by: string; text: string }
export interface PurchaseOrder {
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
  sentVia?: 'Email' | 'WhatsApp';
  sentTo?: string;
  history: HistoryEntry[];
}

export type TaxRate = 0 | 5 | 18;
export interface ReceiptLine { itemId: string; qty: number; price: number; taxRate: TaxRate }
export interface Receipt {
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
}

export interface Payment {
  id: string;
  poId?: string;
  receiptId?: string;
  openingId?: string;
  kind: 'advance' | 'invoice' | 'opening';
  amount: number;
  date: string;
  screenshot?: string;
}

export interface OpeningBalance {
  id: string;
  vendorId: string;
  ref: string;
  amount: number;
  dueDate: string;
}

export interface PriceQuery {
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
  seq: { po: number; grn: number };
}
