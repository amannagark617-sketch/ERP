import { useState } from 'react';
import { actions, useRole, useStore } from '../store';
import { itemName } from '../domain';
import { Badge, Card, Empty, Field, Link, run } from '../ui';
import { fmtDate, inr } from '../utils';
import { Vendor } from '../types';

const blank: Omit<Vendor, 'id'> = { name: '', contact: '', email: '', whatsapp: '', msme: false, paymentTermsDays: 30, items: [] };

export default function Vendors() {
  const s = useStore();
  const role = useRole();
  const ho = role === 'HO';
  const [editing, setEditing] = useState<(Omit<Vendor, 'id'> & { id?: string }) | null>(null);
  const [itemName_, setItemName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const open = s.queries.filter(q => q.status === 'Open');

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Vendors &amp; Prices (backend master)</h2>
        {ho && <button className="btn primary" onClick={() => setEditing({ ...blank })}>+ New vendor</button>}
      </div>
      {!ho && <div className="note">Master data is managed by Head Office. Switch to “Backend / HO” to edit vendors and prices.</div>}

      {ho && open.length > 0 && (
        <Card title={`Price queries from Inventory / Purchase (${open.length})`}>
          <table><tbody>{open.map(q => (
            <tr key={q.id}><td><Link to={`/pos/${q.poId}`}>{s.pos.find(p => p.id === q.poId)?.poNo}</Link></td><td>{itemName(s, q.itemId)}</td><td>{q.note}</td>
              <td className="mut">{q.raisedBy}, {fmtDate(q.date)}</td><td className="r"><button className="btn sm" onClick={() => actions.resolveQuery(q.id)}>Mark resolved</button></td></tr>
          ))}</tbody></table>
        </Card>
      )}

      {editing && <VendorEditor v={editing} onClose={() => setEditing(null)} />}

      {s.vendors.map(v => (
        <Card key={v.id} title={<>{v.name} {v.msme && <Badge>MSME</Badge>}</>} actions={ho && <button className="btn sm" onClick={() => setEditing(structuredClone(v))}>Edit</button>}>
          <p className="mut">{v.contact} · {v.email} · WhatsApp {v.whatsapp} · Payment terms {v.paymentTermsDays} days</p>
          {v.items.length === 0 ? <Empty>No items linked.</Empty> : (
            <table style={{ maxWidth: 520 }}><thead><tr><th>Item</th><th className="r">Agreed price</th></tr></thead>
              <tbody>{v.items.map(i => <tr key={i.itemId}><td>{itemName(s, i.itemId)}</td><td className="r">{inr(i.price)}</td></tr>)}</tbody></table>
          )}
        </Card>
      ))}

      <Card title="Item master">
        <p>{s.items.map(i => `${i.name} (${i.unit})`).join(' · ')}</p>
        {ho && (
          <div className="row">
            <input placeholder="New item name" value={itemName_} onChange={e => setItemName(e.target.value)} />
            <input placeholder="Unit" style={{ width: 80 }} value={unit} onChange={e => setUnit(e.target.value)} />
            <button className="btn" onClick={() => { if (itemName_.trim()) { actions.addItem(itemName_.trim(), unit || 'pcs'); setItemName(''); } }}>Add item</button>
          </div>
        )}
      </Card>
    </>
  );
}

function VendorEditor({ v, onClose }: { v: Omit<Vendor, 'id'> & { id?: string }; onClose: () => void }) {
  const s = useStore();
  const [d, setD] = useState(v);
  const priceOf = (id: string) => d.items.find(i => i.itemId === id)?.price;
  const setPrice = (id: string, price: number | undefined) =>
    setD({ ...d, items: price === undefined ? d.items.filter(i => i.itemId !== id) : d.items.some(i => i.itemId === id) ? d.items.map(i => i.itemId === id ? { ...i, price } : i) : [...d.items, { itemId: id, price }] });
  return (
    <Card title={d.id ? 'Edit vendor' : 'New vendor'}>
      <div className="form2">
        <Field label="Vendor name"><input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Contact person"><input value={d.contact} onChange={e => setD({ ...d, contact: e.target.value })} /></Field>
        <Field label="Email"><input type="email" value={d.email} onChange={e => setD({ ...d, email: e.target.value })} /></Field>
        <Field label="WhatsApp (with country code)"><input value={d.whatsapp} onChange={e => setD({ ...d, whatsapp: e.target.value })} /></Field>
        <Field label="Payment terms (days)"><input type="number" min={0} value={d.paymentTermsDays} onChange={e => setD({ ...d, paymentTermsDays: +e.target.value })} /></Field>
        <Field label="MSME vendor?"><select value={d.msme ? 'Yes' : 'No'} onChange={e => setD({ ...d, msme: e.target.value === 'Yes' })}><option>No</option><option>Yes</option></select></Field>
      </div>
      <table style={{ maxWidth: 520, marginBottom: 12 }}>
        <thead><tr><th>Item</th><th className="r">Agreed price (blank = not supplied)</th></tr></thead>
        <tbody>{s.items.map(i => (
          <tr key={i.id}><td>{i.name}</td><td className="r"><input type="number" min={0} style={{ width: 120 }} value={priceOf(i.id) ?? ''} onChange={e => setPrice(i.id, e.target.value === '' ? undefined : +e.target.value)} /></td></tr>
        ))}</tbody>
      </table>
      <div className="row">
        <button className="btn primary" onClick={() => { if (!d.name.trim()) { alert('Enter the vendor name'); return; } if (run(() => actions.saveVendor(d))) onClose(); }}>Save vendor</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Card>
  );
}
