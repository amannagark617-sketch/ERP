import { useState } from 'react';
import { useStore } from '../store';
import { isDelayed, isOpenPO, isReceivable, itemName, pendingValue, receivedQty, totalPending, vendorOf } from '../domain';
import { Badge, Card, Empty, Link, Stat } from '../ui';
import { fmtDate, inr, today } from '../utils';
import ReceiptForm from './ReceiptForm';

/** Receiving desk: waiting POs as cards; open one and its items appear as a checklist right here. */
export default function Receipts() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string>();
  const [done, setDone] = useState('');
  const match = (p: { poNo: string; vendorId: string }) => !q || `${p.poNo} ${vendorOf(s, p.vendorId)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase());
  const waiting = s.pos.filter(p => isReceivable(s, p) && match(p))
    .sort((a, b) => Number(isDelayed(s, b)) - Number(isDelayed(s, a)) || a.expectedDate.localeCompare(b.expectedDate));
  const all = s.pos.filter(p => isReceivable(s, p));
  const grns = s.receipts.filter(r => r.type === 'Invoice').sort((a, b) => b.receivedDate.localeCompare(a.receivedDate) || b.grnNo.localeCompare(a.grnNo));
  const todayCount = grns.filter(r => r.receivedDate === today()).length;

  return (
    <>
      <h2>Goods Receipt</h2>
      <div className="grid" style={{ marginBottom: 14 }}>
        <Stat label="POs waiting for goods" value={all.length} tone={all.length ? 'amber' : 'green'} />
        <Stat label="Delayed" value={all.filter(p => isDelayed(s, p)).length} tone={all.some(p => isDelayed(s, p)) ? 'red' : 'green'} />
        <Stat label="Units still to come" value={all.reduce((a, p) => a + totalPending(s, p), 0)} />
        <Stat label="Received today" value={todayCount} sub="goods receipts" />
      </div>
      {done && <div className="note">✓ {done} <a href="#" onClick={e => { e.preventDefault(); setDone(''); }}>dismiss</a></div>}

      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Search PO number or vendor…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 280 }} />
      </div>

      {waiting.length === 0 ? <Card><Empty>No POs are waiting for goods{q ? ' that match your search' : ''}.</Empty></Card> : waiting.map(p => {
        const isOpen = openId === p.id;
        const delayed = isDelayed(s, p);
        return (
          <section key={p.id} className={'card po-card' + (isOpen ? ' open' : '') + (delayed ? ' late' : '')}>
            <header className="po-card-h" onClick={() => setOpenId(isOpen ? undefined : p.id)}>
              <div>
                <b style={{ fontSize: 16 }}>{p.poNo}</b> · {vendorOf(s, p.vendorId)?.name} {delayed && <Badge>Delay</Badge>} {p.status === 'Approved' && <span className="brandtag">Approved · not sent yet</span>}
                <div className="mut">Expected {fmtDate(p.expectedDate)} · {p.lines.length} item line(s) · <Link to={`/pos/${p.id}`}>open PO</Link></div>
              </div>
              <div className="po-card-r">
                <div><b>{totalPending(s, p)}</b> <span className="mut">units pending</span></div>
                <div className="mut">{inr(pendingValue(s, p))}</div>
                <button className={'btn sm ' + (isOpen ? '' : 'primary')}>{isOpen ? 'Close' : 'Check items'}</button>
              </div>
            </header>
            {!isOpen && (
              <div className="po-chips">{p.lines.map(l => {
                const pend = Math.max(0, l.qty - receivedQty(s, p.id, l.itemId, l.brand));
                return <span key={l.itemId + '|' + l.brand} className={'chip' + (pend === 0 ? ' done' : '')}>{itemName(s, l.itemId)}{l.brand ? ` (${l.brand})` : ''} · {pend === 0 ? '✓' : `${pend} pending`}</span>;
              })}</div>
            )}
            {isOpen && <ReceiptForm poId={p.id} inline onDone={() => { setOpenId(undefined); setDone(`Added to inventory against ${p.poNo}. Anything short is still pending from the vendor.`); }} />}
          </section>
        );
      })}

      <Card title="Goods received so far">
        {grns.length === 0 ? <Empty>Nothing received yet.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>GRN</th><th>PO</th><th>Invoice</th><th>Factory In</th><th className="r">Items</th><th className="r">Grand total</th></tr></thead>
            <tbody>{grns.slice(0, 60).map(r => {
              const po = s.pos.find(p => p.id === r.poId);
              return <tr key={r.id}><td>{r.grnNo || '…'}</td><td>{po ? <Link to={`/pos/${po.id}`}>{po.poNo}</Link> : '—'}</td><td>{r.invoiceNo} · {fmtDate(r.invoiceDate)}</td><td className="nw">{fmtDate(r.receivedDate)}</td><td className="r">{r.lines.length}</td><td className="r">{inr(r.grandTotal)}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
