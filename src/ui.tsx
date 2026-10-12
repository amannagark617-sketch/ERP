import { ReactNode, useState } from 'react';
import { inr, readScreenshot, today } from './utils';

/** Run an action and show any validation error to the user. */
export function run(fn: () => void): boolean {
  try { fn(); return true; } catch (e) { alert((e as Error).message); return false; }
}

export const go = (path: string) => { location.hash = '#' + path; };

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return <a href={'#' + to} className={className}>{children}</a>;
}

const TONE: Record<string, string> = {
  Draft: 'gray', 'Pending Factory Head': 'amber', 'Pending CA': 'amber', Rejected: 'red', Approved: 'blue',
  'Sent to Vendor': 'blue', 'Partially Received': 'purple', 'Received – payment open': 'purple', Closed: 'green',
  Requested: 'amber', 'Advance Paid': 'green', 'Fully Paid': 'green', Delay: 'red', MSME: 'orange',
  Open: 'amber', Resolved: 'green',
};
export const Badge = ({ children }: { children: string }) => <span className={'badge ' + (TONE[children] ?? 'gray')}>{children}</span>;

export const Card = ({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) => (
  <section className="card">
    {(title || actions) && <header className="card-h"><h3>{title}</h3><div>{actions}</div></header>}
    {children}
  </section>
);

export const Stat = ({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: string; sub?: string }) => (
  <div className={'stat ' + (tone ?? '')}><div className="stat-l">{label}</div><div className="stat-v">{value}</div>{sub && <div className="stat-s">{sub}</div>}</div>
);

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);

export function ScreenshotInput({ value, onChange, label = 'Payment screenshot' }: { value?: string; onChange: (v?: string) => void; label?: string }) {
  return (
    <Field label={label}>
      <input type="file" accept="image/*" onChange={async e => {
        const f = e.target.files?.[0];
        onChange(f ? await readScreenshot(f).catch(() => undefined) : undefined);
      }} />
      {value && <img src={value} alt="screenshot" className="thumb" />}
    </Field>
  );
}

/** Inline payment form: amount, date, optional screenshot. */
export function PayForm({ max, defaultAmount, requireShot, extra, onSubmit, onCancel, submitLabel = 'Mark as paid' }: {
  max?: number; defaultAmount: number; requireShot?: boolean; extra?: ReactNode;
  onSubmit: (amount: number, date: string, shot?: string) => void; onCancel: () => void; submitLabel?: string;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [date, setDate] = useState(today());
  const [shot, setShot] = useState<string>();
  return (
    <div className="payform">
      <Field label="Amount paid" hint={max !== undefined ? `Balance ${inr(max)}` : undefined}>
        <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(+e.target.value)} />
      </Field>
      <Field label="Payment date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <ScreenshotInput value={shot} onChange={setShot} label={requireShot ? 'Payment screenshot (attach)' : 'Payment screenshot (optional)'} />
      {extra}
      <div className="row">
        <button className="btn primary" onClick={() => {
          if (requireShot && !shot) { alert('Attach the payment screenshot'); return; }
          onSubmit(amount, date, shot);
        }}>{submitLabel}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
