import { useState } from 'react';
import { useStore } from '../store';
import { isDelayed, isOpenPO, pendingValue, totalPending, vendorOf } from '../domain';
import { Badge, Card, Empty, Link } from '../ui';
import { fmtDate, inr } from '../utils';

export default function Receipts() {
  const s = useStore();
  const [q, setQ] = useState('');
  const match = (p: { poNo: string; vendorId: string }) => !q || `${p.poNo} ${vendorOf(s, p.vendorId)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase());
  const open = s.pos.filter(p => isOpenPO(s, p) && match(p));
  const waiting = s.pos.filter(p => p.status === 'Approved' && match(p)); // approved but Purchase has not marked it as sent yet
  return (
    <>
      <h2>Goods Receipt</h2>
      <div className="row" style={{ marginBottom: 12 }}><input placeholder="Search PO number or vendor…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 280 }} /></div>
      <Card title="POs waiting for goods – pick one, all its items load automatically">
        {open.length === 0 ? <Empty>No POs are waiting for goods.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>PO</th><th>Vendor</th><th>Expected</th><th className="r">Pending qty</th><th className="r">Pending value</th><th></th><th></th></tr></thead>
            <tbody>{open.map(p => (
              <tr key={p.id} className={isDelayed(s, p) ? 'hl' : ''}>
                <td><Link to={`/pos/${p.id}`}>{p.poNo}</Link></td><td>{vendorOf(s, p.vendorId)?.name}</td><td>{fmtDate(p.expectedDate)}</td>
                <td className="r">{totalPending(s, p)}</td><td className="r">{inr(pendingValue(s, p))}</td><td>{isDelayed(s, p) && <Badge>Delay</Badge>}</td>
                <td className="r"><Link to={`/receipts/${p.id}/new`} className="btn sm primary">Receive goods</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {waiting.length > 0 && (
        <Card title="Approved – waiting to be marked as sent">
          <p className="mut" style={{ marginTop: 0 }}>Goods can be received once Purchase has marked the PO as sent to the vendor.</p>
          <table><tbody>{waiting.map(p => <tr key={p.id}><td><Link to={`/pos/${p.id}`}>{p.poNo}</Link></td><td>{vendorOf(s, p.vendorId)?.name}</td><td className="mut">{p.advanceStatus === 'Requested' ? 'Advance not paid yet' : 'Not marked as sent yet'}</td></tr>)}</tbody></table>
        </Card>
      )}
      <Card title="Goods received so far">
        {s.receipts.filter(r => r.type === 'Invoice').length === 0 ? <Empty>Nothing received yet.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>GRN</th><th>PO</th><th>Invoice</th><th>Factory In</th><th className="r">Grand total</th></tr></thead>
            <tbody>{s.receipts.filter(r => r.type === 'Invoice').sort((a, b) => b.receivedDate.localeCompare(a.receivedDate)).map(r => {
              const po = s.pos.find(p => p.id === r.poId);
              return <tr key={r.id}><td>{r.grnNo || '…'}</td><td>{po ? <Link to={`/pos/${po.id}`}>{po.poNo}</Link> : '—'}</td><td>{r.invoiceNo} · {fmtDate(r.invoiceDate)}</td><td>{fmtDate(r.receivedDate)}</td><td className="r">{r.grandTotal.toLocaleString('en-IN')}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
