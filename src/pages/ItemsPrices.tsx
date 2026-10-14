import { useState } from 'react';
import { actions, useAuth, useStore } from '../store';
import { cheapestPerBrand, knownBrands, offersFor, lineName, poOf, vendorOf } from '../domain';
import { normBrand, sameBrand } from '../shared/keys';
import { Badge, Card, Empty, Field, Link, run } from '../ui';
import { inr } from '../utils';
import { Item } from '../types';

/** Item-centric view of the Prices tab: who sells each item, at what price, cheapest first. */
export default function ItemsPrices() {
  const s = useStore();
  const { can } = useAuth();
  const ho = can('master.manage');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const list = s.items.filter(i => (showInactive || i.active) && (!q || `${i.name} ${i.category}`.toLowerCase().includes(q.toLowerCase())));
  const queries = s.pos.flatMap(p => p.lines.filter(l => l.queryStatus === 'Open').map(l => ({ po: p, line: l })));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Items &amp; Prices</h2>
        {ho && <button className="btn primary" onClick={() => setAdding(true)}>+ New item</button>}
      </div>
      <div className="note">One row per item. The vendors who sell it are listed <b>cheapest first</b>. A PO always uses the price of the vendor it is raised on.</div>

      {ho && queries.length > 0 && (
        <Card title={`Price queries from Inventory / Purchase (${queries.length})`}>
          <table><tbody>{queries.map(({ po, line }) => (
            <tr key={po.id + line.itemId + line.brand}><td><Link to={`/pos/${po.id}`}>{po.poNo}</Link></td><td>{lineName(s, line)}</td><td>PO price {inr(line.price)}</td><td>{line.queryNote}</td>
              <td className="mut">{line.queryBy}</td><td className="r"><button className="btn sm" onClick={() => run(() => actions.resolveQuery(po.id, line))}>Mark resolved</button></td></tr>
          ))}</tbody></table>
          <p className="mut">Update the vendor's price below if the new price is agreed; open POs keep the price they were raised with.</p>
        </Card>
      )}

      {adding && <ItemEditor item={{ name: '', unit: 'pcs', category: '', minStock: 0, active: true }} onClose={() => setAdding(false)} />}

      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Search items…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <label className="row"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> show archived</label>
      </div>
      <Card>
        {list.length === 0 ? <Empty>{s.items.length === 0 ? 'No items yet. Add your first item.' : 'No items found.'}</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Item</th><th>Unit</th><th>Vendors &amp; prices (cheapest first)</th><th></th></tr></thead>
            <tbody>{list.map(i => {
              const offers = offersFor(s, i.id);
              const best = cheapestPerBrand(offers);
              const brands = new Set(offers.map(o => o.brand.toLowerCase()));
              return (
                <tr key={i.id} style={{ verticalAlign: 'top' }}>
                  <td><b>{i.name}</b> {!i.active && <Badge>Rejected</Badge>}<div className="mut" style={{ fontSize: 12 }}>{i.category}{i.minStock ? ` · min stock ${i.minStock}` : ''}</div></td>
                  <td>{i.unit}</td>
                  <td>
                    {offers.length === 0 ? <span className="mut">No vendor yet</span> : offers.map(o => {
                      const star = best.get(o.brand.toLowerCase()) === o && offers.filter(x => sameBrand(x.brand, o.brand)).length > 1;
                      return (
                        <div key={o.vendor.id + '|' + o.brand}>{star ? '★ ' : ''}<b>{inr(o.price)}</b> · {o.vendor.name}
                          {o.brand ? <span className="brandtag">{o.brand}</span> : brands.size > 1 ? <span className="mut"> (no brand)</span> : null}
                          {star && <span className="ok"> cheapest{brands.size > 1 ? ' for this brand' : ''}</span>}</div>
                      );
                    })}
                    {open === i.id && ho && <PriceEditor item={i} />}
                  </td>
                  <td className="r">{ho && <button className="btn sm" onClick={() => setOpen(open === i.id ? undefined : i.id)}>{open === i.id ? 'Close' : 'Edit'}</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}

function ItemEditor({ item, onClose }: { item: Partial<Item> & { name: string }; onClose: () => void }) {
  const [d, setD] = useState(item);
  return (
    <Card title={d.id ? 'Edit item' : 'New item'}>
      <div className="form2">
        <Field label="Item name"><input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Unit"><input value={d.unit ?? ''} onChange={e => setD({ ...d, unit: e.target.value })} /></Field>
        <Field label="Category (optional)"><input value={d.category ?? ''} onChange={e => setD({ ...d, category: e.target.value })} /></Field>
        <Field label="Tax % (blank = standard rate)"><input value={d.tax ?? ''} onChange={e => setD({ ...d, tax: e.target.value })} placeholder="e.g. 18" /></Field>
        <Field label="Min stock (low-stock alert)"><input type="number" min={0} value={d.minStock ?? 0} onChange={e => setD({ ...d, minStock: +e.target.value })} /></Field>
      </div>
      <div className="row">
        <button className="btn primary" onClick={async () => { if (await run(() => actions.saveItem(d))) onClose(); }}>Save item</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Card>
  );
}

function PriceEditor({ item }: { item: Item }) {
  const s = useStore();
  const [vendorId, setVendorId] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState(0);
  const [edit, setEdit] = useState(false);
  const rows = s.vendors.flatMap(v => v.items.filter(x => x.itemId === item.id).map(x => ({ v, x })));
  const inUse = s.pos.some(p => p.lines.some(l => l.itemId === item.id));
  const exists = rows.some(r => r.v.id === vendorId && sameBrand(r.x.brand, brand));
  return (
    <div className="payform" style={{ maxWidth: 'none' }}>
      <b>Prices for {item.name}</b>
      <table style={{ margin: '6px 0' }}>
        <thead><tr><th>Vendor</th><th>Brand</th><th>Price</th><th></th></tr></thead>
        <tbody>
        {rows.map(({ v, x }) => <PriceRow key={v.id + '|' + x.brand} vendorName={v.name} vendorId={v.id} itemId={item.id} brand={x.brand} price={x.price} />)}
        <tr>
          <td><select value={vendorId} onChange={e => setVendorId(e.target.value)}><option value="">Add a vendor…</option>{s.vendors.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></td>
          <td><input list={'brands-' + item.id} placeholder="Brand (optional)" style={{ width: 150 }} value={brand} onChange={e => setBrand(e.target.value)} />
            <datalist id={'brands-' + item.id}>{knownBrands(s, item.id).map(b => <option key={b} value={b} />)}</datalist></td>
          <td><input type="number" min={0} placeholder="Price" style={{ width: 110 }} value={price || ''} onChange={e => setPrice(+e.target.value)} /></td>
          <td><button className="btn sm primary" disabled={!vendorId || !(price >= 0) || exists} title={exists ? 'This vendor already has a price for this brand' : ''}
            onClick={async () => { if (await run(() => actions.setPrice(vendorId, item.id, normBrand(brand), price))) { setVendorId(''); setBrand(''); setPrice(0); } }}>Add</button></td>
        </tr>
        </tbody>
      </table>
      <p className="mut" style={{ margin: '0 0 6px' }}>Same vendor, same item, different brand = a separate row with its own price. Leave Brand empty if the item has no brand.</p>
      <div className="row">
        <button className="btn sm" onClick={() => setEdit(!edit)}>Edit item details</button>
        <button className="btn sm" onClick={() => run(() => actions.saveItem({ id: item.id, name: item.name, active: !item.active }))}>{item.active ? 'Archive item' : 'Restore item'}</button>
      </div>
      {item.active && inUse && <p className="mut" style={{ margin: '6px 0 0' }}>Archiving hides the item from new POs and stock screens; old POs keep it.</p>}
      {edit && <ItemEditor item={item} onClose={() => setEdit(false)} />}
    </div>
  );
}

function PriceRow({ vendorName, vendorId, itemId, brand, price }: { vendorName: string; vendorId: string; itemId: string; brand: string; price: number }) {
  const [p, setP] = useState(price);
  const s = useStore();
  const used = s.pos.filter(x => x.vendorId === vendorId && x.lines.some(l => l.itemId === itemId && sameBrand(l.brand, brand))).map(x => poOf(s, x.id)?.poNo);
  return (
    <tr>
      <td>{vendorName}{vendorOf(s, vendorId)?.msme && ' (MSME)'}</td>
      <td>{brand || <span className="mut">—</span>}</td>
      <td><input type="number" min={0} style={{ width: 110 }} value={p} onChange={e => setP(+e.target.value)} /></td>
      <td className="row">
        <button className="btn sm primary" disabled={p === price} onClick={() => run(() => actions.setPrice(vendorId, itemId, brand, p))}>Save</button>
        <button className="btn sm danger" title={used.length ? `Used on ${used.length} PO(s); those keep their price` : ''} onClick={() => { if (confirm('Remove this vendor price?')) run(() => actions.setPrice(vendorId, itemId, brand, undefined)); }}>Remove</button>
      </td>
    </tr>
  );
}
