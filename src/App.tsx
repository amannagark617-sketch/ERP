import { useEffect, useState } from 'react';
import { ROLES, ROLE_LABEL, Role } from './types';
import { actions, getStorageError, setRole, useRole, useStore } from './store';
import Dashboard from './pages/Dashboard';
import PoList from './pages/PoList';
import PoForm from './pages/PoForm';
import PoDetail from './pages/PoDetail';
import Receipts from './pages/Receipts';
import ReceiptForm from './pages/ReceiptForm';
import Accounts from './pages/Accounts';
import Vendors from './pages/Vendors';

const NAV: [string, string][] = [
  ['/', 'Dashboard'], ['/pos', 'Purchase Orders'], ['/receipts', 'Goods Receipt'], ['/accounts', 'Accounts'], ['/vendors', 'Vendors & Prices'],
];

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
  return <p>Page not found.</p>;
}

export default function App() {
  useStore();
  const role = useRole();
  const [path, setPath] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const h = () => { setPath(location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const err = getStorageError();
  return (
    <>
      <div className="topbar">
        <h1>Little Nap Recliners · Purchase-to-Inventory</h1>
        <span className="spacer" />
        <label>Acting as
          <select value={role} onChange={e => setRole(e.target.value as Role)}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <button className="btn sm" onClick={() => { if (confirm('Reset all data to the demo data?')) actions.reset(); }}>Reset demo data</button>
      </div>
      <nav>
        {NAV.map(([to, label]) => (
          <a key={to} href={'#' + to} className={(to === '/' ? path === '/' : path.startsWith(to)) ? 'active' : ''}>{label}</a>
        ))}
      </nav>
      <main>
        {err && <div className="warn">{err}</div>}
        <Route path={path} />
      </main>
    </>
  );
}
