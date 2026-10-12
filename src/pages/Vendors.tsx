import { useState } from 'react';
import { actions, useAuth, useStore } from '../store';
import { itemName } from '../domain';
import { Badge, Card, Empty, Field, Link, run } from '../ui';
import { fmtDate, inr } from '../utils';
import { Vendor } from '../types';

type Draft = Omit<Vendor, 'id'> & { id?: string };
const blank: Draft = {
  name: '', contact: '', email: '', whatsapp: '', msme: false, msmeType: '', udyamNo: '', gstin: '', pan: '', address: '', city: '', state: '',
  paymentTermsDays: 30, bankName: '', accountNo: '', ifsc: '', active: true, items: [],
};

export default function Vendors() {
  const s = useStore();
  const { can } = useAuth();
  const ho = can('master.manage');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [newItem, setNewItem] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [q, setQ] = useState('');
  const open = s.queries.filter(x => x.status === 'Open');
  const list = s.vendors.filter(v => !q || `${v.name} ${v.udyamNo} ${v.gstin} ${v.city}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Vendors &amp; Prices (master data)</h2>
        {ho && <button className="btn primary" onClick={() => setEditing({ ...blank })}>+ New vendor</button>}
      </div>
      {!ho && <div className="note">Master data is managed by Head Office. You can view it here; prices can only be changed by HO.</div>}
      <div className="note">This list is the <b>Vendors</b> and <b>VendorItems</b> tabs of the Google Sheet – you can also edit it there directly and press Refresh.</div>

      {ho && open.length > 0 && (
        <Card title={`Price queries from Inventory / Purchase (${open.length})`}>
          <table><tbody>{open.map(x => (
            <tr key={x.id}><td><Link to={`/pos/${x.poId}`}>{s.pos.find(p => p.id === x.poId)?.poNo}</Link></td><td>{itemName(s, x.itemId)}</td><td>{x.note}</td>
              <td className="mut">{x.raisedBy}, {fmtDate(x.date)}</td><td className="r"><button className="btn sm" onClick={() => run(() => actions.resolveQuery(x.id))}>Mark resolved</button></td></tr>
          ))}</tbody></table>
        </Card>
      )}

      {editing && <VendorEditor v={editing} onClose={() => setEditing(null)} />}

      <div className="row" style={{ marginBottom: 12 }}><input placeholder="Search vendor, Udyam, GSTIN, city…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 280 }} /></div>
      {list.map(v => (
        <Card key={v.id} title={<>{v.name} {v.msme && <Badge>MSME</Badge>} {!v.active && <Badge>Rejected</Badge>}</>} actions={ho && <button className="btn sm" onClick={() => setEditing(structuredClone(v))}>Edit</button>}>
          <div className="form2">
            <p className="mut" style={{ margin: '0 0 8px' }}>{v.contact} · {v.email} · WhatsApp {v.whatsapp}<br />{[v.address, v.city, v.state].filter(Boolean).join(', ')}</p>
            <p className="mut" style={{ margin: '0 0 8px' }}>
              {v.msme ? <>Udyam <b>{v.udyamNo || 'missing'}</b> ({v.msmeType || 'type not set'})<br /></> : null}
              GSTIN {v.gstin || '—'} · PAN {v.pan || '—'} · Terms {v.paymentTermsDays} days<br />
              Bank {v.bankName || '—'} · A/c {v.accountNo || '—'} · IFSC {v.ifsc || '—'}
            </p>
          </div>
          {v.items.length === 0 ? <Empty>No items linked.</Empty> : (
            <table style={{ maxWidth: 520 }}><thead><tr><th>Item</th><th className="r">Agreed price</th></tr></thead>
              <tbody>{v.items.map(i => <tr key={i.itemId}><td>{itemName(s, i.itemId)}</td><td className="r">{inr(i.price)}</td></tr>)}</tbody></table>
          )}
        </Card>
      ))}
      {list.length === 0 && <Empty>No vendors found.</Empty>}

      <Card title="Item master">
        <p>{s.items.map(i => `${i.name} (${i.unit})`).join(' · ') || 'No items yet.'}</p>
        {ho && (
          <div className="row">
            <input placeholder="New item name" value={newItem} onChange={e => setNewItem(e.target.value)} />
            <input placeholder="Unit" style={{ width: 80 }} value={unit} onChange={e => setUnit(e.target.value)} />
            <button className="btn" onClick={async () => { if (newItem.trim() && await run(() => actions.addItem(newItem.trim(), unit || 'pcs'))) setNewItem(''); }}>Add item</button>
          </div>
        )}
      </Card>
    </>
  );
}

function VendorEditor({ v, onClose }: { v: Draft; onClose: () => void }) {
  const s = useStore();
  const [d, setD] = useState(v);
  const [saving, setSaving] = useState(false);
  const f = (key: keyof Draft, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label}><input value={String(d[key] ?? '')} onChange={e => setD({ ...d, [key]: e.target.value })} {...props} /></Field>
  );
  const priceOf = (id: string) => d.items.find(i => i.itemId === id)?.price;
  const setPrice = (id: string, price: number | undefined) =>
    setD({ ...d, items: price === undefined ? d.items.filter(i => i.itemId !== id) : d.items.some(i => i.itemId === id) ? d.items.map(i => i.itemId === id ? { ...i, price } : i) : [...d.items, { itemId: id, price }] });
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
        <Field label="Active"><select value={d.active ? 'Yes' : 'No'} onChange={e => setD({ ...d, active: e.target.value === 'Yes' })}><option>Yes</option><option>No</option></select></Field>
      </div>
      <table style={{ maxWidth: 520, marginBottom: 12 }}>
        <thead><tr><th>Item</th><th className="r">Agreed price (blank = not supplied)</th></tr></thead>
        <tbody>{s.items.map(i => (
          <tr key={i.id}><td>{i.name}</td><td className="r"><input type="number" min={0} style={{ width: 120 }} value={priceOf(i.id) ?? ''} onChange={e => setPrice(i.id, e.target.value === '' ? undefined : +e.target.value)} /></td></tr>
        ))}</tbody>
      </table>
      <div className="row">
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save vendor'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Card>
  );
}
