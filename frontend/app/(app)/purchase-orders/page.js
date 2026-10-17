'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Ban, PackageCheck, Plus, Printer, Send, Trash2, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateOnly, money } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';
import MedicineSearch from '@/components/MedicineSearch';
import PrintDoc from '@/components/PrintDoc';

const TONE = { draft: 'neutral', sent: 'warn', partial: 'warn', received: 'good', cancelled: 'bad' };
const LABEL = { draft: 'Draft', sent: 'Sent to supplier', partial: 'Partly received', received: 'Received', cancelled: 'Cancelled' };

export default function PurchaseOrdersPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('open');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'new' | 'auto'
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try { const r = await api('/purchase-orders', { params: { status: filter === 'all' ? '' : filter, limit: 50 } }); setRows(r.data); setError(''); } catch (e) { setError(e.message); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Purchase orders" subtitle="Order from suppliers, then receive the stock against the order"
        actions={can('purchases:manage') && <>
          <Button variant="secondary" onClick={() => setModal('auto')}><Wand2 className="h-4 w-4" /> From low stock</Button>
          <Button onClick={() => setModal('new')}><Plus className="h-4 w-4" /> New order</Button>
        </>} />
      <Card>
        <div className="flex gap-2 border-b border-line p-3">
          {[['open', 'Open'], ['received', 'Received'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, label]) => (
            <button key={k} onClick={() => { setRows(null); setFilter(k); }} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === k ? 'border-pine bg-pine text-white' : 'border-line hover:bg-mint'}`}>{label}</button>
          ))}
        </div>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>{filter === 'open' ? 'No open orders. Use "From low stock" to make one in a click.' : 'Nothing here.'}</Empty> : (
          <Table head={['Order', 'Supplier', 'Created', 'Expected', { label: 'Estimate', right: true }, 'Status']}>
            {rows.map((o) => (
              <tr key={o._id} className="cursor-pointer hover:bg-paper" onClick={() => setOpenId(o._id)}>
                <td className="num px-3 py-2 font-medium">{o.poNo}</td><td className="px-3 py-2">{o.supplierName}</td><td className="px-3 py-2 text-muted">{dateOnly(o.createdAt)}</td><td className="px-3 py-2 text-muted">{o.expectedDate ? dateOnly(o.expectedDate) : '-'}</td>
                <td className="num px-3 py-2 text-right">{money(o.estTotal)}</td><td className="px-3 py-2"><Badge tone={TONE[o.status]}>{LABEL[o.status]}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {modal === 'auto' && <AutoOrder onClose={() => setModal(null)} onCreated={(po) => { setModal(null); load(); setOpenId(po._id); }} />}
      {modal === 'new' && <OrderForm onClose={() => setModal(null)} onSaved={(po) => { setModal(null); load(); setOpenId(po._id); }} />}
      {openId && <OrderDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

function useSuppliers() {
  const [list, setList] = useState([]);
  useEffect(() => { api('/suppliers', { params: { active: 'true', limit: 100 } }).then((r) => setList(r.data)).catch(() => {}); }, []);
  return list;
}

function AutoOrder({ onClose, onCreated }) {
  const suppliers = useSuppliers();
  const [supplier, setSupplier] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr('');
    try { onCreated((await api('/purchase-orders/from-reorder', { method: 'POST', body: { supplier } })).data); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Order everything that is low or out of stock" width="max-w-md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={!supplier}>Create draft order</Button></>}>
      <ErrorNote error={err} />
      <p className="mb-3 text-sm text-muted">Pick a supplier. The order is filled with that supplier&apos;s medicines that are low or finished, in whole boxes (enough to fill up to the medicine's maximum level, or about twice the minimum if none is set). You can change the quantities before sending.</p>
      <Field label="Supplier"><Select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">Select...</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</Select></Field>
      <p className="mt-3 text-xs text-muted">Medicines are matched to a supplier on the Medicines page (the &quot;Supplier&quot; field).</p>
    </Modal>
  );
}

// Used for a new order and for editing a draft.
function OrderForm({ order, onClose, onSaved }) {
  const suppliers = useSuppliers();
  const [supplier, setSupplier] = useState(order?.supplier?._id || order?.supplier || '');
  const [lines, setLines] = useState((order?.items || []).map((i) => ({ medicine: i.medicine._id || i.medicine, name: i.name, boxes: i.orderedBoxes, costPerBox: i.costPerBox })));
  const [expected, setExpected] = useState(order?.expectedDate ? order.expectedDate.slice(0, 10) : '');
  const [notes, setNotes] = useState(order?.notes || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setLine = (i, patch) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const add = (m) => setLines((ls) => (ls.some((l) => l.medicine === m._id) ? ls : [...ls, { medicine: m._id, name: m.name, boxes: 1, costPerBox: m.purchasePrice || 0 }]));
  const est = lines.reduce((s, l) => s + (Number(l.boxes) || 0) * (Number(l.costPerBox) || 0), 0);
  async function save() {
    setBusy(true); setErr('');
    const items = lines.map((l) => ({ medicine: l.medicine, boxes: Number(l.boxes), costPerBox: Number(l.costPerBox) || 0 }));
    try {
      const r = order
        ? await api(`/purchase-orders/${order._id}`, { method: 'PATCH', body: { items, notes, expectedDate: expected || null } })
        : await api('/purchase-orders', { method: 'POST', body: { supplier, items, notes: notes || undefined, expectedDate: expected || undefined } });
      onSaved(r.data);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={order ? `Edit ${order.poNo}` : 'New purchase order'} width="max-w-3xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!supplier || !lines.length || lines.some((l) => !(Number(l.boxes) >= 1))}>Save {est ? `- about ${money(est)}` : ''}</Button></>}>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier *"><Select value={supplier} onChange={(e) => setSupplier(e.target.value)} disabled={!!order}><option value="">Select...</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</Select></Field>
        <Field label="Expected delivery"><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
        <Field label="Add medicine"><MedicineSearch placeholder="Search to add..." onPick={add} /></Field>
      </div>
      <div className="mt-4">
        {lines.length === 0 ? <p className="rounded-md border border-dashed border-line py-8 text-center text-muted">Search a medicine above to add it.</p> : (
          <Table head={['Medicine', { label: 'Boxes', right: true }, { label: 'Cost / box', right: true }, { label: 'Line', right: true }, '']}>
            {lines.map((l, i) => (
              <tr key={l.medicine}>
                <td className="px-3 py-2 font-medium">{l.name}</td>
                <td className="px-3 py-2 text-right"><Input className="num w-20 text-right" type="number" min="1" value={l.boxes} onChange={(e) => setLine(i, { boxes: e.target.value })} /></td>
                <td className="px-3 py-2 text-right"><Input className="num w-24 text-right" type="number" min="0" value={l.costPerBox} onChange={(e) => setLine(i, { costPerBox: e.target.value })} /></td>
                <td className="num px-3 py-2 text-right">{money((Number(l.boxes) || 0) * (Number(l.costPerBox) || 0))}</td>
                <td className="px-3 py-2"><button className="rounded p-2 text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <div className="mt-3"><Field label="Notes for the supplier"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
    </Modal>
  );
}

function OrderDetail({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const [po, setPo] = useState(null);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => api(`/purchase-orders/${id}`).then((r) => setPo(r.data)).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { reload(); }, [reload]);

  async function setStatus(status) {
    setBusy(true); setErr('');
    try { await api(`/purchase-orders/${id}/status`, { method: 'POST', body: { status, reason: reason || undefined } }); setCancelling(false); await reload(); onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  if (editing && po) return <OrderForm order={po} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); onChanged(); }} />;
  const manage = can('purchases:manage');
  return (
    <Modal open onClose={onClose} title={po ? po.poNo : 'Purchase order'} width="max-w-3xl"
      footer={po && <>
        <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
        {manage && po.status === 'draft' && <><Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button><Button onClick={() => setStatus('sent')} loading={busy}><Send className="h-4 w-4" /> Mark as sent</Button></>}
        {manage && ['sent', 'partial'].includes(po.status) && <Link href={`/purchases?po=${po._id}`}><Button><PackageCheck className="h-4 w-4" /> Receive stock</Button></Link>}
      </>}>
      <ErrorNote error={err} />
      {!po ? <Spinner /> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="font-medium">{po.supplierName}</p><p className="text-xs text-muted">Created {dateOnly(po.createdAt)} by {po.createdByName}{po.expectedDate ? ` | expected ${dateOnly(po.expectedDate)}` : ''}</p></div>
            <Badge tone={TONE[po.status]}>{LABEL[po.status]}</Badge>
          </div>
          <div className="mt-3">
            <Table head={['Medicine', { label: 'Ordered', right: true }, { label: 'Received', right: true }, { label: 'Cost / box', right: true }, { label: 'Line', right: true }]}>
              {po.items.map((i) => {
                const upb = i.unitsPerBox || 1; const got = Math.floor(i.receivedBase / upb);
                return (
                  <tr key={i._id}>
                    <td className="px-3 py-2 font-medium">{i.name}</td><td className="num px-3 py-2 text-right">{i.orderedBoxes} box</td>
                    <td className={`num px-3 py-2 text-right ${i.receivedBase >= i.orderedBoxes * upb ? 'text-pine-dark' : i.receivedBase ? 'text-amber' : 'text-muted'}`}>{got} box{i.receivedBase % upb ? ` + ${i.receivedBase % upb} units` : ''}</td>
                    <td className="num px-3 py-2 text-right">{money(i.costPerBox)}</td><td className="num px-3 py-2 text-right">{money(i.orderedBoxes * i.costPerBox)}</td>
                  </tr>
                );
              })}
            </Table>
          </div>
          <p className="num mt-2 text-right text-base font-semibold">Estimated total {money(po.estTotal)}</p>
          {po.notes && <p className="mt-2 text-sm text-muted">Notes: {po.notes}</p>}
          {po.status === 'cancelled' && <p className="mt-2 rounded bg-danger-soft p-2 text-sm text-danger">Cancelled: {po.cancelReason}</p>}
          {manage && ['draft', 'sent', 'partial'].includes(po.status) && (
            cancelling ? (
              <div className="mt-3 flex items-end gap-2"><Field label="Why cancel this order?"><Input className="w-72" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field><Button variant="danger" onClick={() => setStatus('cancelled')} loading={busy} disabled={reason.trim().length < 3}>Cancel order</Button><Button variant="ghost" onClick={() => setCancelling(false)}>Keep</Button></div>
            ) : <button className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-danger" onClick={() => setCancelling(true)}><Ban className="h-3.5 w-3.5" /> Cancel this order</button>
          )}
          <PrintDoc title={`Purchase order ${po.poNo}`} subtitle={`To: ${po.supplierName}${po.expectedDate ? ` | Needed by ${dateOnly(po.expectedDate)}` : ''}`}>
            <table><thead><tr><th>#</th><th>Medicine</th><th className="r">Boxes</th></tr></thead>
              <tbody>{po.items.map((i, n) => <tr key={i._id}><td>{n + 1}</td><td>{i.name}</td><td className="r">{i.orderedBoxes}</td></tr>)}</tbody></table>
            {po.notes && <p>Notes: {po.notes}</p>}
            <p className="mt-6">Authorised by: {po.createdByName}</p>
          </PrintDoc>
        </>
      )}
    </Modal>
  );
}
