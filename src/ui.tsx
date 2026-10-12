import { ReactNode, useState } from 'react';
import { inr, today } from './utils';
import { fetchFile, uploadFile } from './store';

/** Run an action (sync or async) and show any error to the user. Resolves true on success. */
export async function run(fn: () => unknown): Promise<boolean> {
  try { await fn(); return true; } catch (e) { alert((e as Error).message); return false; }
}

export const go = (path: string) => { location.hash = '#' + path; };

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return <a href={'#' + to} className={className}>{children}</a>;
}

const TONE: Record<string, string> = {
  Draft: 'gray', 'Pending Factory Head': 'amber', 'Pending Admin': 'amber', Rejected: 'red', Approved: 'blue',
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

/** File chooser. The file is uploaded to Google Drive only when the form is submitted. */
export function FileInput({ onChange, label }: { onChange: (f?: File) => void; label: string }) {
  return (
    <Field label={label}>
      <input type="file" accept="image/*,application/pdf" onChange={e => onChange(e.target.files?.[0])} />
    </Field>
  );
}

/** Opens a file stored in Google Drive (fetched through the app, so no Google sign-in is needed). */
export function FileLink({ id, label = 'View' }: { id?: string; label?: string }) {
  if (!id) return <span className="mut">—</span>;
  return (
    <a href="#" onClick={async e => {
      e.preventDefault();
      const w = window.open('', '_blank');
      try {
        const f = await fetchFile(id);
        const bytes = Uint8Array.from(atob(f.base64), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
        if (w) w.location.href = url; else window.open(url, '_blank');
      } catch (err) { w?.close(); alert((err as Error).message); }
    }}>{label}</a>
  );
}

/** Inline payment form: amount, date, optional/required screenshot (uploaded to Drive on submit). */
export function PayForm({ max, defaultAmount, requireShot, extra, folder, onSubmit, onCancel, submitLabel = 'Mark as paid' }: {
  max?: number; defaultAmount: number; requireShot?: boolean; extra?: ReactNode; folder: string;
  onSubmit: (amount: number, date: string, fileId?: string) => unknown; onCancel: () => void; submitLabel?: string;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [date, setDate] = useState(today());
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="payform">
      <Field label="Amount paid" hint={max !== undefined ? `Balance ${inr(max)}` : undefined}>
        <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(+e.target.value)} />
      </Field>
      <Field label="Payment date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <FileInput onChange={setFile} label={requireShot ? 'Payment screenshot (attach)' : 'Payment screenshot (optional)'} />
      {extra}
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={async () => {
          if (requireShot && !file) { alert('Attach the payment screenshot'); return; }
          setBusy(true);
          try {
            const fileId = await uploadFile(file, folder);
            await onSubmit(amount, date, fileId);
          } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? 'Saving…' : submitLabel}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
