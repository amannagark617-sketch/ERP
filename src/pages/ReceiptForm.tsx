import { useState } from 'react';
import { actions, useRole, useStore } from '../store';
import { advanceAvailable, computeReceipt, itemName, pendingQty, receivedQty, vendorOf } from '../domain';
import { Card, Field, Link, go, run } from '../ui';
import { inr, today } from '../utils';
import { TaxRate } from '../types';

interface Row { itemId: string; selected: boolean; qty: number; poQty: number; tax: TaxRate }

export default function ReceiptForm({ poId }: { poId: string }) {
  const s = useStore();
  const role = useRole();
  const po = s.pos.find(p => p.id === poId);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [receivedDate, setReceivedDate] = useState(today());
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [mismatch, setMismatch] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    (po?.lines ?? []).map(l => ({ itemId: l.itemId, selected: false, qty: pendingQty(s, po!, l.itemId), poQty: l.qty, tax: 18 })));
  const [queryNote, setQueryNote] = useState('');

  if (!po) return <p>PO not found.</p>;
  if (role !== 'Inventory') return <div className="note">Goods receipt is done by Inventory (Factory). Switch role at the top.</div>;
  if (po.status !== 'Sent to Vendor') return <div className="warn">This PO has not been sent to the vendor yet.</div>;

  const vendor = vendorOf(s, po.vendorId)!;
  const price = (itemId: string) => po.lines.find(l => l.itemId === itemId)!.price;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const picked = rows.filter(r => r.selected && r.qty > 0);
  const totals = computeReceipt(picked.map(r => ({ qty: r.qty, price: price(r.itemId), taxRate: r.tax })));
  const advance = Math.min(totals.grandTotal, advanceAvailable(s, po.id));
  const diff = Math.round((totals.grandTotal - invoiceTotal) * 100) / 100;
  const matches = Math.abs(diff) <= 1;

  const submit = () => {
    if (run(() => actions.createReceipt({
      poId: po.id, invoiceNo, invoiceDate, receivedDate, invoiceTotal,
      lines: picked.map(r => ({ itemId: r.itemId, qty: r.qty, taxRate: r.tax, poQty: mismatch ? r.poQty : undefined })),
    }))) go(`/pos/${po.id}`);
  };
  const refer = (itemId: string) => {
    if (!queryNote.trim()) { alert('Describe the price difference first'); return; }
    run(() => actions.raiseQuery(po.id, itemId, queryNote.trim(), 'Inventory'));
    alert('Referred to the backend (HO).');
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Receive goods – {po.poNo}</h2><Link to="/receipts">← Back</Link></div>
      <p className="mut">{vendor.name}</p>
      <Card title="Invoice details">
        <div className="form2">
          <Field label="Invoice number"><input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} /></Field>
          <Field label="Invoice date"><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></Field>
          <Field label="Received date (Factory In)"><input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} /></Field>
          <Field label="Invoice grand total (as printed)"><input type="number" min={0} step="0.01" value={invoiceTotal || ''} onChange={e => setInvoiceTotal(+e.target.value)} /></Field>
        </div>
      </Card>
      <Card title="Items received" actions={
        <label className="row"><input type="checkbox" checked={mismatch} onChange={e => setMismatch(e.target.checked)} /> PO and invoice do not match (allows editing PO quantity)</label>}>
        <div className="tablewrap"><table>
          <thead><tr><th></th><th>Item</th><th className="r">Price (locked)</th><th className="r">PO qty</th><th className="r">Already received</th><th className="r">Received now</th><th>Tax</th><th className="r">Amount</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.itemId}>
              <td><input type="checkbox" checked={r.selected} onChange={e => set(i, { selected: e.target.checked })} /></td>
              <td>{itemName(s, r.itemId)}</td>
              <td className="r">{inr(price(r.itemId))}</td>
              <td className="r">{mismatch ? <input type="number" min={0} style={{ width: 80 }} value={r.poQty} onChange={e => set(i, { poQty: +e.target.value })} /> : r.poQty}</td>
              <td className="r">{receivedQty(s, po.id, r.itemId)}</td>
              <td className="r"><input type="number" min={0} style={{ width: 80 }} value={r.qty} disabled={!r.selected} onChange={e => set(i, { qty: +e.target.value })} /></td>
              <td><select value={r.tax} disabled={!r.selected} onChange={e => set(i, { tax: +e.target.value as TaxRate })}><option value={0}>0% (Nil)</option><option value={5}>5%</option><option value={18}>18%</option></select></td>
              <td className="r">{r.selected ? inr(r.qty * price(r.itemId)) : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {mismatch && (
          <div className="note" style={{ marginTop: 12 }}>
            Price can't be changed here. If the invoice price differs, refer it to the backend (HO):
            <div className="row" style={{ marginTop: 6 }}>
              <input placeholder="e.g. Invoice shows 2,500 vs PO 2,400" value={queryNote} onChange={e => setQueryNote(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
              {rows.filter(r => r.selected).map(r => <button key={r.itemId} className="btn sm" onClick={() => refer(r.itemId)}>Refer {itemName(s, r.itemId)}</button>)}
            </div>
          </div>
        )}
      </Card>
      <Card title="Totals">
        <table style={{ maxWidth: 440 }}><tbody>
          <tr><td>Sub-total</td><td className="r">{inr(totals.subtotal)}</td></tr>
          <tr><td>Tax</td><td className="r">{inr(totals.taxTotal)}</td></tr>
          <tr className="tot"><td>Grand total (system)</td><td className="r">{inr(totals.grandTotal)}</td></tr>
          <tr><td>Less: advance already paid</td><td className="r">− {inr(advance)}</td></tr>
          <tr className="tot"><td>Balance payable to Accounts</td><td className="r">{inr(totals.grandTotal - advance)}</td></tr>
        </tbody></table>
        {invoiceTotal > 0 && (matches
          ? <p className="ok">✓ Matches the invoice total.</p>
          : <p className="bad">Does not match the invoice by {inr(Math.abs(diff))}. Fix quantity / tax, edit the PO quantity if the invoice differs, or refer a price difference to HO.</p>)}
        <button className="btn primary" disabled={!picked.length} onClick={submit}>Save goods receipt</button>
      </Card>
    </>
  );
}
