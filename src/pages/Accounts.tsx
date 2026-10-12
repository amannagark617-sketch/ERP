import { Fragment, ReactNode, useState } from 'react';
import { actions, useAuth, useStore } from '../store';
import { itemName, paidTotal, poOf, receiptBalance, vendorOf } from '../domain';
import { Badge, Card, Empty, Field, FileLink, Link, PayForm, Stat, run } from '../ui';
import { addDays, fmtDate, inr, today } from '../utils';
import { Receipt } from '../types';

export default function Accounts() {
  const s = useStore();
  const { can: perm, role } = useAuth();
  const [paying, setPaying] = useState<string>();
  const [advPay, setAdvPay] = useState<string>();
  const canPay = perm('payment.make'), canAccept = perm('invoice.accept'), canAdv = perm('advance.pay'), canOpen = perm('opening.add');

  const open = s.receipts.filter(r => r.accepted && receiptBalance(s, r) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const msme = open.filter(r => r.type === 'Invoice' && vendorOf(s, r.vendorId)?.msme);
  const others = open.filter(r => r.type === 'Invoice' && !vendorOf(s, r.vendorId)?.msme);
  const old = open.filter(r => r.type === 'Opening');
  const advReq = s.pos.filter(p => p.advanceStatus === 'Requested');
  const toAccept = s.receipts.filter(r => !r.accepted);
  const sum = (a: Receipt[]) => a.reduce((x, r) => x + receiptBalance(s, r), 0);

  const table = (rows: Receipt[]): ReactNode => rows.length === 0 ? <Empty>Nothing pending.</Empty> : (
    <div className="tablewrap"><table>
      <thead><tr><th>Vendor</th><th>Reference</th><th>Due</th><th className="r">Payable</th><th className="r">Balance</th><th></th></tr></thead>
      <tbody>{rows.map(r => {
        const v = vendorOf(s, r.vendorId);
        const po = poOf(s, r.poId);
        const overdue = r.dueDate < today();
        return (
          <Fragment key={r.id}>
            <tr className={overdue ? 'hl' : ''}>
              <td>{v?.name} {v?.msme && <Badge>MSME</Badge>}{v?.msme && <div className="mut" style={{ fontSize: 12 }}>{v.msmeType} · {v.udyamNo || 'Udyam no. missing'}</div>}</td>
              <td>{po ? <Link to={`/pos/${po.id}`}>Invoice {r.invoiceNo} ({po.poNo})</Link> : r.invoiceNo}</td>
              <td className={overdue ? 'bad' : ''}>{fmtDate(r.dueDate)}{overdue && ' (overdue)'}</td>
              <td className="r">{inr(r.payable)}</td><td className="r">{inr(receiptBalance(s, r))}</td>
              <td className="r">{canPay && <button className="btn sm primary" onClick={() => setPaying(paying === r.id ? undefined : r.id)}>Pay</button>}</td>
            </tr>
            {paying === r.id && (
              <tr><td colSpan={6}>
                <PayForm max={receiptBalance(s, r)} defaultAmount={receiptBalance(s, r)} folder={po?.poNo ?? 'Old balances'} onCancel={() => setPaying(undefined)}
                  onSubmit={async (a, d, shot) => { if (await run(() => actions.payInvoice(r.id, a, d, shot))) setPaying(undefined); }} />
              </td></tr>
            )}
          </Fragment>
        );
      })}</tbody>
    </table></div>
  );

  return (
    <>
      <h2>Accounts</h2>
      {!canPay && !canAccept && <div className="note">You are viewing as {role}. Payments and acceptances are done by Accounts.</div>}
      <div className="grid" style={{ marginBottom: 16 }}>
        <Stat label="Advance requests" value={advReq.length} tone={advReq.length ? 'amber' : ''} />
        <Stat label="Invoices to accept" value={toAccept.length} tone={toAccept.length ? 'amber' : ''} />
        <Stat label="MSME payable" value={inr(sum(msme))} tone={msme.length ? 'red' : ''} sub="45-day rule applies" />
        <Stat label="Other payable" value={inr(sum(others))} />
        <Stat label="Old pending balances" value={inr(sum(old))} />
      </div>

      <Card title="Advance payment requests">
        {advReq.length === 0 ? <Empty>No advance requests.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>PO</th><th>Vendor</th><th className="r">Advance</th><th></th></tr></thead>
            <tbody>{advReq.map(p => (
              <Fragment key={p.id}>
                <tr><td><Link to={`/pos/${p.id}`}>{p.poNo}</Link></td><td>{vendorOf(s, p.vendorId)?.name}</td><td className="r">{inr(p.advanceAmount)}</td>
                  <td className="r">{canAdv && <button className="btn sm primary" onClick={() => setAdvPay(advPay === p.id ? undefined : p.id)}>Record payment</button>}</td></tr>
                {advPay === p.id && <tr><td colSpan={4}><AdvPay po={p.id} poNo={p.poNo} amount={p.advanceAmount} done={() => setAdvPay(undefined)} /></td></tr>}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Card title="Invoices to accept (manual receipt + Tally entry)">
        {toAccept.length === 0 ? <Empty>No invoices waiting.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Invoice</th><th>PO</th><th>Vendor</th><th>Items</th><th className="r">Grand total</th><th className="r">Advance adj.</th><th className="r">Payable</th><th></th></tr></thead>
            <tbody>{toAccept.map(r => {
              const po = poOf(s, r.poId);
              return <tr key={r.id}><td>{r.invoiceNo}<br /><span className="mut">{fmtDate(r.invoiceDate)}</span></td><td>{po && <Link to={`/pos/${po.id}`}>{po.poNo}</Link>}</td><td>{vendorOf(s, r.vendorId)?.name}</td>
                <td className="mut">{r.lines.map(l => `${itemName(s, l.itemId)} × ${l.qty}`).join(', ')}</td>
                <td className="r">{inr(r.grandTotal)}</td><td className="r">{inr(r.advanceAdjusted)}</td><td className="r">{inr(r.payable)}</td>
                <td className="r">{canAccept && <button className="btn sm primary" onClick={() => run(() => actions.acceptInvoice(r.id))}>Accept &amp; book</button>} <FileLink id={r.invoiceFile} label="Invoice copy" /></td></tr>;
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Card title={`MSME vendors – pay first (${inr(sum(msme))})`}>{table(msme)}</Card>
      <Card title={`Other vendors (${inr(sum(others))})`}>{table(others)}</Card>
      <Card title={`Old pending balances (${inr(sum(old))})`}>
        {table(old)}
        {canOpen && <OpeningForm />}
      </Card>

      <Card title="Payments made">
        {s.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Vendor</th><th>Reference</th><th className="r">Amount</th><th>Screenshot</th></tr></thead>
            <tbody>{[...s.payments].sort((a, b) => b.date.localeCompare(a.date)).map(p => {
              const po = poOf(s, p.poId ?? '');
              const r = s.receipts.find(x => x.id === p.receiptId);
              return <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{p.kind}</td><td>{vendorOf(s, r?.vendorId ?? po?.vendorId ?? '')?.name}</td>
                <td>{[po?.poNo, r?.invoiceNo].filter(Boolean).join(' · ')}</td><td className="r">{inr(p.amount)}</td><td><FileLink id={p.screenshot} /></td></tr>;
            })}</tbody>
          </table></div>
        )}
        <p className="mut">Total paid across the POs shown: {inr(s.pos.reduce((a, p) => a + paidTotal(s, p.id), 0))}</p>
      </Card>
    </>
  );
}

function AdvPay({ po, poNo, amount, done }: { po: string; poNo: string; amount: number; done: () => void }) {
  const [full, setFull] = useState(false);
  return (
    <PayForm defaultAmount={amount} folder={poNo} requireShot onCancel={done} submitLabel="Mark paid"
      extra={<Field label="Mark PO as"><select value={full ? 'f' : 'a'} onChange={e => setFull(e.target.value === 'f')}><option value="a">Advance Paid</option><option value="f">Fully Paid</option></select></Field>}
      onSubmit={async (a, d, shot) => { if (await run(() => actions.payAdvance(po, a, d, full, shot))) done(); }} />
  );
}

function OpeningForm() {
  const s = useStore();
  const [vendorId, setVendorId] = useState('');
  const [ref, setRef] = useState('');
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState(addDays(today(), 0));
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="mut" style={{ cursor: 'pointer' }}>Add an old pending balance (a bill from before this app)</summary>
      <div className="form2" style={{ marginTop: 10 }}>
        <Field label="Vendor"><select value={vendorId} onChange={e => setVendorId(e.target.value)}><option value="">Select…</option>{s.vendors.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Bill / reference"><input value={ref} onChange={e => setRef(e.target.value)} /></Field>
        <Field label="Amount"><input type="number" min={0} value={amount || ''} onChange={e => setAmount(+e.target.value)} /></Field>
        <Field label="Due date"><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
      </div>
      <button className="btn" onClick={() => run(() => actions.addOpening(vendorId, ref, amount, due)).then(ok => { if (ok) { setRef(''); setAmount(0); } })}>Add balance</button>
    </details>
  );
}
