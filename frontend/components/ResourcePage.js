'use client';
import { useCallback, useRef, useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea } from '@/components/ui';

/**
 * Config-driven list + create/edit page for simple master data.
 * fields: [{ key, label, type?: text|number|select|textarea|password|checkbox, options?, required?, hint?, createOnly?, editOnly?, wide? }]
 * columns: [{ label, render(row), right? }]
 */
export default function ResourcePage({
  title, subtitle, endpoint, manage, columns, fields, searchPlaceholder = 'Search...', newLabel = 'Add', noun = 'item',
  archivable = false, rowActions, extraParams, defaults = {}, transform,
}) {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const seq = useRef(0); // only the newest request may update the screen
  const load = useCallback(async () => {
    const reqId = ++seq.current;
    try {
      const r = await api(endpoint, { params: { search: q, page, limit: 15, ...extraParams } }); if (reqId !== seq.current) return;
      setRows(r.data); setMeta(r.meta); setError('');
    } catch (e) { setError(e.message); }
  }, [endpoint, q, page, extraParams]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); setQ(search); }, 300); return () => clearTimeout(t); }, [search]);

  const canManage = !manage || can(manage);

  async function deactivate(row) {
    if (!window.confirm(`Deactivate this ${noun}? It stays in old records but can no longer be used.`)) return;
    try { await api(`${endpoint}/${row._id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={canManage && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {newLabel}</Button>} />
      <Card>
        <div className="border-b border-line p-3">
          <div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>Nothing here yet.</Empty> : (
          <Table head={[...columns.map((c) => ({ label: c.label, right: c.right })), '']}>
            {rows.map((row) => (
              <tr key={row._id} className={row.isActive === false ? 'opacity-50' : ''}>
                {columns.map((c, i) => <td key={i} className={`px-3 py-2 ${c.right ? 'num text-right' : ''}`}>{c.render(row)}</td>)}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {rowActions?.(row, load)}
                  {canManage && <Button variant="ghost" size="sm" onClick={() => setEditing(row)}><Pencil className="h-4 w-4" /> Edit</Button>}
                  {canManage && archivable && row.isActive !== false && <Button variant="ghost" size="sm" onClick={() => deactivate(row)}><Trash2 className="h-4 w-4" /></Button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm">
            <span className="text-muted">Page {meta.page} of {meta.pages} ({meta.total})</span>
            <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button></div>
          </div>
        )}
      </Card>
      {editing && <ResourceForm row={editing === 'new' ? null : editing} {...{ endpoint, fields, noun, defaults, transform }} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function ResourceForm({ row, endpoint, fields, noun, defaults, transform, onClose, onSaved }) {
  const isEdit = !!row;
  const visible = fields.filter((f) => (isEdit ? !f.createOnly : !f.editOnly));
  const [v, setV] = useState(() => Object.fromEntries(visible.map((f) => [f.key, row?.[f.key] ?? defaults[f.key] ?? (f.type === 'checkbox' ? true : '')])));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setErr('');
    try {
      let body = {};
      visible.forEach((f) => {
        const val = v[f.key];
        if (f.type === 'number') { if (val !== '' && val !== null) body[f.key] = Number(val); } else if (f.type === 'checkbox') body[f.key] = !!val;
        else if (val !== '' && val !== undefined) body[f.key] = typeof val === 'string' ? val.trim() : val;
      });
      if (transform) body = transform(body, isEdit);
      if (isEdit) await api(`${endpoint}/${row._id}`, { method: 'PATCH', body });
      else await api(endpoint, { method: 'POST', body });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${noun}` : `New ${noun}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((f) => {
          const set = (e) => setV({ ...v, [f.key]: f.type === 'checkbox' ? e.target.checked : e.target.value });
          const label = `${f.label}${f.required && !isEdit ? ' *' : ''}`;
          if (f.type === 'checkbox') return <label key={f.key} className="flex items-center gap-2 pt-6"><input type="checkbox" checked={!!v[f.key]} onChange={set} /> {f.label}</label>;
          return (
            <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
              <Field label={label} hint={isEdit && f.type === 'password' ? 'Leave empty to keep the current password' : f.hint}>
                {f.type === 'select' ? <Select value={v[f.key]} onChange={set}>{f.options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</Select>
                  : f.type === 'textarea' ? <Textarea value={v[f.key]} onChange={set} />
                    : <Input type={f.type || 'text'} min={f.type === 'number' ? 0 : undefined} autoComplete={f.type === 'password' ? 'new-password' : undefined} value={v[f.key]} onChange={set} />}
              </Field>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export const ActiveBadge = ({ row }) => (row.isActive === false ? <Badge tone="bad">Inactive</Badge> : <Badge tone="good">Active</Badge>);
