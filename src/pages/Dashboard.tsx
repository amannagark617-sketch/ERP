import { useRole, useStore } from '../store';
import {
  displayStatus, isDelayed, isOpenPO, needsCA, openingPaid, outstanding, poValue, receiptBalance, vendorOf,
} from '../domain';
import { Badge, Card, Empty, Link, Stat } from '../ui';
import { fmtDate, inr, today } from '../utils';
import { ROLE_LABEL } from '../types';

export default function Dashboard() {
  const s = useStore();
  const role = useRole();
  const delayed = s.pos.filter(p => isDelayed(s, p));
  const inbox: { to: string; text: string; sub: string }[] = [];

  const pending = (st: string) => s.pos.filter(p => p.status === st);
  if (role === 'Purchase') {
    s.pos.filter(p => p.status === 'Rejected').forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `${p.poNo} was not approved`, sub: 'Edit quantity and resubmit' }));
    s.pos.filter(p => p.status === 'Draft').forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `${p.poNo} is a draft`, sub: 'Submit for approval' }));
    s.pos.filter(p => p.status === 'Approved' && p.advanceStatus !== 'Requested').forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `${p.poNo} is ready to send to the vendor`, sub: vendorOf(s, p.vendorId)?.name ?? '' }));
    delayed.forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `${p.poNo} is delayed – follow up`, sub: `Expected ${fmtDate(p.expectedDate)}` }));
  }
  if (role === 'Factory Head') pending('Pending Factory Head').forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `Approve ${p.poNo}`, sub: `${inr(poValue(p))}${needsCA(p) ? ' · will need CA approval after you' : ''}` }));
  if (role === 'CA') pending('Pending CA').forEach(p => inbox.push({ to: `/pos/${p.id}`, text: `Approve ${p.poNo}`, sub: `${inr(poValue(p))} · above Rs 10 Lac` }));
  if (role === 'Accounts') {
    s.pos.filter(p => p.advanceStatus === 'Requested').forEach(p => inbox.push({ to: '/accounts', text: `Pay advance for ${p.poNo}`, sub: inr(p.advanceAmount) }));
    s.receipts.filter(r => !r.accepted).forEach(r => inbox.push({ to: '/accounts', text: `Accept invoice ${r.invoiceNo}`, sub: inr(r.grandTotal) }));
  }
  if (role === 'Inventory') s.pos.filter(p => isOpenPO(s, p)).forEach(p => inbox.push({ to: `/receipts/${p.id}/new`, text: `Receive goods for ${p.poNo}`, sub: vendorOf(s, p.vendorId)?.name ?? '' }));
  if (role === 'HO') s.queries.filter(q => q.status === 'Open').forEach(q => inbox.push({ to: '/vendors', text: `Price query on ${s.pos.find(p => p.id === q.poId)?.poNo}`, sub: q.note }));

  const payables = s.receipts.filter(r => r.accepted).reduce((a, r) => a + receiptBalance(s, r), 0)
    + s.openings.reduce((a, o) => a + Math.max(0, o.amount - openingPaid(s, o.id)), 0);
  const toApprove = s.pos.filter(p => p.status.startsWith('Pending')).length;

  return (
    <>
      <h2>Dashboard <span className="mut" style={{ fontSize: 14, fontWeight: 400 }}>· {ROLE_LABEL[role]}</span></h2>
      <div className="grid" style={{ marginBottom: 16 }}>
        <Stat label="Open POs" value={s.pos.filter(p => isOpenPO(s, p)).length} />
        <Stat label="Delayed / pending POs" value={delayed.length} tone={delayed.length ? 'red' : 'green'} />
        <Stat label="Awaiting approval" value={toApprove} tone={toApprove ? 'amber' : ''} />
        <Stat label="Payables outstanding" value={inr(payables)} sub="accepted invoices + old balances" />
      </div>
      <Card title={`Your action list (${inbox.length})`}>
        {inbox.length === 0 ? <Empty>Nothing waiting for you.</Empty> : (
          <table><tbody>{inbox.map((i, k) => (
            <tr key={k}><td><Link to={i.to}>{i.text}</Link></td><td className="mut">{i.sub}</td></tr>
          ))}</tbody></table>
        )}
      </Card>
      <Card title="Recent purchase orders" actions={<Link to="/pos">View all</Link>}>
        <div className="tablewrap"><table>
          <thead><tr><th>PO</th><th>Vendor</th><th className="r">Value</th><th>Expected</th><th>Status</th><th className="r">Outstanding</th></tr></thead>
          <tbody>{[...s.pos].reverse().slice(0, 6).map(p => (
            <tr key={p.id}>
              <td><Link to={`/pos/${p.id}`}>{p.poNo}</Link></td><td>{vendorOf(s, p.vendorId)?.name}</td>
              <td className="r">{inr(poValue(p))}</td><td className={p.expectedDate < today() && isOpenPO(s, p) ? 'bad' : ''}>{fmtDate(p.expectedDate)}</td>
              <td><Badge>{displayStatus(s, p)}</Badge> {isDelayed(s, p) && <Badge>Delay</Badge>}</td>
              <td className="r">{inr(outstanding(s, p.id))}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}
