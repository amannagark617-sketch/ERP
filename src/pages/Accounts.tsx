import { Fragment, ReactNode, useState } from 'react';
import { actions, useRole, useStore } from '../store';
import {
  itemName, openingPaid, paidTotal, receiptBalance, receiptDue, receiptPaid, vendorOf,
} from '../domain';
import { Badge, Card, Empty, Field, Link, PayForm, Stat, run } from '../ui';
import { fmtDate, inr, today } from '../utils';

interface Payable { key: string; kind: 'invoice' | 'opening'; refId: string; vendorId: string; ref: string; due: string; amount: number; balance: number; poId?: string }

export default function Accounts() {
  const s = useStore();
  const role = useRole();
  const [paying, setPaying] = useState<string>();
  const [advPay, setAdvPay] = useState<string>();
  const can = role === 'Accounts';

  const payables: Payable[] = [
    ...s.receipts.filter(r => r.accepted && receiptBalance(s, r) > 0).map(r => ({
      key: 'r' + r.id, kind: 'invoice' as const, refId: r.id, vendorId: s.pos.find(p => p.id === r.poId)!.vendorId,
      ref: `Invoice ${r.invoiceNo} (${s.pos.find(p => p.id === r.poId)!.poNo})`, due: receiptDue(s, r), amount: r.payable, balance: receiptBalance(s, r), poId: r.poId,
    })),
    ...s.openings.filter(o => o.amount - openingPaid(s, o.id) > 0.005).map(o => ({
      key: 'o' + o.id, kind: 'opening' as const, refId: o.id, vendorId: o.vendorId, ref: o.ref, due: o.dueDate,
      amount: o.amount, balance: o.amount - openingPaid(s, o.id),
    })),
  ].sort((a, b) => a.due.localeCompare(b.due));
  const msme = payables.filter(p => p.kind === 'invoice' && vendorOf(s, p.vendorId)?.msme);
  const others = payables.filter(p => p.kind === 'invoice' && !vendorOf(s, p.vendorId)?.msme);
  const old = payables.filter(p => p.kind === 'opening');
  const advReq = s.pos.filter(p => p.advanceStatus === 'Requested');
  const toAccept = s.receipts.filter(r => !r.accepted);
  const sum = (a: Payable[]) => a.reduce((x, p) => x + p.balance, 0);

  const table = (rows: Payable[]): ReactNode => rows.length === 0 ? <Empty>Nothing pending.</Empty> : (
    <div className="tablewrap"><table>
      <thead><tr><th>Vendor</th><th>Reference</th><th>Due</th><th className="r">Payable</th><th className="r">Balance</th><th></th></tr></thead>
      <tbody>{rows.map(p => {
        const v = vendorOf(s, p.vendorId);
        const overdue = p.due < today();
        return (
          <Fragment key={p.key}>
            <tr className={overdue ? 'hl' : ''}>
              <td>{v?.name} {v?.msme && <Badge>MSME</Badge>}</td>
              <td>{p.poId ? <Link to={`/pos/${p.poId}`}>{p.ref}</Link> : p.ref}</td>
              <td className={overdue ? 'bad' : ''}>{fmtDate(p.due)}{overdue && ' (overdue)'}</td>
              <td className="r">{inr(p.amount)}</td><td className="r">{inr(p.balance)}</td>
              <td className="r">{can && <button className="btn sm primary" onClick={() => setPaying(paying === p.key ? undefined : p.key)}>Pay</button>}</td>
            </tr>
            {paying === p.key && (
              <tr><td colSpan={6}>
                <PayForm max={p.balance} defaultAmount={p.balance} onCancel={() => setPaying(undefined)}
                  onSubmit={(a, d, shot) => run(() => p.kind === 'invoice' ? actions.payInvoice(p.refId, a, d, shot) : actions.payOpening(p.refId, a, d, shot)) && setPaying(undefined)} />
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
      {!can && <div className="note">You are viewing as {role}. Payments and acceptances are done by Accounts.</div>}
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
                  <td className="r">{can && <button className="btn sm primary" onClick={() => setAdvPay(advPay === p.id ? undefined : p.id)}>Record payment</button>}</td></tr>
                {advPay === p.id && <tr><td colSpan={4}><AdvPay po={p.id} amount={p.advanceAmount} done={() => setAdvPay(undefined)} /></td></tr>}
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
              const po = s.pos.find(p => p.id === r.poId)!;
              return <tr key={r.id}><td>{r.invoiceNo}<br /><span className="mut">{fmtDate(r.invoiceDate)}</span></td><td><Link to={`/pos/${po.id}`}>{po.poNo}</Link></td><td>{vendorOf(s, po.vendorId)?.name}</td>
                <td className="mut">{r.lines.map(l => `${itemName(s, l.itemId)} × ${l.qty}`).join(', ')}</td>
                <td className="r">{inr(r.grandTotal)}</td><td className="r">{inr(r.advanceAdjusted)}</td><td className="r">{inr(r.payable)}</td>
                <td className="r">{can && <button className="btn sm primary" onClick={() => run(() => actions.acceptInvoice(r.id))}>Accept &amp; book</button>}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Card title={`MSME vendors – pay first (${inr(sum(msme))})`}>{table(msme)}</Card>
      <Card title={`Other vendors (${inr(sum(others))})`}>{table(others)}</Card>
      <Card title={`Old pending balances (${inr(sum(old))})`}>
        {table(old)}
        {can && <OpeningForm />}
      </Card>

      <Card title="Payments made">
        {s.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="r">Amount</th><th>Screenshot</th></tr></thead>
            <tbody>{[...s.payments].reverse().map(p => {
              const po = s.pos.find(x => x.id === p.poId);
              const r = s.receipts.find(x => x.id === p.receiptId);
              const o = s.openings.find(x => x.id === p.openingId);
              return <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{p.kind}</td>
                <td>{po ? `${po.poNo}${r ? ' · ' + r.invoiceNo : ''}` : o?.ref}</td><td className="r">{inr(p.amount)}</td>
                <td>{p.screenshot ? <a href={p.screenshot} target="_blank" rel="noreferrer">View</a> : <span className="mut">—</span>}</td></tr>;
            })}</tbody>
          </table></div>
        )}
        <p className="mut">Total paid across POs: {inr(s.pos.reduce((a, p) => a + paidTotal(s, p.id), 0))}</p>
      </Card>
    </>
  );
}

function AdvPay({ po, amount, done }: { po: string; amount: number; done: () => void }) {
  const [full, setFull] = useState(false);
  return (
    <PayForm defaultAmount={amount} requireShot onCancel={done} submitLabel="Mark paid"
      extra={<Field label="Mark PO as"><select value={full ? 'f' : 'a'} onChange={e => setFull(e.target.value === 'f')}><option value="a">Advance Paid</option><option value="f">Fully Paid</option></select></Field>}
      onSubmit={(a, d, shot) => run(() => actions.payAdvance(po, a, d, full, shot)) && done()} />
  );
}

function OpeningForm() {
  const s = useStore();
  const [vendorId, setVendorId] = useState('');
  const [ref, setRef] = useState('');
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState(today());
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="mut" style={{ cursor: 'pointer' }}>Add an old pending balance</summary>
      <div className="form2" style={{ marginTop: 10 }}>
        <Field label="Vendor"><select value={vendorId} onChange={e => setVendorId(e.target.value)}><option value="">Select…</option>{s.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Reference"><input value={ref} onChange={e => setRef(e.target.value)} /></Field>
        <Field label="Amount"><input type="number" min={0} value={amount || ''} onChange={e => setAmount(+e.target.value)} /></Field>
        <Field label="Due date"><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
      </div>
      <button className="btn" onClick={() => {
        if (!vendorId || !ref || !(amount > 0)) { alert('Fill vendor, reference and amount'); return; }
        actions.addOpening(vendorId, ref, amount, due); setRef(''); setAmount(0);
      }}>Add balance</button>
    </details>
  );
}
