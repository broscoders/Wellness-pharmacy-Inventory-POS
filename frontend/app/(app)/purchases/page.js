'use client';
import { useCallback, useRef, useEffect, useState } from 'react';
import { Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateOnly, dateTime, money } from '@/lib/format';
import { round2, unitsPerBox } from '@/lib/units';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';
import MedicineSearch from '@/components/MedicineSearch';

const STATUS = { received: ['good', 'Received'], partially_returned: ['warn', 'Part returned'], returned: ['neutral', 'Returned'] };

export default function PurchasesPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const seq = useRef(0); // only the newest request may update the screen
  const load = useCallback(async () => {
    const reqId = ++seq.current;
    try { const r = await api('/purchases', { params: { search: q, page, limit: 15 } }); if (reqId !== seq.current) return; setRows(r.data); setMeta(r.meta); setError(''); } catch (e) { setError(e.message); }
  }, [q, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); setQ(search); }, 300); return () => clearTimeout(t); }, [search]);

  return (
    <>
      <PageHeader title="Purchases" subtitle="Stock bought from suppliers. Saving a purchase adds stock and updates the supplier ledger."
        actions={can('purchases:manage') && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New purchase</Button>} />
      <Card>
        <div className="border-b border-line p-3"><div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="Purchase no, supplier, supplier invoice..." value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No purchases yet.</Empty> : (
          <Table head={['Purchase', 'Date', 'Supplier', 'Supplier invoice', { label: 'Total', right: true }, { label: 'Paid', right: true }, { label: 'Due', right: true }, 'Status']}>
            {rows.map((p) => (
              <tr key={p._id} className="cursor-pointer hover:bg-mint/60" onClick={() => setOpenId(p._id)}>
                <td className="num px-3 py-2 font-medium">{p.purchaseNo}</td><td className="px-3 py-2 text-muted">{dateOnly(p.purchaseDate)}</td><td className="px-3 py-2">{p.supplierName}</td><td className="px-3 py-2">{p.supplierInvoiceNo || '-'}</td>
                <td className="num px-3 py-2 text-right">{money(p.total)}</td><td className="num px-3 py-2 text-right">{money(p.paidAmount)}</td><td className="num px-3 py-2 text-right">{p.dueAmount ? <span className="text-amber">{money(p.dueAmount)}</span> : '-'}</td>
                <td className="px-3 py-2"><Badge tone={STATUS[p.status][0]}>{STATUS[p.status][1]}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm"><span className="text-muted">Page {meta.page} of {meta.pages}</span>
            <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
        )}
      </Card>
      {creating && <NewPurchase onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {openId && <PurchaseDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

const blankLine = (med) => ({ med, batchNumber: '', expiryDate: '', box: '', strip: '', unit: '', pricePerBox: med.purchasePrice || '', discountPercent: '' });
const n = (v) => Number(v) || 0;
const baseOf = (l) => n(l.box) * unitsPerBox(l.med) + n(l.strip) * (l.med.unitsPerStrip || 1) + n(l.unit);
const lineTotal = (l) => round2((n(l.pricePerBox) * baseOf(l)) / unitsPerBox(l.med) * (1 - n(l.discountPercent) / 100));

function NewPurchase({ onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [f, setF] = useState({ supplier: '', supplierInvoiceNo: '', purchaseDate: new Date().toISOString().slice(0, 10), discount: '', paidAmount: '', paymentMethod: 'cash', notes: '' });
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/suppliers', { params: { active: 'true', limit: 100 } }).then((r) => setSuppliers(r.data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLine = (i, patch) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const total = round2(subtotal - n(f.discount));
  const due = round2(total - n(f.paidAmount));
  const valid = f.supplier && lines.length > 0 && lines.every((l) => l.batchNumber && l.expiryDate && baseOf(l) > 0) && n(f.paidAmount) <= total && n(f.discount) <= subtotal;

  async function save() {
    setBusy(true); setErr('');
    try {
      await api('/purchases', {
        method: 'POST',
        body: {
          supplier: f.supplier, supplierInvoiceNo: f.supplierInvoiceNo || undefined, purchaseDate: f.purchaseDate || undefined, discount: n(f.discount) || undefined,
          paidAmount: n(f.paidAmount), paymentMethod: f.paymentMethod, notes: f.notes || undefined,
          items: lines.map((l) => ({ medicine: l.med._id, batchNumber: l.batchNumber, expiryDate: l.expiryDate, quantity: { box: n(l.box), strip: n(l.strip), unit: n(l.unit) }, pricePerBox: n(l.pricePerBox), discountPercent: n(l.discountPercent) || undefined })),
        },
      });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="New purchase" width="max-w-6xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!valid}>Save purchase {total ? `- ${money(total)}` : ''}</Button></>}>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Supplier *"><Select value={f.supplier} onChange={set('supplier')}><option value="">Select...</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</Select></Field>
        <Field label="Supplier invoice no."><Input value={f.supplierInvoiceNo} onChange={set('supplierInvoiceNo')} /></Field>
        <Field label="Date"><Input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} /></Field>
        <Field label="Add medicine"><MedicineSearch placeholder="Search to add a line..." onPick={(m) => setLines((ls) => [...ls, blankLine(m)])} /></Field>
      </div>

      <div className="mt-4 overflow-x-auto">
        {lines.length === 0 ? <p className="rounded-md border border-dashed border-line py-8 text-center text-muted">Search a medicine above to add it to this purchase.</p> : (
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-line text-left text-[13px] text-muted"><th className="px-2 py-2">Medicine</th><th className="px-2">Batch *</th><th className="px-2">Expiry *</th><th className="px-2">Box</th><th className="px-2">Strip</th><th className="px-2">Unit</th><th className="px-2">Cost / box</th><th className="px-2">Disc %</th><th className="px-2 text-right">Line total</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-2 py-2 font-medium">{l.med.name}<p className="text-xs font-normal text-muted">1 box = {l.med.stripsPerBox} strips x {l.med.unitsPerStrip}</p></td>
                  <td className="px-2"><Input className="w-28" value={l.batchNumber} onChange={(e) => setLine(i, { batchNumber: e.target.value })} /></td>
                  <td className="px-2"><Input className="w-36" type="date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} /></td>
                  {['box', 'strip', 'unit'].map((k) => <td key={k} className="px-2"><Input className="num w-16" type="number" min="0" value={l[k]} onChange={(e) => setLine(i, { [k]: e.target.value })} /></td>)}
                  <td className="px-2"><Input className="num w-24" type="number" min="0" value={l.pricePerBox} onChange={(e) => setLine(i, { pricePerBox: e.target.value })} /></td>
                  <td className="px-2"><Input className="num w-16" type="number" min="0" max="100" value={l.discountPercent} onChange={(e) => setLine(i, { discountPercent: e.target.value })} /></td>
                  <td className="num px-2 text-right font-medium">{money(lineTotal(l))}</td>
                  <td className="px-2"><button className="rounded p-2 text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_280px]">
        <Field label="Notes"><Input value={f.notes} onChange={set('notes')} /></Field>
        <div className="num space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="text-muted">Extra discount</span><Input className="num h-8 w-28 text-right" type="number" min="0" value={f.discount} onChange={set('discount')} /></div>
          <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{money(total)}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="text-muted">Paid now</span><Input className="num h-8 w-28 text-right" type="number" min="0" value={f.paidAmount} onChange={set('paidAmount')} /></div>
          <div className="flex items-center justify-between gap-3"><span className="text-muted">Method</span><Select className="h-8 w-28" value={f.paymentMethod} onChange={set('paymentMethod')}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank</option></Select></div>
          <div className="flex justify-between font-medium"><span>Goes to supplier payable</span><span className={due > 0 ? 'text-amber' : ''}>{money(Math.max(due, 0))}</span></div>
          {n(f.paidAmount) > total && <p className="text-danger">Paid amount is more than the total.</p>}
        </div>
      </div>
    </Modal>
  );
}

function PurchaseDetail({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('view');
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => api(`/purchases/${id}`).then(setData).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { reload(); }, [reload]);

  if (!data) return <Modal open onClose={onClose} title="Purchase"><Spinner /></Modal>;
  const p = data.data;

  async function submitReturn() {
    const items = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([purchaseItem, v]) => ({ purchaseItem, quantity: { unit: Number(v) } }));
    if (!items.length) { setErr('Enter a quantity for at least one item'); return; }
    setBusy(true); setErr('');
    try { await api(`/purchases/${id}/return`, { method: 'POST', body: { items, reason } }); setMode('view'); setQty({}); setReason(''); await reload(); onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`${p.purchaseNo} - ${p.supplier?.name || p.supplierName}`} width="max-w-4xl"
      footer={mode === 'view' ? (can('purchases:return') && p.status !== 'returned' && <Button variant="secondary" onClick={() => { setMode('return'); setErr(''); }}><RotateCcw className="h-4 w-4" /> Return to supplier</Button>)
        : <><Button variant="secondary" onClick={() => setMode('view')}>Back</Button><Button onClick={submitReturn} loading={busy} disabled={reason.trim().length < 3}>Confirm return</Button></>}>
      <ErrorNote error={err} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted"><Badge tone={STATUS[p.status][0]}>{STATUS[p.status][1]}</Badge>{dateTime(p.purchaseDate)} | Supplier invoice {p.supplierInvoiceNo || '-'} | by {p.createdByName}</div>
      <Table head={['Medicine', 'Batch', 'Expiry', { label: 'Units', right: true }, { label: 'Returned', right: true }, { label: 'Cost / box', right: true }, { label: 'Line total', right: true }, ...(mode === 'return' ? [{ label: 'Return now (units)', right: true }] : [])]}>
        {p.items.map((it) => (
          <tr key={it._id}>
            <td className="px-3 py-2 font-medium">{it.name}</td><td className="num px-3 py-2">{it.batchNumber}</td><td className="num px-3 py-2">{dateOnly(it.expiryDate)}</td>
            <td className="num px-3 py-2 text-right">{it.baseQty}</td><td className="num px-3 py-2 text-right">{it.returnedBase}</td><td className="num px-3 py-2 text-right">{money(it.pricePerBox)}</td><td className="num px-3 py-2 text-right">{money(it.lineTotal)}</td>
            {mode === 'return' && <td className="px-3 py-2 text-right"><Input className="num ml-auto h-8 w-24 text-right" type="number" min="0" max={it.baseQty - it.returnedBase} disabled={it.returnedBase >= it.baseQty} value={qty[it._id] || ''} onChange={(e) => setQty({ ...qty, [it._id]: e.target.value })} /></td>}
          </tr>
        ))}
      </Table>
      {mode === 'return' ? <div className="mt-3 max-w-md"><Field label="Return reason *"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged packs" /></Field></div> : (
        <div className="num mt-3 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{money(p.subtotal)}</span></div>
          {p.discount > 0 && <div className="flex justify-between"><span className="text-muted">Discount</span><span>- {money(p.discount)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Total</span><span>{money(p.total)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Paid</span><span>{money(p.paidAmount)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Left unpaid at purchase</span><span>{money(p.dueAmount)}</span></div>
        </div>
      )}
      {mode === 'view' && data.returns?.length > 0 && <div className="mt-4"><h3 className="mb-1 font-semibold">Returns to supplier</h3>{data.returns.map((r) => <p key={r._id} className="text-sm text-muted">{r.returnNo}: {money(r.totalValue)} ({r.reason})</p>)}</div>}
    </Modal>
  );
}
