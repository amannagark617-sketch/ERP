import { Component, ReactNode, useEffect, useState } from 'react';
import { init, loadFullHistory, logout, reload, useSnap } from './store';
import { api } from './api';
import { cfg } from './config';
import { currentToken } from './store';
import Dashboard from './pages/Dashboard';
import PoList from './pages/PoList';
import PoForm from './pages/PoForm';
import PoDetail from './pages/PoDetail';
import Receipts from './pages/Receipts';
import ReceiptForm from './pages/ReceiptForm';
import Accounts from './pages/Accounts';
import Vendors from './pages/Vendors';
import ItemsPrices from './pages/ItemsPrices';
import Stock from './pages/Stock';
import Admin from './pages/Admin';
import { Login, Setup } from './pages/Login';
import { run } from './ui';

function Route({ path }: { path: string }) {
  const p = path.split('/').filter(Boolean);
  if (p.length === 0) return <Dashboard />;
  if (p[0] === 'pos') {
    if (p.length === 1) return <PoList />;
    if (p[1] === 'new') return <PoForm />;
    if (p[2] === 'edit') return <PoForm id={p[1]} />;
    return <PoDetail id={p[1]} />;
  }
  if (p[0] === 'receipts') return p[2] === 'new' ? <ReceiptForm poId={p[1]} /> : <Receipts />;
  if (p[0] === 'accounts') return <Accounts />;
  if (p[0] === 'vendors') return <Vendors />;
  if (p[0] === 'items') return <ItemsPrices />;
  if (p[0] === 'stock') return <Stock />;
  if (p[0] === 'admin') return <Admin />;
  return <p>Page not found.</p>;
}

/** Last line of defence: a bad row in the Sheet must never leave users with a blank screen. */
class Guard extends Component<{ children: ReactNode; resetKey: string }, { error?: Error; key: string }> {
  state: { error?: Error; key: string } = { key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(p: { resetKey: string }, st: { key: string }) { return p.resetKey !== st.key ? { error: undefined, key: p.resetKey } : null; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="warn">
        <b>This page could not be shown.</b> A record in the Google Sheet may be incomplete (for example a deleted vendor or item that an older PO still uses).
        <div className="mut">{this.state.error.message}</div>
        <button className="btn sm" onClick={() => { this.setState({ error: undefined }); reload().catch(() => undefined); }}>Reload data</button>
      </div>
    );
  }
}

async function changePassword() {
  const oldPw = prompt('Current password');
  if (!oldPw) return;
  const newPw = prompt('New password (at least 6 characters)');
  if (!newPw) return;
  if (await run(() => api.changePassword(currentToken(), oldPw, newPw))) alert('Password changed.');
}

export default function App() {
  const s = useSnap();
  const [path, setPath] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => { init(); }, []);
  useEffect(() => {
    const h = () => { setPath(location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => { document.title = `${cfg.company} – ERP`; }, [s.syncedAt]);

  if (s.phase === 'boot') return <p style={{ padding: 24 }}>Loading…</p>;
  if (s.phase === 'setup') return <Setup />;
  if (s.phase === 'login' || !s.user) return <Login notice={s.error} />;

  // Every role sees only its own screens (Roles tab → "Screens this role sees")
  const ALL_NAV: [string, string][] = [
    ['/', 'Dashboard'], ['/pos', 'Purchase Orders'], ['/receipts', 'Goods Receipt'], ['/stock', 'Stock'], ['/accounts', 'Accounts'], ['/vendors', 'Vendors'], ['/items', 'Items & Prices'], ['/admin', 'Users & Access'],
  ];
  const NAV = ALL_NAV.filter(([, label]) => s.user!.screens.includes(label) && (label !== 'Users & Access' || s.user!.permissions.includes('users.manage')));
  const screenOf = (p: string) => { const hit = ALL_NAV.find(([to]) => (to === '/' ? p === '/' || p === '' : p === to || p.startsWith(to + '/'))); return hit ? hit[1] : ''; };
  const allowed = NAV.some(([, label]) => label === screenOf(path));
  return (
    <>
      <div className="topbar">
        <img className="logo" src={import.meta.env.BASE_URL + 'logo.png'} alt={cfg.company} />
        <h1>{cfg.company}<small>Purchase-to-Inventory</small></h1>
        <span className="spacer" />
        <span className="who">{s.user.name} · {s.user.role}{s.user.department ? ` · ${s.user.department}` : ''} · L{s.user.level}</span>
        <button className="btn sm" title="Reload from the Google Sheet" onClick={() => run(reload)}>{s.busy ? 'Saving…' : '↻ Refresh'}</button>
        <button className="btn sm" onClick={changePassword}>Password</button>
        <button className="btn sm" onClick={() => logout()}>Sign out</button>
      </div>
      <nav>
        {NAV.map(([to, label]) => (
          <a key={to} href={'#' + to} className={(to === '/' ? path === '/' : path.startsWith(to)) ? 'active' : ''}>{label}</a>
        ))}
      </nav>
      <main>
        {s.error && <div className="warn">{s.error}</div>}
        {s.partial && (
          <div className="note">Showing open work and everything since {s.cutoff} (older settled POs are hidden to keep things fast).{' '}
            <a href="#" onClick={e => { e.preventDefault(); run(loadFullHistory); }}>Load full history</a></div>
        )}
        {allowed ? <Guard resetKey={path}><Route path={path} /></Guard> : (
          <div className="note">This screen is not part of your role (<b>{s.user.role}</b>). <a href="#/">Go to your dashboard</a></div>
        )}
      </main>
    </>
  );
}
