'use client';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, PackageX, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateOnly, dateTime, money, stockText } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';

const TABS = [['batches', 'Batches & expiry'], ['alerts', 'Alerts'], ['movements', 'Stock history']];

export default function InventoryPage() {
  const [tab, setTab] = useState('batches');
  return (
    <>
      <PageHeader title="Inventory" subtitle="Batches, expiry dates, alerts and every stock movement" />
      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 font-medium ${tab === k ? 'border-pine text-pine-dark' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
        ))}
      </div>
      {tab === 'batches' && <Batches />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'movements' && <Movements />}
    </>
  );
}

function expiryBadge(b) {
  if (b.status === 'expired') return <Badge tone="bad">Expired {Math.abs(b.daysLeft)}d ago</Badge>;
  if (b.status === 'expiring_30') return <Badge tone="bad">{b.daysLeft} days left</Badge>;
  if (b.status === 'expiring_60' || b.status === 'expiring_90') return <Badge tone="warn">{b.daysLeft} days left</Badge>;
  return <Badge tone="good">{b.daysLeft} days</Badge>;
}

function Batches() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [adjusting, setAdjusting] = useState(null);

  const load = useCallback(async () => {
    const params = { page, limit: 20 };
    if (filter === 'expired') params.status = 'expired';
    else if (filter) params.expiringInDays = filter;
    try { const r = await api('/inventory/batches', { params }); setRows(r.data); setMeta(r.meta); setError(''); } catch (e) { setError(e.message); }
  }, [page, filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <Select className="w-56" value={filter} onChange={(e) => { setPage(1); setFilter(e.target.value); }}>
          <option value="">All batches in stock (earliest expiry first)</option><option value="expired">Expired only</option><option value="30">Expiring within 30 days</option><option value="60">Expiring within 60 days</option><option value="90">Expiring within 90 days</option>
        </Select>
      </div>
      <ErrorNote error={error} />
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No batches match.</Empty> : (
        <Table head={['Medicine', 'Batch', 'Expiry', { label: 'In stock', right: true }, 'Supplier', '']}>
          {rows.map((b) => (
            <tr key={b._id}>
              <td className="px-3 py-2 font-medium">{b.medicine?.name || '-'}</td>
              <td className="num px-3 py-2">{b.batchNumber}</td>
              <td className="px-3 py-2"><span className="num mr-2">{dateOnly(b.expiryDate)}</span>{expiryBadge(b)}</td>
              <td className="num px-3 py-2 text-right">{stockText(b.display)}<p className="text-xs text-muted">{b.quantity} units</p></td>
              <td className="px-3 py-2">{b.supplier?.name || '-'}</td>
              <td className="px-3 py-2 text-right">{can('inventory:adjust') && <Button variant="ghost" size="sm" onClick={() => setAdjusting(b)}><SlidersHorizontal className="h-4 w-4" /> Adjust</Button>}</td>
            </tr>
          ))}
        </Table>
      )}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm"><span className="text-muted">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      )}
      {adjusting && <AdjustModal batch={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />}
    </Card>
  );
}

