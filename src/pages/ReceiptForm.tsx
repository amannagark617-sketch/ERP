import { useState } from 'react';
import { actions, uploadFile, useAuth, useStore } from '../store';
import { advanceAvailable, computeReceipt, itemName, itemTax, lineName, pendingQty, receivedQty, sameLine, stockOnHand, vendorOf } from '../domain';
import { Card, DateInput, Field, FileInput, Link, go, run } from '../ui';
import { inr, num, round2, today } from '../utils';

interface Row { itemId: string; brand: string; selected: boolean; qty: number; poQty: number; tax: number }

/**
 * Receiving checklist for ONE PO. Every PO line is loaded and listed; the storekeeper ticks what arrived (one tap = received in full),
 * corrects the quantity where less came, and sees at once what stays pending with the vendor.
 * `inline` = shown under the PO on the Goods Receipt desk; otherwise it is a page of its own.
 */
export default function ReceiptForm({ poId, inline, onDone }: { poId: string; inline?: boolean; onDone?: (grn: string) => void }) {
  const s = useStore();
  const { can, sees } = useAuth();
  const [file, setFile] = useState<File>();
  const [saving, setSaving] = useState(false);
  const po = s.pos.find(p => p.id === poId);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [receivedDate, setReceivedDate] = useState(today());
  const [mismatch, setMismatch] = useState(false);
  const [more, setMore] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    (po?.lines ?? []).map(l => ({ itemId: l.itemId, brand: l.brand, selected: false, qty: 0, poQty: l.qty, tax: itemTax(s, l.itemId) })));
  const [queryNote, setQueryNote] = useState('');

  if (!po) return <p>PO not found.</p>;
  if (!can('receipt.create')) return <div className="note">Goods receipt is done by Inventory (Factory). Your role is not allowed to do this.</div>;
  if (po.status !== 'Sent to Vendor' && po.status !== 'Approved') return <div className="warn">This PO is not approved yet, so goods cannot be received against it.</div>;

  const vendor = vendorOf(s, po.vendorId)!;
  const price = (r: { itemId: string; brand: string }) => po.lines.find(l => sameLine(l, r))!.price;
  const pendingNow = (r: Row) => Math.max(0, r.poQty - receivedQty(s, po.id, r.itemId, r.brand));
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setQty = (i: number, q: number) => {
    const r = rows[i];
    const cap = mismatch ? Infinity : pendingNow(r);
    const qty = Math.max(0, Math.min(cap, Number.isFinite(q) ? q : 0));
    set(i, { qty, selected: qty > 0 });
  };
  const after = (r: Row) => Math.max(0, round2(pendingNow(r) - (r.selected ? r.qty : 0)));

  const picked = rows.filter(r => r.selected && r.qty > 0);
  const totals = computeReceipt(picked.map(r => ({ qty: r.qty, price: price(r), taxRate: r.tax })));
  const advance = Math.min(totals.grandTotal, advanceAvailable(s, po.id));
  const invTotal = totals.grandTotal; // the total is always calculated from PO price x received quantity
  const open = rows.filter(r => pendingNow(r) > 0);
  const stillQty = rows.reduce((a, r) => a + after(r), 0);
  const stillValue = round2(rows.reduce((a, r) => a + after(r) * price(r), 0));
  const short = picked.filter(r => after(r) > 0);

  const submit = async () => {
    if (!invoiceNo.trim()) { alert('Enter the invoice / challan number from the vendor’s paper'); return; }
    setSaving(true);
    let grn = '';
    const ok = await run(async () => {
      const invoiceFile = await uploadFile(file, po.poNo);
      await actions.createReceipt({
        poId: po.id, invoiceNo, invoiceDate, receivedDate, invoiceTotal: invTotal, invoiceFile,
        lines: picked.map(r => ({ itemId: r.itemId, brand: r.brand, qty: r.qty, taxRate: r.tax, poQty: mismatch ? r.poQty : undefined })),
      });
      grn = '';
    });
    setSaving(false);
    if (!ok) return;
    if (onDone) onDone(grn); else go(`/pos/${po.id}`);
  };
  const refer = async (r: Row) => {
    if (!queryNote.trim()) { alert('Describe the price difference first'); return; }
    if (await run(() => actions.raiseQuery(po.id, { itemId: r.itemId, brand: r.brand }, queryNote.trim()))) alert('Referred to the Admin.');
  };

  const body = (
    <>
      <div className="recv-bar">
        <div>
          <b>{picked.length}</b> of <b>{open.length}</b> item(s) ticked
          <div className="recv-progress"><i style={{ width: open.length ? `${(picked.length / open.length) * 100}%` : '100%' }} /></div>
        </div>
        <span className="row" style={{ gap: 8 }}>
          <button className="btn sm primary" onClick={() => setRows(rows.map(r => ({ ...r, selected: pendingNow(r) > 0, qty: pendingNow(r) })))}>✓ Everything arrived in full</button>
          <button className="btn sm" onClick={() => setRows(rows.map(r => ({ ...r, selected: false, qty: 0 })))}>Clear</button>
        </span>
      </div>

      <div className="tablewrap"><table className="recv">
        <thead><tr>
          <th></th><th>Item</th><th className="r">Ordered</th><th className="r">Already in</th><th className="r">Pending</th><th>Received now</th>
          <th className="r">Short</th><th className="r">In stock → after</th><th>Tax</th><th className="r">Amount</th>
        </tr></thead>
        <tbody>{rows.map((r, i) => {
          const pend = pendingNow(r);
          const done = pend === 0;
          const have = stockOnHand(s, r.itemId, r.brand);
          return (
            <tr key={r.itemId + '|' + r.brand} className={done ? 'sub' : r.selected ? 'picked' : ''}>
              <td><input type="checkbox" className="big" checked={r.selected} disabled={done && !mismatch}
                onChange={e => (e.target.checked ? setQty(i, pend) : setQty(i, 0))} aria-label={`Received ${lineName(s, r)}`} /></td>
              <td><b>{itemName(s, r.itemId)}</b>{r.brand && <span className="brandtag">{r.brand}</span>}<div className="mut" style={{ fontSize: 12 }}>@ {inr(price(r))}</div></td>
              <td className="r">{mismatch ? <input type="number" min={0} style={{ width: 70 }} value={r.poQty} onChange={e => set(i, { poQty: +e.target.value })} /> : r.poQty}</td>
              <td className="r">{receivedQty(s, po.id, r.itemId, r.brand)}</td>
              <td className="r"><b>{pend}</b></td>
              <td>{done ? <span className="ok">complete</span> : (
                <span className="stepper">
                  <button type="button" onClick={() => setQty(i, r.qty - 1)} aria-label="less">−</button>
                  <input type="number" min={0} max={mismatch ? undefined : pend} value={r.qty || ''} placeholder="0" onChange={e => setQty(i, +e.target.value)} />
                  <button type="button" onClick={() => setQty(i, r.qty + 1)} aria-label="more">+</button>
                  <button type="button" className="full" onClick={() => setQty(i, pend)} title="Received the full pending quantity">All</button>
                </span>
              )}</td>
              <td className="r">{done ? '—' : after(r) > 0 ? <span className="bad"><b>{after(r)}</b><div style={{ fontSize: 12 }}>{inr(after(r) * price(r))}</div></span> : <span className="ok">0</span>}</td>
              <td className="r mut">{num(have)} → <b style={{ color: 'var(--ink)' }}>{num(have + (r.selected ? r.qty : 0))}</b></td>
              <td className="mut">{r.tax}%</td>
              <td className="r">{r.selected ? inr(r.qty * price(r)) : '—'}</td>
            </tr>
          );
        })}</tbody>
      </table></div>

      {mismatch && (
        <div className="note" style={{ marginTop: 12 }}>
          Ordered quantity can now be edited. Price can't be changed here – if the invoice price differs, refer it to the Admin:
          <div className="row" style={{ marginTop: 6 }}>
            <input placeholder="e.g. Invoice shows 2,500 vs PO 2,400" value={queryNote} onChange={e => setQueryNote(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            {picked.map(r => <button key={r.itemId + '|' + r.brand} className="btn sm" onClick={() => refer(r)}>Refer {lineName(s, r)}</button>)}
          </div>
        </div>
      )}

      <div className={'recv-sum ' + (stillQty > 0 && picked.length ? 'short' : '')}>
        {picked.length === 0 ? <span className="mut">Tick the items that arrived (or press “Everything arrived in full”).</span> : stillQty > 0 ? (
          <span><b>{short.length || ''}</b> {short.length ? `item(s) came short – ` : ''}<b>{stillQty}</b> unit(s) stay <b>pending from {vendor.name}</b> · <b>{inr(stillValue)}</b> before tax. The PO stays open for them.</span>
        ) : <span className="ok"><b>Complete:</b> this receipt covers everything pending on the PO.</span>}
        <span className="recv-total">Received: <b>{inr(totals.grandTotal)}</b> <span className="mut">(tax {inr(totals.taxTotal)}{advance > 0 && sees('Accounts') ? `, advance adjusted ${inr(advance)} → payable ${inr(totals.grandTotal - advance)}` : ''})</span></span>
      </div>

      <div className="recv-invoice">
        <Field label="Invoice / challan no. *"><input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="from the vendor’s paper" /></Field>
        <Field label="Received on"><DateInput value={receivedDate} onChange={setReceivedDate} /></Field>
        <button className="btn sm" onClick={() => setMore(!more)}>{more ? '− fewer details' : '+ invoice date, copy'}</button>
        <button className="btn primary big" disabled={!picked.length || saving} onClick={submit}>{saving ? 'Saving…' : `Add to inventory${picked.length ? ` (${picked.length} item${picked.length > 1 ? 's' : ''})` : ''}`}</button>
      </div>
      {more && (
        <div className="form2" style={{ marginTop: 10 }}>
          <Field label="Invoice date"><DateInput value={invoiceDate} onChange={setInvoiceDate} /></Field>
          <FileInput onChange={setFile} label="Invoice copy / photo (optional, saved to Google Drive)" />
          <label className="row"><input type="checkbox" checked={mismatch} onChange={e => setMismatch(e.target.checked)} /> PO and invoice do not match (lets you edit the ordered quantity)</label>
        </div>
      )}
    </>
  );

  if (inline) return <div className="recv-inline">{body}</div>;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Receive goods – {po.poNo}</h2><Link to="/receipts">← Back</Link></div>
      <p className="mut">{vendor.name} · Expected {po.expectedDate}</p>
      <Card>{body}</Card>
    </>
  );
}
