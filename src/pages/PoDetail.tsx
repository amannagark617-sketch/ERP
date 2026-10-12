import { useState } from 'react';
import { actions, useRole, useStore } from '../store';
import {
  advancePaid, displayStatus, isDelayed, itemName, outstanding, paidTotal, pendingQty, poValue,
  receiptBalance, receiptPaid, receiptsOf, receivedQty, receivedValue, vendorOf,
} from '../domain';
import { Badge, Card, Empty, Link, PayForm, Stat, go, run } from '../ui';
import { fmtDate, inr } from '../utils';

export default function PoDetail({ id }: { id: string }) {
  const s = useStore();
  const role = useRole();
  const [remark, setRemark] = useState('');
  const [paying, setPaying] = useState(false);
  const po = s.pos.find(p => p.id === id);
  if (!po) return <p>PO not found. <Link to="/pos">Back to list</Link></p>;
  const vendor = vendorOf(s, po.vendorId)!;
  const sent = po.status === 'Sent to Vendor';
  const canApprove = (role === 'Factory Head' && po.status === 'Pending Factory Head') || (role === 'CA' && po.status === 'Pending CA');
  const poText = `Purchase Order ${po.poNo} – Little Nap Recliners\n` +
    po.lines.map(l => `${itemName(s, l.itemId)}: ${l.qty} x ${l.price}`).join('\n') + `\nTotal: ${poValue(po)}\nExpected delivery: ${po.expectedDate}\nTerms: ${po.terms}`;
  const queries = s.queries.filter(q => q.poId === po.id);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{po.poNo} <Badge>{displayStatus(s, po)}</Badge> {isDelayed(s, po) && <Badge>Delay</Badge>} {po.advanceRequired && po.advanceStatus !== 'Not Required' && <Badge>{po.advanceStatus}</Badge>}</h2>
        <Link to="/pos">← All POs</Link>
      </div>

      <Card title="Details">
        <div className="form2">
          <p><b>Vendor:</b> {vendor.name} {vendor.msme && <Badge>MSME</Badge>}<br /><span className="mut">{vendor.contact} · {vendor.email} · {vendor.whatsapp}</span></p>
          <p><b>PO date:</b> {fmtDate(po.date)}<br /><b>Expected delivery:</b> {fmtDate(po.expectedDate)}</p>
          <p><b>Advance:</b> {po.advanceRequired ? inr(po.advanceAmount) : 'Not required'}<br />{po.sentVia && <><b>Sent via:</b> {po.sentVia} to {po.sentTo}</>}</p>
        </div>
        <p><b>Terms &amp; conditions:</b> {po.terms || <span className="mut">None</span>}</p>
      </Card>

      <Card title="Items">
        <div className="tablewrap"><table>
          <thead><tr><th>Item</th><th className="r">Price</th><th className="r">PO qty</th><th className="r">Received</th><th className="r">Pending</th><th className="r">Amount</th></tr></thead>
          <tbody>{po.lines.map(l => (
            <tr key={l.itemId}><td>{itemName(s, l.itemId)}</td><td className="r">{inr(l.price)}</td><td className="r">{l.qty}</td>
              <td className="r">{receivedQty(s, po.id, l.itemId)}</td><td className="r">{pendingQty(s, po, l.itemId)}</td><td className="r">{inr(l.qty * l.price)}</td></tr>
          ))}<tr className="tot"><td colSpan={5} className="r">PO value (before tax)</td><td className="r">{inr(poValue(po))}</td></tr></tbody>
        </table></div>
      </Card>

      <Card title="Payment tracking">
        <div className="grid">
          <Stat label="PO value" value={inr(poValue(po))} />
          <Stat label="Received (as per invoices)" value={inr(receivedValue(s, po.id))} />
          <Stat label="Already paid" value={inr(paidTotal(s, po.id))} sub={`of which advance ${inr(advancePaid(s, po.id))}`} />
          <Stat label="Outstanding payable" value={inr(outstanding(s, po.id))} tone={outstanding(s, po.id) ? 'amber' : 'green'} />
        </div>
      </Card>

      {/* ---- Role actions ---- */}
      {role === 'Purchase' && (po.status === 'Draft' || po.status === 'Rejected') && (
        <Card title="Next step">
          <div className="row">
            <Link to={`/pos/${po.id}/edit`} className="btn">Edit quantity / terms</Link>
            <button className="btn primary" onClick={() => run(() => actions.submitPO(po.id))}>{po.status === 'Rejected' ? 'Resubmit for approval' : 'Submit for approval'}</button>
          </div>
          {po.status === 'Rejected' && <p className="mut">Price can't be changed here – ask the backend (HO) to update the vendor price list.</p>}
        </Card>
      )}
      {canApprove && (
        <Card title={`Approval – ${role}`}>
          <textarea placeholder="Remark (optional)" value={remark} onChange={e => setRemark(e.target.value)} style={{ width: '100%' }} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={() => run(() => actions.approve(po.id, role, remark))}>Approve</button>
            <button className="btn danger" onClick={() => run(() => actions.reject(po.id, role, remark))}>Not approved</button>
          </div>
        </Card>
      )}
      {role === 'Accounts' && po.advanceStatus === 'Requested' && (
        <Card title="Advance payment request">
          <p>Advance of <b>{inr(po.advanceAmount)}</b> requested for {vendor.name}.</p>
          {!paying ? <button className="btn primary" onClick={() => setPaying(true)}>Record advance payment</button> : (
            <AdvanceForm onCancel={() => setPaying(false)} amount={po.advanceAmount}
              onSubmit={(a, d, shot, full) => run(() => actions.payAdvance(po.id, a, d, full, shot)) && setPaying(false)} />
          )}
        </Card>
      )}
      {role === 'Purchase' && po.status === 'Approved' && (
        <Card title="Send PO to vendor">
          {po.advanceStatus === 'Requested' ? <div className="note">Waiting for Accounts to pay the advance before the PO can go to the vendor.</div> : (
            <>
              <p className="mut">The PO is sent from your ID. Choose the channel; the message opens ready to send, then confirm.</p>
              <div className="row">
                <a className="btn" target="_blank" rel="noreferrer" href={`mailto:${vendor.email}?subject=${encodeURIComponent('Purchase Order ' + po.poNo)}&body=${encodeURIComponent(poText)}`}>Open email</a>
                <button className="btn primary" onClick={() => run(() => actions.sendToVendor(po.id, 'Email'))}>Mark sent via Email</button>
                <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${vendor.whatsapp}?text=${encodeURIComponent(poText)}`}>Open WhatsApp</a>
                <button className="btn primary" onClick={() => run(() => actions.sendToVendor(po.id, 'WhatsApp'))}>Mark sent via WhatsApp</button>
              </div>
            </>
          )}
        </Card>
      )}
      {role === 'Inventory' && sent && pendingTotal(s, po.id) > 0 && (
        <Card title="Goods receipt"><button className="btn primary" onClick={() => go(`/receipts/${po.id}/new`)}>Receive goods against this PO</button></Card>
      )}

      <Card title="Goods receipts & invoices">
        {receiptsOf(s, po.id).length === 0 ? <Empty>No goods received yet.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>GRN</th><th>Invoice</th><th>Received</th><th className="r">Invoice total</th><th className="r">Advance adj.</th><th className="r">Payable</th><th className="r">Paid</th><th className="r">Balance</th><th>Accounts</th></tr></thead>
            <tbody>{receiptsOf(s, po.id).map(r => (
              <tr key={r.id}><td>{r.grnNo}</td><td>{r.invoiceNo}<br /><span className="mut">{fmtDate(r.invoiceDate)}</span></td><td>{fmtDate(r.receivedDate)}</td>
                <td className="r">{inr(r.grandTotal)}</td><td className="r">{inr(r.advanceAdjusted)}</td><td className="r">{inr(r.payable)}</td>
                <td className="r">{inr(receiptPaid(s, r))}</td><td className="r">{inr(receiptBalance(s, r))}</td><td>{r.accepted ? <span className="ok">Accepted</span> : <span className="mut">Awaiting</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      {queries.length > 0 && (
        <Card title="Price queries to backend (HO)">
          <table><tbody>{queries.map(q => <tr key={q.id}><td>{itemName(s, q.itemId)}</td><td>{q.note}</td><td className="mut">{q.raisedBy}, {fmtDate(q.date)}</td><td><Badge>{q.status}</Badge></td></tr>)}</tbody></table>
        </Card>
      )}

      <Card title="History">
        <ul className="timeline">{po.history.map((h, i) => <li key={i}><b>{fmtDate(h.date)}</b> · {h.by} – {h.text}</li>)}</ul>
      </Card>
    </>
  );
}

const pendingTotal = (s: ReturnType<typeof useStore>, poId: string) => {
  const po = s.pos.find(p => p.id === poId)!;
  return po.lines.reduce((a, l) => a + pendingQty(s, po, l.itemId), 0);
};

function AdvanceForm({ amount, onSubmit, onCancel }: {
  amount: number; onSubmit: (a: number, d: string, shot: string | undefined, full: boolean) => void; onCancel: () => void;
}) {
  const [full, setFull] = useState(false);
  return (
    <PayForm defaultAmount={amount} requireShot onCancel={onCancel} submitLabel="Mark paid"
      extra={<label className="field"><span>Status after payment</span>
        <select value={full ? 'full' : 'adv'} onChange={e => setFull(e.target.value === 'full')}>
          <option value="adv">Advance Paid</option><option value="full">Fully Paid</option>
        </select></label>}
      onSubmit={(a, d, shot) => onSubmit(a, d, shot, full)} />
  );
}

