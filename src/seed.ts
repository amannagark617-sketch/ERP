import { AppState } from './types';
import { addDays, today } from './utils';

export function seedState(): AppState {
  const t = today();
  return {
    items: [
      { id: 'i1', name: 'Recliner mechanism (manual)', unit: 'pcs' },
      { id: 'i2', name: 'Recliner mechanism (motorised)', unit: 'pcs' },
      { id: 'i3', name: 'Foam sheet 40D', unit: 'sheet' },
      { id: 'i4', name: 'Leatherette fabric', unit: 'm' },
      { id: 'i5', name: 'Wooden frame set', unit: 'set' },
      { id: 'i6', name: 'Packing carton', unit: 'pcs' },
    ],
    vendors: [
      {
        id: 'v1', name: 'Sharma Mechanisms Pvt Ltd', contact: 'Rakesh Sharma', email: 'sales@sharmamech.example',
        whatsapp: '919800000001', msme: true, paymentTermsDays: 30,
        items: [{ itemId: 'i1', price: 2400 }, { itemId: 'i2', price: 6800 }],
      },
      {
        id: 'v2', name: 'Foam & Fabric Traders', contact: 'Anita Verma', email: 'orders@foamfabric.example',
        whatsapp: '919800000002', msme: false, paymentTermsDays: 45,
        items: [{ itemId: 'i3', price: 1850 }, { itemId: 'i4', price: 420 }],
      },
      {
        id: 'v3', name: 'Kailash Timber Works', contact: 'Kailash Rao', email: 'kailash@timber.example',
        whatsapp: '919800000003', msme: true, paymentTermsDays: 15,
        items: [{ itemId: 'i5', price: 3200 }, { itemId: 'i6', price: 95 }],
      },
    ],
    pos: [
      {
        id: 'po1', poNo: 'PO-0001', date: addDays(t, -20), vendorId: 'v1',
        lines: [{ itemId: 'i1', qty: 200, price: 2400 }], terms: '30 days credit. Delivery at factory gate.',
        advanceRequired: true, advanceAmount: 100000, expectedDate: addDays(t, -5),
        status: 'Sent to Vendor', advanceStatus: 'Advance Paid', sentVia: 'Email', sentTo: 'sales@sharmamech.example',
        history: [
          { date: addDays(t, -20), by: 'Navneet', text: 'PO created and submitted' },
          { date: addDays(t, -19), by: 'Factory Head', text: 'Approved' },
          { date: addDays(t, -18), by: 'Accounts', text: 'Advance paid' },
          { date: addDays(t, -18), by: 'Navneet', text: 'Sent to vendor via Email' },
        ],
      },
      {
        id: 'po2', poNo: 'PO-0002', date: addDays(t, -1), vendorId: 'v2',
        lines: [{ itemId: 'i3', qty: 300, price: 1850 }, { itemId: 'i4', qty: 800, price: 420 }],
        terms: 'Delivery within 10 days.', advanceRequired: false, advanceAmount: 0, expectedDate: addDays(t, 9),
        status: 'Pending Factory Head', advanceStatus: 'Not Required',
        history: [{ date: addDays(t, -1), by: 'Navneet', text: 'PO created and submitted' }],
      },
      {
        id: 'po3', poNo: 'PO-0003', date: t, vendorId: 'v3',
        lines: [{ itemId: 'i5', qty: 100, price: 3200 }], terms: '', advanceRequired: false, advanceAmount: 0,
        expectedDate: addDays(t, 14), status: 'Draft', advanceStatus: 'Not Required',
        history: [{ date: t, by: 'Navneet', text: 'Draft created' }],
      },
    ],
    receipts: [],
    payments: [
      { id: 'pay1', poId: 'po1', kind: 'advance', amount: 100000, date: addDays(t, -18) },
    ],
    openings: [
      { id: 'ob1', vendorId: 'v3', ref: 'Old bill KT-2291 (opening balance)', amount: 85000, dueDate: addDays(t, -12) },
    ],
    queries: [],
    seq: { po: 3, grn: 0 },
  };
}
