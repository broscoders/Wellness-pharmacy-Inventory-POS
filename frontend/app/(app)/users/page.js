'use client';
import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateTime } from '@/lib/format';
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';

const ROLES = [['admin', 'Admin (owner)'], ['pharmacist', 'Pharmacist'], ['cashier', 'Cashier'], ['inventory', 'Inventory staff']];

export default function UsersPage() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => api('/users').then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader title="Staff & roles" subtitle="Who can log in and what they can do" actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add staff</Button>} />
      <Card>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : (
          <Table head={['Name', 'Email', 'Role', 'Status', 'Last login', '']}>
            {rows.map((u) => (
              <tr key={u.id} className={u.isActive ? '' : 'opacity-50'}>
                <td className="px-3 py-2 font-medium">{u.name}{u.id === me.id && <span className="ml-2 text-xs text-muted">(you)</span>}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2"><Badge tone={u.role === 'admin' ? 'good' : 'neutral'}>{ROLES.find((r) => r[0] === u.role)?.[1]}</Badge></td>
                <td className="px-3 py-2">{u.isActive ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Disabled</Badge>}</td>
                <td className="px-3 py-2 text-muted">{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}</td>
                <td className="px-3 py-2 text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /> Edit</Button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && <UserForm user={editing === 'new' ? null : editing} isSelf={editing !== 'new' && editing.id === me.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function UserForm({ user, isSelf, onClose, onSaved }) {
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', role: user?.role || 'cashier', password: '', isActive: user?.isActive ?? true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save() {
    setBusy(true); setErr('');
    try {
      if (user) {
        const body = { name: f.name, phone: f.phone || undefined, role: f.role, isActive: f.isActive };
        if (f.password) body.password = f.password;
        await api(`/users/${user.id}`, { method: 'PATCH', body });
      } else {
        await api('/users', { method: 'POST', body: { name: f.name, email: f.email, phone: f.phone || undefined, role: f.role, password: f.password } });
      }
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={user ? `Edit ${user.name}` : 'Add staff member'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Email *"><Input type="email" disabled={!!user} value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Role"><Select value={f.role} onChange={set('role')} disabled={isSelf}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label={user ? 'New password' : 'Password *'} hint={user ? 'Leave empty to keep the current one' : 'At least 8 characters'}><Input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        {user && <label className="flex items-center gap-2 pt-6"><input type="checkbox" disabled={isSelf} checked={f.isActive} onChange={set('isActive')} /> Account active</label>}
      </div>
    </Modal>
  );
}
