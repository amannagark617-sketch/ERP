import { useStore, useAuth } from '../store';
import { approvalRoute, invoicesOf, isLowStock, isOpenPO, itemOf, onOrder, poValue, receiptBalance, stockOnHand, totalPending, vendorOf } from '../domain';
import { Card, Empty, Link } from '../ui';
import { fmtDate, inr, today } from '../utils';
import { MONTHS } from '../shared/dates';

const dayNo = (d: string) => Math.floor(new Date(d + 'T00:00:00Z').getTime() / 864e5);
const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (k: string) => `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;

/** One-tap buttons for what this role does most. */
export function QuickActions() {
  const s = useStore();
  const { can, sees } = useAuth();
  const waitingApproval = s.pos.filter(p => p.status.startsWith('Pending')).length;
  const btn = (to: string, label: string, primary = false, badge?: number) =>
    <Link key={label} to={to} className={'btn' + (primary ? ' primary' : '')}>{label}{badge ? <span className="pill">{badge}</span> : null}</Link>;
  const list = [
    can('po.save') && btn('/pos/new', '+ New purchase order', true),
    can('po.approve') && sees('Purchase Orders') && btn('/pos', 'Approvals', waitingApproval > 0, waitingApproval),
    can('receipt.create') && sees('Goods Receipt') && btn('/receipts', 'Receive goods', true),
    can('stock.issue') && sees('Stock') && btn('/stock', 'Issue stock'),
    (can('payment.make') || can('invoice.accept')) && sees('Accounts') && btn('/accounts', 'Payments & invoices', true),
    can('master.manage') && sees('Items & Prices') && btn('/items', 'Items & prices'),
  ].filter(Boolean);
  if (!list.length) return null;
  return <div className="row quick" style={{ marginBottom: 16 }}>{list}</div>;
}

/** Where every PO stands. */
export function PoPipeline() {
  const s = useStore();
  const stages: [string, number][] = [
    ['Draft', s.pos.filter(p => p.status === 'Draft').length],
    ['Awaiting approval', s.pos.filter(p => p.status.startsWith('Pending')).length],
    ['Approved', s.pos.filter(p => p.status === 'Approved').length],
    ['Waiting for goods', s.pos.filter(p => isOpenPO(s, p)).length],
    ['Rejected', s.pos.filter(p => p.status === 'Rejected').length],
  ];
  const max = Math.max(1, ...stages.map(x => x[1]));
  return (
    <Card title="Purchase orders by stage" actions={<Link to="/pos">View all</Link>}>
      <div className="bars">{stages.map(([l, n]) => (
        <div className="bar-row" key={l}><span>{l}</span><div className="bar"><i style={{ width: `${(n / max) * 100}%` }} /></div><b>{n}</b></div>
      ))}</div>
    </Card>
  );
}

/** For managers (Factory Head / Admin): spending, vendors, delivery performance, approvals waiting. */
export function ManagerInsights() {
  const s = useStore();
  const live = s.pos.filter(p => p.status === 'Approved' || p.status === 'Sent to Vendor');
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
  const spend = months.map(m => ({ m, v: live.filter(p => monthKey(p.date) === m).reduce((a, p) => a + poValue(p), 0) }));
  const maxSpend = Math.max(1, ...spend.map(x => x.v));

  const since = months[0];
  const byVendor = new Map<string, number>();
  live.filter(p => monthKey(p.date) >= since).forEach(p => byVendor.set(p.vendorId, (byVendor.get(p.vendorId) ?? 0) + poValue(p)));
  const top = [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = Math.max(1, ...top.map(x => x[1]));

  // delivery performance on POs that are completely received
  const done = s.pos.filter(p => p.status === 'Sent to Vendor' && p.expectedDate && totalPending(s, p) === 0 && invoicesOf(s, p.id).length > 0);
  const lateDays = (p: (typeof done)[number]) => dayNo(invoicesOf(s, p.id).map(r => r.receivedDate).sort().slice(-1)[0]) - dayNo(p.expectedDate);
  const onTime = done.filter(p => lateDays(p) <= 0).length;
  const lateBy = new Map<string, number>();
  done.filter(p => lateDays(p) > 0).forEach(p => lateBy.set(p.vendorId, (lateBy.get(p.vendorId) ?? 0) + 1));
  const lateTop = [...lateBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const waiting = s.pos.filter(p => p.status.startsWith('Pending'));
  const open = s.pos.filter(p => isOpenPO(s, p));
  return (
    <div className="grid2">
      <Card title="Purchase value by month (last 6)">
        <div className="bars">{spend.map(x => (
          <div className="bar-row" key={x.m}><span>{monthLabel(x.m)}</span><div className="bar"><i style={{ width: `${(x.v / maxSpend) * 100}%` }} /></div><b>{x.v ? inr(x.v) : '—'}</b></div>
        ))}</div>
      </Card>
      <Card title="Top vendors (last 6 months)">
        {top.length === 0 ? <Empty>No approved POs yet.</Empty> : <div className="bars">{top.map(([id, v]) => (
          <div className="bar-row" key={id}><span>{vendorOf(s, id)?.name ?? id}</span><div className="bar"><i style={{ width: `${(v / topMax) * 100}%` }} /></div><b>{inr(v)}</b></div>
        ))}</div>}
      </Card>
      <Card title="Delivery performance">
        {done.length === 0 ? <Empty>Shows once POs are completely received.</Empty> : (
          <>
            <p style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px' }} className={onTime / done.length >= 0.8 ? 'ok' : 'bad'}>{Math.round((onTime / done.length) * 100)}% on time</p>
            <p className="mut" style={{ marginTop: 0 }}>{onTime} of {done.length} completed POs arrived by the expected date.</p>
            {lateTop.length > 0 && <p style={{ margin: 0 }}>Most late deliveries: {lateTop.map(([id, n]) => `${vendorOf(s, id)?.name ?? id} (${n})`).join(', ')}</p>}
          </>
        )}
      </Card>
      <Card title="Needs your attention">
        <ul className="plain">
          <li><b>{waiting.length}</b> PO(s) waiting for approval{waiting.length > 0 && <> · oldest from {fmtDate(waiting.map(p => p.date).sort()[0])} · <Link to="/pos">review</Link></>}</li>
          <li><b>{open.filter(p => p.expectedDate < today()).length}</b> delivery(ies) overdue from vendors</li>
          <li><b>{s.pos.filter(p => p.status === 'Rejected').length}</b> rejected PO(s) waiting for Purchase to fix</li>
          <li>Largest approval waiting: <b>{waiting.length ? inr(Math.max(...waiting.map(p => poValue(p)))) : '—'}</b>{waiting.length > 0 && <span className="mut"> · route {approvalRoute(waiting.sort((a, b) => poValue(b) - poValue(a))[0]).join(' → ') || 'direct'}</span>}</li>
        </ul>
      </Card>
    </div>
  );
}

/** Accounts: what is due when. */
export function PayablesAgeing() {
  const s = useStore();
  const due = s.receipts.filter(r => r.accepted && receiptBalance(s, r) > 0);
  const t = today();
  const in7 = new Date(); in7.setUTCDate(in7.getUTCDate() + 7);
  const lim = in7.toISOString().slice(0, 10);
  const sum = (f: (r: (typeof due)[number]) => boolean) => due.filter(f).reduce((a, r) => a + receiptBalance(s, r), 0);
  const rows: [string, number, string][] = [
    ['Overdue', sum(r => r.dueDate < t), 'bad'],
    ['Due in the next 7 days', sum(r => r.dueDate >= t && r.dueDate <= lim), 'amber'],
    ['Due later', sum(r => r.dueDate > lim), 'ok'],
    ['Invoices not yet accepted', s.receipts.filter(r => !r.accepted).reduce((a, r) => a + r.payable, 0), 'mut'],
  ];
  const max = Math.max(1, ...rows.map(r => r[1]));
  const msmeLate = due.filter(r => r.dueDate < t && vendorOf(s, r.vendorId)?.msme).length;
  return (
    <Card title="Payables – what is due when" actions={<Link to="/accounts">Open Accounts</Link>}>
      <div className="bars">{rows.map(([l, v, tone]) => (
        <div className={'bar-row ' + tone} key={l}><span>{l}</span><div className="bar"><i style={{ width: `${(v / max) * 100}%` }} /></div><b>{inr(v)}</b></div>
      ))}</div>
      {msmeLate > 0 && <p className="bad" style={{ marginBottom: 0 }}>⚠ {msmeLate} overdue invoice(s) belong to MSME vendors – the MSME payment-days rule applies.</p>}
    </Card>
  );
}

/** Stock / Purchase / Inventory: what runs short and whether an open PO already covers it. */
export function StockWatch() {
  const s = useStore();
  const low = s.items.filter(i => i.active && isLowStock(s, i)).map(i => ({ i, have: stockOnHand(s, i.id), ord: onOrder(s, i.id) }));
  return (
    <Card title="Stock watch – running low" actions={<Link to="/stock">Open Stock</Link>}>
      {low.length === 0 ? <Empty>Nothing is below its minimum.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Item</th><th className="r">In stock</th><th className="r">Minimum</th><th className="r">On order</th><th>Action</th></tr></thead>
          <tbody>{low.map(({ i, have, ord }) => {
            const covered = itemOf(s, i.id) && have + ord > i.minStock;
            return <tr key={i.id}><td>{i.name}</td><td className="r bad"><b>{have}</b> {i.unit}</td><td className="r">{i.minStock}</td><td className="r">{ord || '—'}</td>
              <td>{covered ? <span className="ok">Covered by open PO</span> : <span className="bad">Order needed</span>}</td></tr>;
          })}</tbody>
        </table></div>
      )}
    </Card>
  );
}
