import { useState } from 'react';
import { actions, uploadFile, useAuth, useStore } from '../store';
import { advanceAvailable, computeReceipt, itemName, lineName, pendingQty, receivedQty, sameLine, vendorOf } from '../domain';
import { round2 } from '../utils';
import { Card, DateInput, Field, FileInput, Link, go, run } from '../ui';
import { cfg } from '../config';
import { inr, today } from '../utils';

interface Row { itemId: string; brand: string; selected: boolean; qty: number; poQty: number; tax: number }

export default function ReceiptForm({ poId }: { poId: string }) {
  const s = useStore();
  const { can } = useAuth();
  const [file, setFile] = useState<File>();
  const [saving, setSaving] = useState(false);
  const po = s.pos.find(p => p.id === poId);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [receivedDate, setReceivedDate] = useState(today());
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [mismatch, setMismatch] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    (po?.lines ?? []).map(l => ({ itemId: l.itemId, brand: l.brand, selected: pendingQty(s, po!, l) > 0, qty: pendingQty(s, po!, l), poQty: l.qty, tax: cfg.taxRates.includes(18) ? 18 : cfg.taxRates[0] })));
  const [queryNote, setQueryNote] = useState('');

  if (!po) return <p>PO not found.</p>;
  if (!can('receipt.create')) return <div className="note">Goods receipt is done by Inventory (Factory). Your role is not allowed to do this.</div>;
  if (po.status !== 'Sent to Vendor') return <div className="warn">This PO has not been sent to the vendor yet.</div>;

  const vendor = vendorOf(s, po.vendorId)!;
  const price = (r: { itemId: string; brand: string }) => po.lines.find(l => sameLine(l, r))!.price;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const picked = rows.filter(r => r.selected && r.qty > 0);
  const totals = computeReceipt(picked.map(r => ({ qty: r.qty, price: price(r), taxRate: r.tax })));
  const advance = Math.min(totals.grandTotal, advanceAvailable(s, po.id));
  const invTotal = invoiceTotal > 0 ? invoiceTotal : totals.grandTotal; // blank = same as the system total
  const diff = Math.round((totals.grandTotal - invTotal) * 100) / 100;
  const pendingNow = (r: Row) => Math.max(0, r.poQty - receivedQty(s, po.id, r.itemId, r.brand));
  const after = (r: Row) => Math.max(0, round2(pendingNow(r) - (r.selected ? r.qty : 0)));
  const stillQty = rows.reduce((a, r) => a + after(r), 0);
  const stillValue = round2(rows.reduce((a, r) => a + after(r) * price(r), 0));
  const matches = Math.abs(diff) <= cfg.tolerance;

  const submit = async () => {
    const over = picked.find(r => !mismatch && r.qty > pendingNow(r));
    if (over) { alert(`${lineName(s, over)}: you entered more than the pending quantity (${pendingNow(over)})`); return; }
    setSaving(true);
    const ok = await run(async () => {
      const invoiceFile = await uploadFile(file, po.poNo);
      await actions.createReceipt({
        poId: po.id, invoiceNo, invoiceDate, receivedDate, invoiceTotal: invTotal, invoiceFile,
        lines: picked.map(r => ({ itemId: r.itemId, brand: r.brand, qty: r.qty, taxRate: r.tax, poQty: mismatch ? r.poQty : undefined })),
      });
    });
    setSaving(false);
    if (ok) go(`/pos/${po.id}`);
  };
  const refer = async (r: Row) => {
    if (!queryNote.trim()) { alert('Describe the price difference first'); return; }
    if (await run(() => actions.raiseQuery(po.id, { itemId: r.itemId, brand: r.brand }, queryNote.trim()))) alert('Referred to the Admin.');
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Receive goods – {po.poNo}</h2><Link to="/receipts">← Back</Link></div>
      <p className="mut">{vendor.name} · All items of this PO are loaded below. Type the quantity you actually received; anything short stays <b>pending with the vendor</b> and the PO stays open for the balance.</p>
      <Card title="Invoice details">
        <div className="form2">
          <Field label="Invoice number"><input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} /></Field>
          <Field label="Invoice date"><DateInput value={invoiceDate} onChange={setInvoiceDate} /></Field>
          <Field label="Received date (Factory In)"><DateInput value={receivedDate} onChange={setReceivedDate} /></Field>
          <Field label="Invoice grand total (as printed)" hint="Leave blank if it is the same as the system total below"><input type="number" min={0} step="0.01" value={invoiceTotal || ''} onChange={e => setInvoiceTotal(+e.target.value)} /></Field>
          <FileInput onChange={setFile} label="Invoice copy (optional, saved to Google Drive)" />
        </div>
      </Card>
      <Card title="Items received" actions={
        <span className="row">
          <button className="btn sm" onClick={() => setRows(rows.map(r => ({ ...r, selected: pendingNow(r) > 0, qty: pendingNow(r) })))}>Receive everything pending</button>
          <button className="btn sm" onClick={() => setRows(rows.map(r => ({ ...r, selected: false, qty: 0 })))}>Clear</button>
          <label className="row"><input type="checkbox" checked={mismatch} onChange={e => setMismatch(e.target.checked)} /> PO and invoice do not match (allows editing PO quantity)</label>
        </span>}>
        <div className="tablewrap"><table>
          <thead><tr><th></th><th>Item</th><th>Brand</th><th className="r">Price (locked)</th><th className="r">Ordered</th><th className="r">Received before</th><th className="r">Pending</th><th className="r">Received now</th><th className="r">Still pending after</th><th>Tax</th><th className="r">Amount (received)</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.itemId + '|' + r.brand} className={pendingNow(r) === 0 ? 'sub' : ''}>
              <td><input type="checkbox" checked={r.selected} disabled={pendingNow(r) === 0 && !mismatch} onChange={e => set(i, { selected: e.target.checked })} /></td>
              <td>{itemName(s, r.itemId)}</td>
              <td>{r.brand || <span className="mut">—</span>}</td>
              <td className="r">{inr(price(r))}</td>
              <td className="r">{mismatch ? <input type="number" min={0} style={{ width: 80 }} value={r.poQty} onChange={e => set(i, { poQty: +e.target.value })} /> : r.poQty}</td>
              <td className="r">{receivedQty(s, po.id, r.itemId, r.brand)}</td>
              <td className="r">{pendingNow(r)}</td>
              <td className="r"><input type="number" min={0} max={mismatch ? undefined : pendingNow(r)} style={{ width: 80 }} value={r.qty} disabled={!r.selected} onChange={e => set(i, { qty: Math.max(0, +e.target.value) })} /></td>
              <td className={'r' + (after(r) > 0 ? ' bad' : '')}>{pendingNow(r) === 0 ? <span className="ok">complete</span> : after(r) > 0 ? <b>{after(r)} <span className="mut">· {inr(after(r) * price(r))}</span></b> : <span className="ok">0</span>}</td>
              <td><select value={r.tax} disabled={!r.selected} onChange={e => set(i, { tax: +e.target.value })}>{cfg.taxRates.map(x => <option key={x} value={x}>{x === 0 ? '0% (Nil)' : x + '%'}</option>)}</select></td>
              <td className="r">{r.selected ? inr(r.qty * price(r)) : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {mismatch && (
          <div className="note" style={{ marginTop: 12 }}>
            Price can't be changed here. If the invoice price differs, refer it to the Admin:
            <div className="row" style={{ marginTop: 6 }}>
              <input placeholder="e.g. Invoice shows 2,500 vs PO 2,400" value={queryNote} onChange={e => setQueryNote(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
              {rows.filter(r => r.selected).map(r => <button key={r.itemId + '|' + r.brand} className="btn sm" onClick={() => refer(r)}>Refer {lineName(s, r)}</button>)}
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
        <div className={stillQty > 0 ? 'warn' : 'note'} style={{ marginTop: 12 }}>
          {stillQty > 0
            ? <>After this receipt <b>{stillQty}</b> unit(s) are still <b>pending from {vendor.name}</b>, worth <b>{inr(stillValue)}</b> (before tax). The PO stays open for them. You will only owe the vendor for what was received now.</>
            : <>Everything on this PO will be received – the PO will be complete.</>}
        </div>
        {invoiceTotal > 0 && (matches
          ? <p className="ok">✓ Matches the invoice total.</p>
          : <p className="bad">Does not match the invoice by {inr(Math.abs(diff))}. Fix quantity / tax, edit the PO quantity if the invoice differs, or refer a price difference to the Admin.</p>)}
        <button className="btn primary" disabled={!picked.length || saving} onClick={submit}>{saving ? 'Saving…' : 'Save goods receipt'}</button>
      </Card>
    </>
  );
}
