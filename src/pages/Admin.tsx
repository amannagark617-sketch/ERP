import { useEffect, useState } from 'react';
import { api } from '../api';
import { reload, useAuth, useSnap } from '../store';
import { Badge, Card, Field, run } from '../ui';
import { RoleInfo } from '../types';
import { currentToken } from '../store';

interface U { loginId: string; name: string; role: string; department: string; level: number; reportsTo: string; active: boolean; password?: string }
const blank: U = { loginId: '', name: '', role: '', department: '', level: 1, reportsTo: '', active: true, password: '' };

export default function Admin() {
  const { can } = useAuth();
  const [users, setUsers] = useState<U[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [edit, setEdit] = useState<(U & { isNew?: boolean }) | null>(null);
  const load = async () => { const r = await api.usersList(currentToken()); setUsers(r.users); setRoles(r.roles); };
  useEffect(() => { if (can('users.manage')) load().catch(e => alert(e.message)); }, []);
  useSnap();
  if (!can('users.manage')) return <div className="note">Only an Admin can manage users.</div>;

  const save = async () => {
    if (await run(async () => { const r = await api.usersSave(currentToken(), edit); setUsers(r.users); })) setEdit(null);
  };
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Users &amp; Access</h2>
        <button className="btn primary" onClick={() => setEdit({ ...blank, isNew: true })}>+ New user</button>
      </div>
      <div className="note">
        Users live in the <b>Users</b> tab of your Google Sheet. You can also edit it there directly: type a new plain-text password in the
        Password column and it is secured automatically at that person's next login. Roles, permissions and approval limits are in the
        <b> Roles</b>, <b>Permissions</b> and <b>ApprovalRules</b> tabs – changes apply the next time someone logs in or refreshes.
      </div>
      {edit && (
        <Card title={edit.isNew ? 'New user' : `Edit ${edit.loginId}`}>
          <div className="form2">
            <Field label="Login ID"><input value={edit.loginId} disabled={!edit.isNew} onChange={e => setEdit({ ...edit, loginId: e.target.value })} /></Field>
            <Field label="Full name"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Role">
              <select value={edit.role} onChange={e => {
                const r = roles.find(x => x.role === e.target.value);
                setEdit({ ...edit, role: e.target.value, department: edit.department || r?.department || '', level: r?.level ?? edit.level });
              }}>
                <option value="">Select…</option>{roles.map(r => <option key={r.role}>{r.role}</option>)}
              </select>
            </Field>
            <Field label="Department"><input value={edit.department} onChange={e => setEdit({ ...edit, department: e.target.value })} /></Field>
            <Field label="Hierarchy level" hint="Higher number = senior. Used with the Permissions sheet."><input type="number" min={0} value={edit.level} onChange={e => setEdit({ ...edit, level: +e.target.value })} /></Field>
            <Field label="Reports to (Login ID)"><input value={edit.reportsTo} onChange={e => setEdit({ ...edit, reportsTo: e.target.value })} /></Field>
            <Field label={edit.isNew ? 'Password' : 'New password (leave blank to keep)'}><input type="password" value={edit.password} onChange={e => setEdit({ ...edit, password: e.target.value })} /></Field>
            <Field label="Active"><select value={edit.active ? 'Yes' : 'No'} onChange={e => setEdit({ ...edit, active: e.target.value === 'Yes' })}><option>Yes</option><option>No</option></select></Field>
          </div>
          <div className="row"><button className="btn primary" onClick={save}>Save user</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
        </Card>
      )}
      <Card>
        <div className="tablewrap"><table>
          <thead><tr><th>Login ID</th><th>Name</th><th>Role</th><th>Department</th><th className="r">Level</th><th>Reports to</th><th>Status</th><th></th></tr></thead>
          <tbody>{[...users].sort((a, b) => b.level - a.level).map(u => (
            <tr key={u.loginId}>
              <td>{u.loginId}</td><td>{u.name}</td><td>{u.role}</td><td>{u.department}</td><td className="r">{u.level}</td><td>{u.reportsTo || '—'}</td>
              <td><Badge>{u.active ? 'Resolved' : 'Rejected'}</Badge> {u.active ? 'Active' : 'Inactive'}</td>
              <td className="r"><button className="btn sm" onClick={() => setEdit({ ...u, password: '' })}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      <button className="btn" onClick={() => reload()}>Refresh data from Sheet</button>
    </>
  );
}
