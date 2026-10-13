import { useState } from 'react';
import { actions, useAuth, useStore } from '../store';
import { itemName, knownBrands, vendorAccount } from '../domain';
import { normBrand, sameBrand } from '../shared/keys';
import { Badge, Card, Empty, Field, Stat, run } from '../ui';
import { inr } from '../utils';
import { Vendor } from '../types';

type Draft = Omit<Vendor, 'id'> & { id?: string };
const blank: Draft = {
  name: '', contact: '', email: '', whatsapp: '', msme: false, msmeType: '', udyamNo: '', gstin: '', pan: '', address: '', city: '', state: '',
  paymentTermsDays: 30, bankName: '', accountNo: '', ifsc: '', active: true, items: [],
};

export default function Vendors() {
  const s = useStore();
  const { can, sees } = useAuth();
  const ho = can('master.manage');
  const showBank = can('payment.make') || can('master.manage'); // bank details are for Accounts and Admin only
  const [editing, setEditing] = useState<Draft | null>(null);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const list = s.vendors.filter(v => (showInactive || v.active) && (!q || `${v.name} ${v.udyamNo} ${v.gstin} ${v.city}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Vendors</h2>
        {ho && <button className="btn primary" onClick={() => setEditing({ ...blank })}>+ New vendor</button>}
      </div>
      {!ho && <div className="note">Vendor details and prices are managed by the Admin. You can view them here.</div>}

      {editing && <VendorEditor v={editing} onClose={() => setEditing(null)} />}

      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Search vendor, Udyam, GSTIN, city…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 280 }} />
        <label className="row"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> show inactive</label>
      </div>
      {list.map(v => (
        <Card key={v.id} title={<>{v.name} {v.msme && <Badge>MSME</Badge>} {!v.active && <Badge>Rejected</Badge>}</>} actions={ho && <button className="btn sm" onClick={() => setEditing(structuredClone(v))}>Edit</button>}>
          <div className="form2">
            <p className="mut" style={{ margin: '0 0 8px' }}>{v.contact} · {v.email} · WhatsApp {v.whatsapp}<br />{[v.address, v.city, v.state].filter(Boolean).join(', ')}</p>
            <p className="mut" style={{ margin: '0 0 8px' }}>
              {v.msme ? <>Udyam <b>{v.udyamNo || 'missing'}</b> ({v.msmeType || 'type not set'})<br /></> : null}
              GSTIN {v.gstin || '—'} · PAN {v.pan || '—'} · Terms {v.paymentTermsDays} days
              {showBank && <><br />Bank {v.bankName || '—'} · A/c {v.accountNo || '—'} · IFSC {v.ifsc || '—'}</>}
            </p>
          </div>
          {sees('Accounts') && <VendorMoney id={v.id} />}
          {v.items.length === 0 ? <Empty>No items on this vendor's price list.</Empty> : (
            <table style={{ maxWidth: 560 }}><thead><tr><th>Item</th><th>Brand</th><th className="r">Agreed price</th></tr></thead>
              <tbody>{v.items.map(i => <tr key={i.itemId + '|' + i.brand}><td>{itemName(s, i.itemId)}</td><td>{i.brand || <span className="mut">—</span>}</td><td className="r">{inr(i.price)}</td></tr>)}</tbody></table>
          )}
        </Card>
      ))}
      {list.length === 0 && <Empty>No vendors found.</Empty>}
    </>
  );
}

/** Paid / pending summary for one vendor. */
function VendorMoney({ id }: { id: string }) {
  const s = useStore();
  const a = vendorAccount(s, id);
  if (!a.billed && !a.paid && !a.pendingDelivery) return null;
  return (
    <div className="grid" style={{ marginBottom: 10 }}>
      <Stat label="Billed (invoices)" value={inr(a.billed)} />
      <Stat label="Paid" value={inr(a.paid)} tone="green" />
      <Stat label="Pending to pay" value={inr(a.toPay)} tone={a.toPay ? 'amber' : 'green'} sub={a.advanceHeld ? `advance ${inr(a.advanceHeld)} not yet adjusted` : undefined} />
      <Stat label="Goods pending from vendor" value={inr(a.pendingDelivery)} tone={a.pendingDelivery ? 'amber' : ''} sub="open POs, before tax" />
    </div>
  );
}

function VendorEditor({ v, onClose }: { v: Draft; onClose: () => void }) {
  const s = useStore();
  const [d, setD] = useState(v);
  const [saving, setSaving] = useState(false);
  const [addItem, setAddItem] = useState('');
  const [addBrand, setAddBrand] = useState('');
  const [addPrice, setAddPrice] = useState(0);
  const f = (key: keyof Draft, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label}><input value={String(d[key] ?? '')} onChange={e => setD({ ...d, [key]: e.target.value })} {...props} /></Field>
  );
  const setPrice = (itemId: string, brand: string, price: number) => setD({ ...d, items: d.items.map(i => (i.itemId === itemId && sameBrand(i.brand, brand) ? { ...i, price } : i)) });
  const dup = !!addItem && d.items.some(x => x.itemId === addItem && sameBrand(x.brand, addBrand));
  const save = async () => {
    if (!d.name.trim()) return alert('Enter the vendor name');
    if (d.msme && !d.udyamNo.trim() && !confirm('MSME vendor without a Udyam registration number. Save anyway?')) return;
    setSaving(true);
    if (await run(() => actions.saveVendor(d))) onClose();
    setSaving(false);
  };
  return (
    <Card title={d.id ? 'Edit vendor' : 'New vendor'}>
      <div className="form2">
        {f('name', 'Vendor name')}{f('contact', 'Contact person')}{f('email', 'Email', { type: 'email' })}{f('whatsapp', 'WhatsApp (with country code)')}
        {f('address', 'Address')}{f('city', 'City')}{f('state', 'State')}
        {f('gstin', 'GSTIN')}{f('pan', 'PAN')}
        <Field label="Payment terms (days)"><input type="number" min={0} value={d.paymentTermsDays} onChange={e => setD({ ...d, paymentTermsDays: +e.target.value })} /></Field>
        <Field label="MSME vendor?"><select value={d.msme ? 'Yes' : 'No'} onChange={e => setD({ ...d, msme: e.target.value === 'Yes' })}><option>No</option><option>Yes</option></select></Field>
        {d.msme && <>
          <Field label="MSME type"><select value={d.msmeType} onChange={e => setD({ ...d, msmeType: e.target.value })}><option value="">Select…</option><option>Micro</option><option>Small</option><option>Medium</option></select></Field>
          {f('udyamNo', 'Udyam registration no.', { placeholder: 'UDYAM-XX-00-0000000' })}
        </>}
        {f('bankName', 'Bank name')}{f('accountNo', 'Bank account no.')}{f('ifsc', 'IFSC')}
        <Field label="Active" hint="Set to No to stop using this vendor. Old POs are kept."><select value={d.active ? 'Yes' : 'No'} onChange={e => setD({ ...d, active: e.target.value === 'Yes' })}><option>Yes</option><option>No</option></select></Field>
      </div>
      <h3 style={{ margin: '8px 0' }}>This vendor's price list</h3>
      <table style={{ maxWidth: 640, marginBottom: 8 }}>
        <thead><tr><th>Item</th><th>Brand</th><th className="r">Agreed price</th><th></th></tr></thead>
        <tbody>
          {d.items.map(i => (
            <tr key={i.itemId + '|' + i.brand}><td>{itemName(s, i.itemId)}</td><td>{i.brand || <span className="mut">—</span>}</td>
              <td className="r"><input type="number" min={0} style={{ width: 120 }} value={i.price} onChange={e => setPrice(i.itemId, i.brand, +e.target.value)} /></td>
              <td className="r"><button className="btn sm danger" onClick={() => setD({ ...d, items: d.items.filter(x => !(x.itemId === i.itemId && sameBrand(x.brand, i.brand))) })}>Remove</button></td></tr>
          ))}
          <tr>
            <td><select value={addItem} onChange={e => setAddItem(e.target.value)}><option value="">Add an item…</option>{s.items.filter(i => i.active).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></td>
            <td><input list="vendor-brands" placeholder="Brand (optional)" style={{ width: 140 }} value={addBrand} onChange={e => setAddBrand(e.target.value)} />
              <datalist id="vendor-brands">{knownBrands(s, addItem || undefined).map(b => <option key={b} value={b} />)}</datalist></td>
            <td className="r"><input type="number" min={0} style={{ width: 120 }} value={addPrice || ''} placeholder="Price" onChange={e => setAddPrice(+e.target.value)} /></td>
            <td className="r"><button className="btn sm" disabled={!addItem || !(addPrice >= 0) || dup} title={dup ? 'Already on the list with this brand' : ''}
              onClick={() => { setD({ ...d, items: [...d.items, { itemId: addItem, brand: normBrand(addBrand), price: addPrice }] }); setAddItem(''); setAddBrand(''); setAddPrice(0); }}>Add</button></td>
          </tr>
        </tbody>
      </table>
      <p className="mut" style={{ marginTop: 0 }}>A vendor can sell the same item in several brands: add one row per brand, each with its own price.</p>
      <div className="row">
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save vendor'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Card>
  );
}
