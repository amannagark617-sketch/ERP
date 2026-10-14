import { useEffect, useState } from 'react';
import { actions, fetchHistory, uploadFile, useAuth, useStore } from '../store';
import { downloadPdf, makePoPdf } from '../pdf/makePo';
import {
  advancePaid, displayStatus, invoicesOf, isDelayed, itemName, lineName, outstanding, paidTotal, pendingQty, pendingValue, poValue,
  receiptBalance, receiptPaid, receivedQty, receivedValue, vendorOf,
} from '../domain';
import { Badge, Card, Empty, FileLink, Link, PayForm, Stat, go, run } from '../ui';
import { fmtDate, inr } from '../utils';
import { HistoryEntry } from '../types';

export default function PoDetail({ id }: { id: string }) {
  const s = useStore();
  const { can, role, sees } = useAuth();
  const money = sees('Accounts'); // payment details are for Accounts and Admin only
  const [remark, setRemark] = useState('');
  const [paying, setPaying] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const po = s.pos.find(p => p.id === id);
  const version = po?._v;
  // The history lives in the Log tab; fetch it for this PO and again whenever the PO changes.
  useEffect(() => { fetchHistory(id).then(setHistory).catch(() => setHistory([])); }, [id, version]);
  if (!po) return <p>PO not found (it may be an older, settled PO – use “Load full history” in the top bar). <Link to="/pos">Back to list</Link></p>;
  const vendor = vendorOf(s, po.vendorId) ?? ({ name: '(vendor row missing in the Vendors tab)', contact: '', email: '', whatsapp: '', msme: false, msmeType: '', udyamNo: '', gstin: '', city: '' } as NonNullable<ReturnType<typeof vendorOf>>);
  const sent = po.status === 'Sent to Vendor';
  const canApprove = can('po.approve') && po.status === 'Pending ' + role;
  const poText = `Purchase Order ${po.poNo} – Little Nap Recliners\n` +
    po.lines.map(l => `${lineName(s, l)}: ${l.qty} x ${l.price}`).join('\n') + `\nTotal: ${poValue(po)}\nExpected delivery: ${po.expectedDate}\nTerms: ${po.terms}`;
  const queries = po.lines.filter(l => l.queryNote);
  /** Save the exact PDF that goes out (best effort), then record the PO as sent. */
  const markSent = async (via: 'Email' | 'WhatsApp') => {
    setPdfBusy(true);
    let fileId: string | undefined;
    try {
      const f = await makePoPdf(s, po);
      fileId = await uploadFile(new File([f.data as BlobPart], f.filename, { type: 'application/pdf' }), po.poNo);
    } catch (e) { console.warn('Could not archive the PO PDF', e); }
    await run(() => actions.sendToVendor(po.id, via, fileId));
    setPdfBusy(false);
  };
  const pendingTotal = po.lines.reduce((a, l) => a + pendingQty(s, po, l), 0);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{po.poNo || 'New PO'} <Badge>{displayStatus(s, po)}</Badge> {isDelayed(s, po) && <Badge>Delay</Badge>} {po.advanceRequired && po.advanceStatus !== 'Not Required' && <Badge>{po.advanceStatus}</Badge>}</h2>
        <div className="row">
          <button className="btn primary" disabled={pdfBusy} onClick={async () => {
            setPdfBusy(true);
            await run(async () => { const f = await makePoPdf(s, po); downloadPdf(f.data, f.filename); });
            setPdfBusy(false);
          }}>{pdfBusy ? 'Preparing PDF…' : po.status === 'Approved' || sent ? '⬇ Download PO (PDF)' : '⬇ Download draft PDF'}</button>
          <Link to="/pos">← All POs</Link>
        </div>
      </div>

      <Card title="Details">
        <div className="form2">
          <p><b>Vendor:</b> {vendor.name} {vendor.msme && <Badge>MSME</Badge>}<br /><span className="mut">{vendor.contact} · {vendor.email} · {vendor.whatsapp}</span>
            {vendor.msme && <><br /><span className="mut">Udyam: {vendor.udyamNo || '—'} ({vendor.msmeType || 'type not set'})</span></>}<br /><span className="mut">GSTIN {vendor.gstin || '—'} · {vendor.city}</span></p>
          <p><b>PO date:</b> {fmtDate(po.date)}<br /><b>Expected delivery:</b> {fmtDate(po.expectedDate)}</p>
          <p><b>Created by:</b> {po.createdBy} ({po.department})<br /><b>Advance:</b> {po.advanceRequired ? inr(po.advanceAmount) : 'Not required'}<br /><b>Approval route:</b> {po.route.length ? po.route.join(' → ') : '—'}<br />{po.sentVia && <><b>Sent via:</b> {po.sentVia} to {po.sentTo}</>}{po.poFile && <><br /><b>PO copy sent:</b> <FileLink id={po.poFile} label="Open PDF" /></>}</p>
        </div>
        <p><b>Terms &amp; conditions:</b> {po.terms || <span className="mut">None</span>}</p>
      </Card>

      <Card title="Items">
        <div className="tablewrap"><table>
          <thead><tr><th>Item</th><th>Brand</th><th className="r">Price</th><th className="r">PO qty</th><th className="r">Received</th><th className="r">Pending</th><th className="r">Amount</th><th className="r">Pending value</th></tr></thead>
          <tbody>{po.lines.map(l => (
            <tr key={l.itemId + '|' + l.brand}><td>{itemName(s, l.itemId)}</td><td>{l.brand || <span className="mut">—</span>}</td><td className="r">{inr(l.price)}</td><td className="r">{l.qty}</td>
              <td className="r">{receivedQty(s, po.id, l.itemId, l.brand)}</td><td className={'r' + (sent && pendingQty(s, po, l) > 0 ? ' bad' : '')}>{pendingQty(s, po, l)}</td><td className="r">{inr(l.qty * l.price)}</td><td className="r">{pendingQty(s, po, l) > 0 ? inr(pendingQty(s, po, l) * l.price) : '—'}</td></tr>
          ))}<tr className="tot"><td colSpan={6} className="r">PO value (before tax) · still pending from vendor</td><td className="r">{inr(poValue(po))}</td><td className="r">{sent ? inr(pendingValue(s, po)) : '—'}</td></tr></tbody>
        </table></div>
      </Card>

      {money && <Card title="Payment tracking">
        <div className="grid">
          <Stat label="PO value" value={inr(poValue(po))} />
          <Stat label="Received (as per invoices)" value={inr(receivedValue(s, po.id))} sub={sent && pendingTotal > 0 ? `${pendingTotal} unit(s) still pending · ${inr(pendingValue(s, po))} before tax` : undefined} />
          <Stat label="Already paid" value={inr(paidTotal(s, po.id))} sub={`of which advance ${inr(advancePaid(s, po.id))}`} />
          <Stat label="Outstanding payable" value={inr(outstanding(s, po.id))} tone={outstanding(s, po.id) ? 'amber' : 'green'} />
        </div>
      </Card>}

      {/* ---- Role actions ---- */}
      {can('po.save') && (po.status === 'Draft' || po.status === 'Rejected') && (
        <Card title="Next step">
          <div className="row">
            <Link to={`/pos/${po.id}/edit`} className="btn">Edit quantity / terms</Link>
            <button className="btn primary" onClick={() => run(() => actions.submitPO(po.id))}>{po.status === 'Rejected' ? 'Resubmit for approval' : 'Submit for approval'}</button>
          </div>
          {po.status === 'Rejected' && <p className="mut">Price can't be changed here – ask the Admin to update the vendor price list.</p>}
        </Card>
      )}
      {canApprove && (
        <Card title={`Approval – ${role}`}>
          <textarea placeholder="Remark (optional)" value={remark} onChange={e => setRemark(e.target.value)} style={{ width: '100%' }} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={() => run(() => actions.approve(po.id, remark))}>Approve</button>
            <button className="btn danger" onClick={() => run(() => actions.reject(po.id, remark))}>Not approved</button>
          </div>
        </Card>
      )}
      {can('advance.pay') && po.advanceStatus === 'Requested' && (
        <Card title="Advance payment request">
          <p>Advance of <b>{inr(po.advanceAmount)}</b> requested for {vendor.name}.</p>
          {!paying ? <button className="btn primary" onClick={() => setPaying(true)}>Record advance payment</button> : (
            <AdvanceForm onCancel={() => setPaying(false)} amount={po.advanceAmount} folder={po.poNo}
              onSubmit={async (a, d, shot, full) => { if (await run(() => actions.payAdvance(po.id, a, d, full, shot))) setPaying(false); }} />
          )}
        </Card>
      )}
      {can('po.send') && po.status === 'Approved' && (
        <Card title="Send PO to vendor">
          {po.advanceStatus === 'Requested' ? <div className="note">Waiting for Accounts to pay the advance before the PO can go to the vendor.</div> : (
            <>
              <p className="mut">1. <b>Download the PO (PDF)</b> using the button at the top. 2. Open the email / WhatsApp message below and attach the PDF. 3. Press <b>Mark sent</b> – a copy of the PDF is saved in Google Drive against this PO.</p>
              <div className="row">
                <a className="btn" target="_blank" rel="noreferrer" href={`mailto:${vendor.email}?subject=${encodeURIComponent('Purchase Order ' + po.poNo)}&body=${encodeURIComponent(poText + '\n\n(PO PDF attached)')}`}>Open email</a>
                <button className="btn primary" disabled={pdfBusy} onClick={() => markSent('Email')}>Mark sent via Email</button>
                <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${vendor.whatsapp}?text=${encodeURIComponent(poText)}`}>Open WhatsApp</a>
                <button className="btn primary" disabled={pdfBusy} onClick={() => markSent('WhatsApp')}>Mark sent via WhatsApp</button>
              </div>
            </>
          )}
        </Card>
      )}
      {can('receipt.create') && (sent || po.status === 'Approved') && pendingTotal > 0 && (
        <Card title="Goods receipt"><button className="btn primary" onClick={() => go(`/receipts/${po.id}/new`)}>Receive goods against this PO</button></Card>
      )}

      <Card title="Goods receipts & invoices">
        {invoicesOf(s, po.id).length === 0 ? <Empty>No goods received yet.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>GRN</th><th>Invoice</th><th>Received</th><th className="r">Invoice total</th>{money && <><th className="r">Advance adj.</th><th className="r">Payable</th><th className="r">Paid</th><th className="r">Balance</th></>}<th>Accounts</th><th>Invoice copy</th></tr></thead>
            <tbody>{invoicesOf(s, po.id).map(r => (
              <tr key={r.id}><td>{r.grnNo || '…'}</td><td>{r.invoiceNo}<br /><span className="mut">{fmtDate(r.invoiceDate)}</span></td><td className="nw">{fmtDate(r.receivedDate)}</td>
                <td className="r">{inr(r.grandTotal)}</td>{money && <><td className="r">{inr(r.advanceAdjusted)}</td><td className="r">{inr(r.payable)}</td>
                <td className="r">{inr(receiptPaid(s, r))}</td><td className="r">{inr(receiptBalance(s, r))}</td></>}<td>{r.accepted ? <span className="ok">Accepted</span> : <span className="mut">Awaiting</span>}</td><td><FileLink id={r.invoiceFile} /></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      {queries.length > 0 && (
        <Card title="Price queries to the Admin">
          <table><tbody>{queries.map(l => <tr key={l.itemId + '|' + l.brand}><td>{lineName(s, l)}</td><td>{l.queryNote}</td><td className="mut">{l.queryBy}</td><td><Badge>{l.queryStatus === 'Resolved' ? 'Resolved' : 'Open'}</Badge></td></tr>)}</tbody></table>
        </Card>
      )}

      <Card title="History">
        {history === null ? <Empty>Loading…</Empty> : history.length === 0 ? <Empty>No history yet.</Empty> : (
          <ul className="timeline">{history.map(h => <li key={h.id}><b>{fmtDate(h.time.slice(0, 10))}</b> · {h.by} – {h.text}</li>)}</ul>
        )}
      </Card>
    </>
  );
}

function AdvanceForm({ amount, folder, onSubmit, onCancel }: {
  amount: number; folder: string; onSubmit: (a: number, d: string, shot: string | undefined, full: boolean) => unknown; onCancel: () => void;
}) {
  const [full, setFull] = useState(false);
  return (
    <PayForm defaultAmount={amount} folder={folder} requireShot onCancel={onCancel} submitLabel="Mark paid"
      extra={<label className="field"><span>Status after payment</span>
        <select value={full ? 'full' : 'adv'} onChange={e => setFull(e.target.value === 'full')}>
          <option value="adv">Advance Paid</option><option value="full">Fully Paid</option>
        </select></label>}
      onSubmit={(a, d, shot) => onSubmit(a, d, shot, full)} />
  );
}
