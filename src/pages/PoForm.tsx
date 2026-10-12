import { useState } from 'react';
import { actions, useAuth, useStore } from '../store';
import { approvalRoute, itemOf, offersFor, poValue, vendorOf } from '../domain';
import { Card, Field, go, run } from '../ui';
import { addDays, inr, today } from '../utils';
import { PoLine } from '../types';

export default function PoForm({ id }: { id?: string }) {
  const s = useStore();
  const { can } = useAuth();
  const existing = id ? s.pos.find(p => p.id === id) : undefined;
  const [vendorId, setVendorId] = useState(existing?.vendorId ?? '');
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries((existing?.lines ?? []).map(l => [l.itemId, l.qty])),
  );
  const [terms, setTerms] = useState(existing?.terms ?? '');
  const [adv, setAdv] = useState(existing?.advanceRequired ?? false);
  const [advAmt, setAdvAmt] = useState(existing?.advanceAmount ?? 0);
  const [expected, setExpected] = useState(existing?.expectedDate ?? addDays(today(), 14));

  if (!can('po.save')) return <div className="note">Your role is not allowed to create or edit POs.</div>;
  if (existing && existing.status !== 'Draft' && existing.status !== 'Rejected') return <div className="warn">This PO can no longer be edited.</div>;

  const vendor = vendorOf(s, vendorId);
  const lines: PoLine[] = (vendor?.items ?? []).filter(i => qty[i.itemId] > 0).map(i => ({ itemId: i.itemId, qty: qty[i.itemId], price: i.price }));
  const total = poValue({ lines } as never);
  const input = () => ({ id, vendorId, lines, terms, advanceRequired: adv, advanceAmount: advAmt, expectedDate: expected });
  const save = async (submit: boolean) => {
    let newId = '';
    if (await run(async () => { newId = await actions.savePO(input(), submit); })) go(`/pos/${newId}`);
  };

  return (
    <>
      <h2>{existing ? `Edit ${existing.poNo}` : 'New Purchase Order'}</h2>
      {existing?.status === 'Rejected' && <div className="warn">Not approved. You can edit the quantity and resubmit. If the price needs to change, take it up with the backend (HO).</div>}
      <Card title="Vendor & delivery">
        <div className="form2">
          <Field label="Vendor">
            <select value={vendorId} disabled={!!existing} onChange={e => { setVendorId(e.target.value); setQty({}); }}>
              <option value="">Select vendor…</option>
              {s.vendors.filter(v => v.active || v.id === vendorId).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Expected delivery date"><input type="date" value={expected} onChange={e => setExpected(e.target.value)} /></Field>
        </div>
        {vendor && <p className="mut">Contact: {vendor.contact} · {vendor.email} · WhatsApp {vendor.whatsapp} · Terms {vendor.paymentTermsDays} days{vendor.msme ? ` · MSME ${vendor.msmeType} (${vendor.udyamNo || 'Udyam no. missing'})` : ''}</p>}
      </Card>
      <Card title="Items (price is fixed by the backend and cannot be edited)">
        {!vendor ? <p className="empty">Select a vendor to see its items and prices.</p> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Item</th><th className="r">Price</th><th>Cheaper elsewhere?</th><th className="r">Quantity</th><th className="r">Amount</th></tr></thead>
            <tbody>{vendor.items.filter(vi => itemOf(s, vi.itemId)?.active !== false).map(vi => {
              const cheaper = offersFor(s, vi.itemId).find(o => o.vendor.id !== vendor.id && o.price < vi.price);
              return (
              <tr key={vi.itemId}>
                <td>{itemOf(s, vi.itemId)?.name} <span className="mut">/{itemOf(s, vi.itemId)?.unit}</span></td>
                <td className="r">{inr(vi.price)}</td>
                <td className="mut">{cheaper ? <span className="bad">{inr(cheaper.price)} at {cheaper.vendor.name}</span> : '—'}</td>
                <td className="r"><input type="number" min={0} style={{ width: 90 }} value={qty[vi.itemId] ?? ''} onChange={e => setQty({ ...qty, [vi.itemId]: +e.target.value })} /></td>
                <td className="r">{inr((qty[vi.itemId] || 0) * vi.price)}</td>
              </tr>
            );})}
            <tr className="tot"><td colSpan={4} className="r">PO value (before tax)</td><td className="r">{inr(total)}</td></tr></tbody>
          </table></div>
        )}
        {total > 0 && <p className="mut">Approval route: {approvalRoute({ lines }).join(' → ') || 'none (auto-approved)'} <span className="mut">(from the Roles tab)</span></p>}
      </Card>
      <Card title="Terms & advance">
        <Field label="Terms and conditions"><textarea value={terms} onChange={e => setTerms(e.target.value)} /></Field>
        <div className="form2">
          <Field label="Advance payment required?">
            <select value={adv ? 'Yes' : 'No'} onChange={e => setAdv(e.target.value === 'Yes')}><option>No</option><option>Yes</option></select>
          </Field>
          {adv && <Field label="Advance amount (Rs)"><input type="number" min={0} value={advAmt} onChange={e => setAdvAmt(+e.target.value)} /></Field>}
        </div>
      </Card>
      <div className="row">
        <button className="btn primary" onClick={() => save(true)}>Submit for approval</button>
        <button className="btn" onClick={() => save(false)}>Save as draft</button>
        <button className="btn" onClick={() => go(existing ? `/pos/${existing.id}` : '/pos')}>Cancel</button>
      </div>
    </>
  );
}
