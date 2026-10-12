import { useStore } from '../store';
import { isDelayed, isOpenPO, totalPending, vendorOf } from '../domain';
import { Badge, Card, Empty, Link } from '../ui';
import { fmtDate } from '../utils';

export default function Receipts() {
  const s = useStore();
  const open = s.pos.filter(p => isOpenPO(s, p));
  return (
    <>
      <h2>Goods Receipt</h2>
      <Card title="POs waiting for goods (open / pending POs)">
        {open.length === 0 ? <Empty>No POs are waiting for goods.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>PO</th><th>Vendor</th><th>Expected</th><th className="r">Pending qty</th><th></th><th></th></tr></thead>
            <tbody>{open.map(p => (
              <tr key={p.id} className={isDelayed(s, p) ? 'hl' : ''}>
                <td><Link to={`/pos/${p.id}`}>{p.poNo}</Link></td><td>{vendorOf(s, p.vendorId)?.name}</td><td>{fmtDate(p.expectedDate)}</td>
                <td className="r">{totalPending(s, p)}</td><td>{isDelayed(s, p) && <Badge>Delay</Badge>}</td>
                <td className="r"><Link to={`/receipts/${p.id}/new`} className="btn sm primary">Receive goods</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <Card title="Goods received so far">
        {s.receipts.length === 0 ? <Empty>Nothing received yet.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>GRN</th><th>PO</th><th>Invoice</th><th>Factory In</th><th className="r">Grand total</th></tr></thead>
            <tbody>{[...s.receipts].reverse().map(r => {
              const po = s.pos.find(p => p.id === r.poId)!;
              return <tr key={r.id}><td>{r.grnNo || '…'}</td><td><Link to={`/pos/${po.id}`}>{po.poNo}</Link></td><td>{r.invoiceNo} · {fmtDate(r.invoiceDate)}</td><td>{fmtDate(r.receivedDate)}</td><td className="r">{r.grandTotal.toLocaleString('en-IN')}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
