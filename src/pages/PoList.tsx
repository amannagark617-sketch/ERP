import { useState } from 'react';
import { useAuth, useStore } from '../store';
import { displayStatus, isDelayed, isOpenPO, outstanding, poValue, totalPending, vendorOf } from '../domain';
import { Badge, Card, Empty, Link } from '../ui';
import { fmtDate, inr } from '../utils';

const TABS = ['All', 'Awaiting approval', 'Open', 'Delay / Pending', 'Closed'] as const;

export default function PoList() {
  const s = useStore();
  const { can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>('All');
  const rows = [...s.pos].reverse().filter(p => {
    const st = displayStatus(s, p);
    if (tab === 'Awaiting approval') return p.status.startsWith('Pending');
    if (tab === 'Open') return isOpenPO(s, p);
    if (tab === 'Delay / Pending') return isDelayed(s, p);
    if (tab === 'Closed') return st === 'Closed';
    return true;
  });
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Purchase Orders</h2>
        {can('po.save') && <Link to="/pos/new" className="btn primary">+ New PO</Link>}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        {TABS.map(t => <button key={t} className={'btn sm' + (tab === t ? ' primary' : '')} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <Card>
        {rows.length === 0 ? <Empty>No purchase orders here.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>PO</th><th>Date</th><th>Vendor</th><th>Dept</th><th className="r">Value</th><th>Expected</th><th className="r">Pending qty</th><th>Status</th><th className="r">Outstanding</th></tr></thead>
            <tbody>{rows.map(p => (
              <tr key={p.id} className={isDelayed(s, p) ? 'hl' : ''}>
                <td><Link to={`/pos/${p.id}`}>{p.poNo}</Link></td><td>{fmtDate(p.date)}</td><td>{vendorOf(s, p.vendorId)?.name}</td><td>{p.department}</td>
                <td className="r">{inr(poValue(p))}</td><td>{fmtDate(p.expectedDate)}</td>
                <td className="r">{p.status === 'Sent to Vendor' ? totalPending(s, p) : '—'}</td>
                <td><Badge>{displayStatus(s, p)}</Badge> {isDelayed(s, p) && <Badge>Delay</Badge>}</td>
                <td className="r">{inr(outstanding(s, p.id))}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