function AdjustModal({ batch, onClose, onSaved }) {
  const [f, setF] = useState({ mode: 'remove', box: '', strip: '', unit: '', reason: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const n = (v) => Number(v) || 0;

  async function save() {
    setBusy(true); setErr('');
    try {
      await api(`/inventory/batches/${batch._id}/adjust`, { method: 'POST', body: { mode: f.mode, reason: f.reason, quantity: { box: n(f.box), strip: n(f.strip), unit: n(f.unit) } } });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Adjust stock: ${batch.medicine?.name} (batch ${batch.batchNumber})`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={f.reason.trim().length < 3}>Apply adjustment</Button></>}>
      <p className="mb-3 text-sm text-muted">Currently {stockText(batch.display)} ({batch.quantity} units). Every adjustment is recorded with your name and the reason.</p>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3"><Field label="What do you want to do?"><Select value={f.mode} onChange={set('mode')}><option value="remove">Remove stock (damaged, expired, lost)</option><option value="add">Add stock (found, correction)</option><option value="set">Set exact quantity (stock count)</option></Select></Field></div>
        <Field label="Boxes"><Input type="number" min="0" value={f.box} onChange={set('box')} /></Field>
        <Field label="Strips"><Input type="number" min="0" value={f.strip} onChange={set('strip')} /></Field>
        <Field label="Units"><Input type="number" min="0" value={f.unit} onChange={set('unit')} /></Field>
        <div className="sm:col-span-3"><Field label="Reason *"><Input value={f.reason} onChange={set('reason')} placeholder="e.g. Expired stock destroyed" /></Field></div>
      </div>
    </Modal>
  );
}

function Alerts() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/inventory/alerts').then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorNote error={error} />;
  if (!d) return <Spinner />;
  const { data, counts } = d;

  const Section = ({ icon: Icon, title, tone, rows, render, head }) => (
    <Card className="mb-4">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3"><Icon className={`h-5 w-5 ${tone === 'bad' ? 'text-danger' : 'text-amber'}`} /><h2 className="font-semibold">{title}</h2><Badge tone={rows.length ? tone : 'good'}>{rows.length}</Badge></div>
      {rows.length === 0 ? <p className="p-4 text-sm text-muted">Nothing to worry about.</p> : <Table head={head}>{rows.map(render)}</Table>}
    </Card>
  );
  const batchRow = (r) => (<tr key={r.batchId}><td className="px-3 py-2 font-medium">{r.medicine}</td><td className="num px-3 py-2">{r.batchNumber}</td><td className="num px-3 py-2">{dateOnly(r.expiryDate)}</td><td className="num px-3 py-2">{r.daysLeft < 0 ? `${Math.abs(r.daysLeft)} days ago` : `${r.daysLeft} days`}</td><td className="num px-3 py-2 text-right">{stockText(r.display)}</td></tr>);
  const bHead = ['Medicine', 'Batch', 'Expiry', 'Time left', { label: 'Quantity', right: true }];
  const stockRow = (r) => (<tr key={r._id}><td className="px-3 py-2 font-medium">{r.name}</td><td className="num px-3 py-2 text-right">{stockText(r.display)}</td><td className="num px-3 py-2 text-right">{r.minStockLevel} units</td></tr>);
  const sHead = ['Medicine', { label: 'Available', right: true }, { label: 'Minimum level', right: true }];

  return (
    <>
      <Section icon={PackageX} title="Expired stock (blocked from sale)" tone="bad" rows={data.expired} render={batchRow} head={bHead} />
      <Section icon={Clock} title={`Expiring within 30 days (${counts.nearExpiry30})`} tone="bad" rows={data.nearExpiry.d30} render={batchRow} head={bHead} />
      <Section icon={Clock} title={`Expiring in 31-60 days (${counts.nearExpiry60})`} tone="warn" rows={data.nearExpiry.d60} render={batchRow} head={bHead} />
      <Section icon={Clock} title={`Expiring in 61-90 days (${counts.nearExpiry90})`} tone="warn" rows={data.nearExpiry.d90} render={batchRow} head={bHead} />
      <Section icon={AlertTriangle} title="Low stock" tone="warn" rows={data.lowStock} render={stockRow} head={sHead} />
      <Section icon={AlertTriangle} title="Out of stock" tone="bad" rows={data.outOfStock} render={stockRow} head={sHead} />
    </>
  );
}

const TYPE = { opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale', sale_return: 'Customer return', purchase_return: 'Returned to supplier', adjustment: 'Adjustment', expired_writeoff: 'Expired write-off' };

function Movements() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api('/inventory/movements', { params: { page, limit: 30, type } }).then((r) => { setRows(r.data); setMeta(r.meta); }).catch((e) => setError(e.message)); }, [page, type]);
  return (
    <Card>
      <div className="border-b border-line p-3"><Select className="w-52" value={type} onChange={(e) => { setPage(1); setType(e.target.value); }}><option value="">All movements</option>{Object.entries(TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
      <ErrorNote error={error} />
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No movements.</Empty> : (
        <Table head={['When', 'Medicine', 'Batch', 'Type', { label: 'Change (units)', right: true }, { label: 'Balance', right: true }, 'By', 'Reason']}>
          {rows.map((m) => (
            <tr key={m._id}>
              <td className="whitespace-nowrap px-3 py-2 text-muted">{dateTime(m.createdAt)}</td>
              <td className="px-3 py-2">{m.medicine?.name}</td><td className="num px-3 py-2">{m.batch?.batchNumber}</td>
              <td className="px-3 py-2"><Badge tone={m.quantity > 0 ? 'good' : 'neutral'}>{TYPE[m.type] || m.type}</Badge></td>
              <td className={`num px-3 py-2 text-right font-medium ${m.quantity > 0 ? 'text-pine-dark' : 'text-danger'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
              <td className="num px-3 py-2 text-right">{m.balanceAfter}</td><td className="px-3 py-2">{m.user?.name || '-'}</td><td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted" title={m.reason}>{m.reason}</td>
            </tr>
          ))}
        </Table>
      )}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm"><span className="text-muted">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      )}
    </Card>
  );
}
