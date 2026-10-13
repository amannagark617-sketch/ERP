import { useAuth, useSnap, useStore } from '../store';
import { approvalRoute, displayStatus, isDelayed, isLowStock, isOpenPO, outstanding, poValue, receiptBalance, vendorOf } from '../domain';
import { Badge, Card, Empty, Link, QuickApprove, Stat } from '../ui';
import { fmtDate, inr, today } from '../utils';
import type { PurchaseOrder } from '../types';

export default function Dashboard() {
  const s = useStore();
  const { user, can, role, sees } = useAuth();
  const delayed = s.pos.filter(p => isDelayed(s, p));
  const inbox: { to: string; text: string; sub: string; po?: PurchaseOrder }[] = [];
  const name = (id: string) => vendorOf(s, id)?.name ?? '';

  if (can('po.save')) {
    s.pos.filter(p => p.status === 'Rejected').forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `${p.poNo} was not approved`, sub: 'Edit quantity and resubmit' }));
    s.pos.filter(p => p.status === 'Draft').forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `${p.poNo} is a draft`, sub: 'Submit for approval' }));
  }
  if (can('po.send')) {
    s.pos.filter(p => p.status === 'Approved' && p.advanceStatus !== 'Requested').forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `${p.poNo} is ready to send to the vendor`, sub: name(p.vendorId) }));
    delayed.forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `${p.poNo} is delayed – follow up`, sub: `Expected ${fmtDate(p.expectedDate)}` }));
  }
  if (can('po.approve')) s.pos.filter(p => p.status === 'Pending ' + role).forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `Approve ${p.poNo} · ${name(p.vendorId)}`, sub: `${inr(poValue(p))} · route ${approvalRoute(p).join(' → ')}`, po: p }));
  if (can('advance.pay')) s.pos.filter(p => p.advanceStatus === 'Requested').forEach(p => inbox.push({ to: '/accounts', text: `Pay advance for ${p.poNo}`, sub: inr(p.advanceAmount) }));
  if (can('invoice.accept')) s.receipts.filter(r => !r.accepted).forEach(r => inbox.push({ to: '/accounts', text: `Accept invoice ${r.invoiceNo}`, sub: inr(r.grandTotal) }));
  if (can('receipt.create')) s.pos.filter(p => isOpenPO(s, p)).forEach(p => inbox.push({ to: `/receipts/${p.id}/new`, text: `Receive goods for ${p.poNo}`, sub: name(p.vendorId) }));
  if (can('master.manage')) s.pos.forEach(p => p.lines.filter(l => l.queryStatus === 'Open').forEach(l =>
    inbox.push({ to: '/items', text: `Price query on ${p.poNo}`, sub: l.queryNote ?? '' })));
  const low = s.items.filter(i => i.active && isLowStock(s, i));
  if (sees('Stock') && (can('master.manage') || can('receipt.create') || can('po.save'))) low.forEach(i => inbox.push({ to: '/stock', text: `Low stock: ${i.name}`, sub: `min ${i.minStock} ${i.unit}` }));

  const payables = s.receipts.filter(r => r.accepted).reduce((a, r) => a + receiptBalance(s, r), 0);
  const toApprove = s.pos.filter(p => p.status.startsWith('Pending')).length;
  const advDue = s.pos.filter(p => p.advanceStatus === 'Requested').length;
  const toAccept = s.receipts.filter(r => !r.accepted).length;
  useSnap();

  return (
    <>
      <h2>Dashboard <span className="mut" style={{ fontSize: 14, fontWeight: 400 }}>· {user?.role} · {user?.department}</span></h2>
      {/* Each role gets only the numbers it works with */}
      <div className="grid" style={{ marginBottom: 16 }}>
        {(can('po.save') || can('receipt.create') || can('po.approve')) && <Stat label="Open POs" value={s.pos.filter(p => isOpenPO(s, p)).length} />}
        {(can('po.save') || can('receipt.create')) && <Stat label="Delayed / pending POs" value={delayed.length} tone={delayed.length ? 'red' : 'green'} />}
        {(can('po.save') || can('po.approve')) && <Stat label="Awaiting approval" value={toApprove} tone={toApprove ? 'amber' : ''} />}
        {can('advance.pay') && <Stat label="Advances to pay" value={advDue} tone={advDue ? 'amber' : 'green'} />}
        {can('invoice.accept') && <Stat label="Invoices to accept" value={toAccept} tone={toAccept ? 'amber' : 'green'} />}
        {sees('Accounts') && <Stat label="Payables outstanding" value={inr(payables)} sub="accepted invoices + old balances" />}
        {sees('Stock') && <Stat label="Low-stock items" value={low.length} tone={low.length ? 'amber' : 'green'} />}
      </div>
      <Card title={`Your action list (${inbox.length})`}>
        {inbox.length === 0 ? <Empty>Nothing waiting for you.</Empty> : (
          <table><tbody>{inbox.map((i, k) => (
            <tr key={k}><td><Link to={i.to}>{i.text}</Link></td><td className="mut">{i.sub}</td><td className="r">{i.po && <QuickApprove po={i.po} />}</td></tr>
          ))}</tbody></table>
        )}
      </Card>
      <Card title="Recent purchase orders" actions={sees('Purchase Orders') && <Link to="/pos">View all</Link>}>
        {s.pos.length === 0 ? <Empty>No purchase orders yet.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>PO</th><th>Vendor</th><th className="r">Value</th><th>Expected</th><th>Status</th>{sees('Accounts') && <th className="r">Outstanding</th>}</tr></thead>
            <tbody>{[...s.pos].sort((a, b) => b.date.localeCompare(a.date) || b.poNo.localeCompare(a.poNo)).slice(0, 6).map(p => (
              <tr key={p.id}>
                <td><Link to={`/pos/${p.id}`}>{p.poNo || 'New'}</Link></td><td>{name(p.vendorId)}</td>
                <td className="r">{inr(poValue(p))}</td><td className={p.expectedDate < today() && isOpenPO(s, p) ? 'bad' : ''}>{fmtDate(p.expectedDate)}</td>
                <td><Badge>{displayStatus(s, p)}</Badge> {isDelayed(s, p) && <Badge>Delay</Badge>}</td>
                {sees('Accounts') && <td className="r">{inr(outstanding(s, p.id))}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
