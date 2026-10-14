import { Fragment, useState } from 'react';
import { actions, useAuth, useSnap, useStore } from '../store';
import { brandsInStock, fifo, fifoPreview, fifoValue, isLowStock, itemName, knownBrands, ledger, onOrder, stockOnHand } from '../domain';
import { brandLabel, normBrand } from '../shared/keys';
import { Card, DateInput, Empty, Field, run } from '../ui';
import { fmtDate, num, today } from '../utils';

const DEPTS = ['Production', 'Cutting', 'Stitching', 'Assembly', 'Packing', 'Maintenance', 'Sampling'];

const money = (v: { value: number; unknown: boolean }) => <>{num(v.value)}{v.unknown && <span title="Some stock has no cost (opening stock without a unit cost)" className="bad"> *</span>}</>;

/** Stock on hand (per item, with a breakdown per brand) + the in/out log. Stock IN comes from goods receipts; OUT and corrections are entered here. */
export default function Stock() {
  const s = useStore();
  const snap = useSnap();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [type, setType] = useState('');
  const [limit, setLimit] = useState(100);
  const items = s.items.filter(i => i.active && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const f = fifo(s);
  const log = ledger(s).filter(m => (!filter || m.itemId === filter) && (!type || m.type === type));

  return (
    <>
      <h2>Stock</h2>
      {snap.partial && <div className="note">Balances include everything; the log below shows movements since {fmtDate(snap.cutoff)}. Use “Load full history” (top bar) to see older ones.</div>}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {can('stock.issue') && <IssueForm />}
        {can('stock.adjust') && <AdjustForm />}
      </div>

      <Card title="Stock on hand">
        <div className="row" style={{ marginBottom: 8 }}><input placeholder="Search items…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {items.length === 0 ? <Empty>No items yet. The Admin adds items under “Items & Prices”.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Item</th><th>Brand</th><th>Unit</th><th className="r">On hand</th><th className="r">FIFO value (₹)</th><th className="r">On order (pending from vendors)</th><th className="r">Min</th><th></th></tr></thead>
            <tbody>{items.map(i => {
              const all = brandsInStock(s, i.id);
              const brands = all.filter(b => stockOnHand(s, i.id, b) !== 0 || all.length === 1);
              const named = brands.filter(Boolean);
              const split = brands.length > 1;               // several brands (or branded + unbranded): show a line for each
              const single = !split && named.length === 1;    // exactly one brand: show it on the item's own line
              const low = isLowStock(s, i);
              return (
                <Fragment key={i.id}>
                  <tr className={low ? 'hl' : ''}>
                    <td><b>{i.name}</b></td>
                    <td>{single ? <span className="brandtag" style={{ marginLeft: 0 }}>{named[0]}</span> : split ? <span className="mut">{brands.length} brands</span> : <span className="mut">—</span>}</td>
                    <td>{i.unit}</td><td className="r"><b>{num(stockOnHand(s, i.id))}</b></td><td className="r">{money(fifoValue(f, i.id))}</td><td className="r">{onOrder(s, i.id) ? <b>{num(onOrder(s, i.id))}</b> : <span className="mut">—</span>}</td><td className="r">{i.minStock || '—'}</td>
                    <td>{low && <span className="bad">Low stock</span>}</td>
                  </tr>
                  {split && brands.map(b => (
                    <tr key={i.id + '|' + b} className="sub">
                      <td></td><td><span className="brandtag" style={{ marginLeft: 0 }}>{brandLabel(b)}</span></td><td className="mut">{i.unit}</td><td className="r">{num(stockOnHand(s, i.id, b))}</td><td className="r">{money(fifoValue(f, i.id, b))}</td><td className="r">{onOrder(s, i.id, b) ? num(onOrder(s, i.id, b)) : <span className="mut">—</span>}</td><td></td><td></td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Card title="FIFO batches (oldest is issued first)">
        {(() => {
          const rows = Object.entries(f.batches).flatMap(([k, bs]) => bs.filter(b => b.remaining > 0).map((b, n) => ({ k, b, n })))
            .filter(({ k }) => items.some(i => k.startsWith(i.id + '|')) && (!filter || k.startsWith(filter + '|')));
          if (rows.length === 0) return <Empty>No stock on the shelf.</Empty>;
          return (
            <div className="tablewrap"><table>
              <thead><tr><th>Item</th><th>Brand</th><th>Received</th><th>Reference</th><th className="r">Qty left</th><th className="r">Unit price</th><th className="r">Value</th></tr></thead>
              <tbody>{rows.map(({ k, b, n }) => {
                const [id, br] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
                return (
                  <tr key={k + n}><td>{itemName(s, id)}</td><td>{br ? <span className="brandtag" style={{ marginLeft: 0 }}>{brandLabel(br)}</span> : <span className="mut">—</span>}</td>
                    <td>{b.date ? fmtDate(b.date) : '—'}</td><td className="mut">{b.ref}</td><td className="r">{num(b.remaining)}{b.remaining !== b.qty && <span className="mut"> of {num(b.qty)}</span>}</td>
                    <td className="r">{b.unknownCost ? <span className="bad">no cost</span> : num(b.price)}</td><td className="r">{num(b.remaining * b.price)}</td></tr>
                );
              })}</tbody>
            </table></div>
          );
        })()}
      </Card>

      <Card title="Stock in / out log">
        <div className="row" style={{ marginBottom: 8 }}>
          <select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All items</option>{s.items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <select value={type} onChange={e => setType(e.target.value)}><option value="">IN + OUT + ADJUST</option><option value="IN">IN (goods received)</option><option value="OUT">OUT (issued)</option><option value="ADJUST">ADJUST</option></select>
        </div>
        {log.length === 0 ? <Empty>No movements.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Date</th><th>Item</th><th>Brand</th><th>Type</th><th className="r">Qty</th><th>Reference / issued to</th><th className="r">FIFO cost (₹)</th><th>Note</th><th>By</th></tr></thead>
            <tbody>{log.slice(0, limit).map(m => (
              <tr key={m.key}><td className="nw">{fmtDate(m.date)}</td><td>{itemName(s, m.itemId)}</td><td>{normBrand(m.brand) ? <span className="brandtag" style={{ marginLeft: 0 }}>{normBrand(m.brand)}</span> : <span className="mut">—</span>}</td>
                <td><span className={m.type === 'IN' ? 'ok' : m.type === 'OUT' ? 'bad' : 'mut'}>{m.type}</span></td>
                <td className="r">{m.type === 'OUT' || (m.type === 'ADJUST' && m.qty < 0) ? '−' : '+'}{num(Math.abs(m.qty))}</td>
                <td>{m.ref}</td><td className="r">{f.cost[m.key] !== undefined ? num(f.cost[m.key]) : ''}</td><td className="mut">{m.note}</td><td className="mut">{m.by}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {log.length > limit && <button className="btn sm" onClick={() => setLimit(limit + 200)}>Show more ({log.length - limit} older)</button>}
      </Card>
    </>
  );
}

/** Brands to choose from when issuing: only those the item actually has stock in. */
function IssueForm() {
  const s = useStore();
  const [itemId, setItemId] = useState('');
  const [brand, setBrand] = useState('');
  const [qty, setQty] = useState(0);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const brands = itemId ? brandsInStock(s, itemId).filter(b => stockOnHand(s, itemId, b) > 0) : [];
  const have = itemId ? stockOnHand(s, itemId, brand) : 0;
  const pickItem = (id: string) => {
    setItemId(id);
    const bs = id ? brandsInStock(s, id).filter(b => stockOnHand(s, id, b) > 0) : [];
    setBrand(bs.length === 1 ? bs[0] : bs.includes('') ? '' : '');
  };
  return (
    <Card title="Issue stock (out)">
      <Field label="Item"><select value={itemId} onChange={e => pickItem(e.target.value)}><option value="">Select…</option>{s.items.filter(i => i.active).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      {itemId && (brands.length > 1 || (brands.length === 1 && brands[0] !== '')) && (
        <Field label="Brand">
          <select value={brand} onChange={e => setBrand(e.target.value)}>
            {brands.length > 1 && !brands.includes(brand) && <option value="">Select brand…</option>}
            {brands.map(b => <option key={b} value={b}>{brandLabel(b)} ({num(stockOnHand(s, itemId, b))} in stock)</option>)}
          </select>
        </Field>
      )}
      {itemId && <p className="mut" style={{ margin: '0 0 8px' }}>On hand{normBrand(brand) ? ` (${normBrand(brand)})` : ''}: <b>{num(have)}</b> {s.items.find(i => i.id === itemId)?.unit}</p>}
      <Field label="Quantity"><input type="number" min={0} value={qty || ''} onChange={e => setQty(+e.target.value)} /></Field>
      {itemId && qty > 0 && (() => {
        const p = fifoPreview(fifo(s), itemId, brand, qty);
        return (
          <div className="note" style={{ margin: '0 0 8px' }}>
            <b>Price is picked automatically – oldest stock first (FIFO)</b>
            {p.parts.map((x, k) => <div key={k}>{num(x.qty)} × ₹{num(x.price)} <span className="mut">{x.ref}</span></div>)}
            <div>Cost of this issue: <b>₹{num(p.cost)}</b>{p.short > 0 && <span className="bad"> · {num(p.short)} more than in stock</span>}</div>
          </div>
        );
      })()}
      <Field label="Issued to (department / purpose)"><input list="depts" value={to} onChange={e => setTo(e.target.value)} /><datalist id="depts">{DEPTS.map(d => <option key={d} value={d} />)}</datalist></Field>
      <Field label="Note (optional)"><input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
      <button className="btn primary" onClick={async () => { if (await run(() => actions.issueStock(itemId, brand, qty, to, note, date))) { setQty(0); setNote(''); } }}>Issue</button>
    </Card>
  );
}

function AdjustForm() {
  const s = useStore();
  const [itemId, setItemId] = useState('');
  const [brand, setBrand] = useState('');
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  return (
    <Card title="Adjust stock (count correction / opening stock)">
      <Field label="Item"><select value={itemId} onChange={e => { setItemId(e.target.value); setBrand(''); }}><option value="">Select…</option>{s.items.filter(i => i.active).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      <Field label="Brand (leave empty if none)">
        <input list="adj-brands" value={brand} onChange={e => setBrand(e.target.value)} />
        <datalist id="adj-brands">{[...new Set([...(itemId ? brandsInStock(s, itemId) : []), ...knownBrands(s, itemId || undefined)])].filter(Boolean).map(b => <option key={b} value={b} />)}</datalist>
      </Field>
      <Field label="Quantity (+ adds, − removes)"><input type="number" value={qty || ''} onChange={e => setQty(+e.target.value)} /></Field>
      {qty > 0 && <p className="mut" style={{ margin: '0 0 8px' }}>Cost is picked automatically (latest purchase price, else the price list) – nothing to enter.</p>}
      <Field label="Reason"><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Opening stock, damaged, count correction" /></Field>
      <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
      <button className="btn primary" onClick={async () => { if (await run(() => actions.adjustStock(itemId, brand, qty, note, date))) { setQty(0); setNote(''); } }}>Save adjustment</button>
    </Card>
  );
}
