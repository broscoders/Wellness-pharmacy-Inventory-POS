'use client';
import { useCallback, useRef, useEffect, useState } from 'react';
import { Printer, RotateCcw, Search, Ban } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateTime, money } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';
import Receipt from '@/components/Receipt';

const STATUS = {
  completed: ['good', 'Completed'], partially_returned: ['warn', 'Part returned'], returned: ['neutral', 'Returned'], cancelled: ['bad', 'Cancelled'],
};

export default function SalesPage() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const seq = useRef(0); // only the newest request may update the screen
  const load = useCallback(async () => {
    const reqId = ++seq.current;
    try {
      const r = await api('/sales', { params: { search: q, status, page, limit: 15 } }); if (reqId !== seq.current) return;
      setRows(r.data); setMeta(r.meta); setError('');
    } catch (e) { setError(e.message); }
  }, [q, status, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); setQ(search); }, 300); return () => clearTimeout(t); }, [search]);

  return (
    <>
      <PageHeader title="Sales & Returns" subtitle="Invoice history, reprint, returns and cancellations" />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-3">
          <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="Invoice number, e.g. INV-000012" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <Select className="w-44" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All statuses</option>{Object.entries(STATUS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No invoices found.</Empty> : (
          <Table head={['Invoice', 'Date', 'Customer', 'Type', { label: 'Total', right: true }, { label: 'Udhaar', right: true }, 'Status']}>
            {rows.map((s) => (
              <tr key={s._id} className="cursor-pointer hover:bg-mint/60" onClick={() => setOpenId(s._id)}>
                <td className="num px-3 py-2 font-medium">{s.invoiceNo}</td>
                <td className="px-3 py-2 text-muted">{dateTime(s.createdAt)}</td>
                <td className="px-3 py-2">{s.customerName || 'Walk-in'}</td>
                <td className="px-3 py-2 capitalize">{s.type}</td>
                <td className="num px-3 py-2 text-right">{money(s.total)}</td>
                <td className="num px-3 py-2 text-right">{s.creditAmount ? money(s.creditAmount) : '-'}</td>
                <td className="px-3 py-2"><Badge tone={STATUS[s.status][0]}>{STATUS[s.status][1]}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm">
            <span className="text-muted">Page {meta.page} of {meta.pages}</span>
            <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button></div>
          </div>
        )}
      </Card>
      {openId && <SaleDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

function SaleDetail({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('view'); // view | return | cancel
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('');
  const [refundTo, setRefundTo] = useState('credit');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => api(`/sales/${id}`).then((r) => setData(r)).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { reload(); }, [reload]);

  if (!data) return <Modal open onClose={onClose} title="Invoice"><Spinner /></Modal>;
  const sale = data.data;
  const hasReturns = sale.items.some((i) => i.returnedBase > 0);
  const open = sale.status !== 'cancelled' && sale.status !== 'returned';

  async function submitReturn() {
    const items = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([saleItem, v]) => ({ saleItem, unitType: 'unit', quantity: Number(v) }));
    if (!items.length) { setErr('Enter a return quantity for at least one item'); return; }
    setBusy(true); setErr('');
    try {
      await api(`/sales/${id}/return`, { method: 'POST', body: { items, reason, refundTo: sale.creditAmount > 0 ? refundTo : 'cash' } });
      setMode('view'); setQty({}); setReason(''); await reload(); onChanged();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function submitCancel() {
    setBusy(true); setErr('');
    try {
      await api(`/sales/${id}/cancel`, { method: 'POST', body: { reason } });
      setMode('view'); setReason(''); await reload(); onChanged();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Invoice ${sale.invoiceNo}`} width="max-w-3xl"
      footer={mode === 'view' ? (
        <>
          {open && can('sales:return') && <Button variant="secondary" onClick={() => { setMode('return'); setErr(''); }}><RotateCcw className="h-4 w-4" /> Return items</Button>}
          {open && !hasReturns && can('sales:cancel') && <Button variant="secondary" onClick={() => { setMode('cancel'); setErr(''); }}><Ban className="h-4 w-4" /> Cancel invoice</Button>}
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => { setMode('view'); setErr(''); }}>Back</Button>
          {mode === 'return' ? <Button onClick={submitReturn} loading={busy} disabled={reason.trim().length < 3}>Confirm return</Button> : <Button variant="danger" onClick={submitCancel} loading={busy} disabled={reason.trim().length < 3}>Cancel invoice</Button>}
        </>
      )}>
      <ErrorNote error={err} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS[sale.status][0]}>{STATUS[sale.status][1]}</Badge>
        <span className="text-sm text-muted">{dateTime(sale.createdAt)} | {sale.customerName || 'Walk-in'} | by {sale.createdByName}</span>
      </div>
      {sale.status === 'cancelled' && <p className="mb-3 rounded-md bg-danger-soft p-2 text-sm text-danger">Cancelled: {sale.cancelReason}</p>}

      {mode === 'view' && <Receipt sale={sale} />}

      {mode === 'return' && (
        <>
          <p className="mb-2 text-sm text-muted">Enter how many units (tablets/pieces) come back for each batch row. Stock is added back to the same batch.</p>
          <Table head={['Medicine', 'Batch', { label: 'Sold', right: true }, { label: 'Already returned', right: true }, { label: 'Return now (units)', right: true }]}>
            {sale.items.map((it) => (
              <tr key={it._id}>
                <td className="px-3 py-2">{it.name}</td><td className="px-3 py-2">{it.batchNumber}</td>
                <td className="num px-3 py-2 text-right">{it.baseQty}</td><td className="num px-3 py-2 text-right">{it.returnedBase}</td>
                <td className="px-3 py-2 text-right"><Input className="num ml-auto h-8 w-24 text-right" type="number" min="0" max={it.baseQty - it.returnedBase} disabled={it.returnedBase >= it.baseQty} value={qty[it._id] || ''} onChange={(e) => setQty({ ...qty, [it._id]: e.target.value })} /></td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Return reason *"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong medicine" /></Field>
            {sale.creditAmount > 0 && <Field label="Refund goes to"><Select value={refundTo} onChange={(e) => setRefundTo(e.target.value)}><option value="credit">Reduce customer's udhaar first</option><option value="cash">Cash refund</option></Select></Field>}
          </div>
        </>
      )}

      {mode === 'cancel' && (
        <>
          <p className="mb-3 text-sm">This puts all medicines back in stock and removes any udhaar this invoice created. It cannot be undone.</p>
          <Field label="Reason *"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this invoice being cancelled?" /></Field>
        </>
      )}

      {mode === 'view' && data.returns?.length > 0 && (
        <div className="no-print mt-4">
          <h3 className="mb-1 font-semibold">Returns on this invoice</h3>
          {data.returns.map((r) => <p key={r._id} className="text-sm text-muted">{r.returnNo}: {money(r.refundAmount)} ({r.reason}) - cash {money(r.cashRefund)}, udhaar adjusted {money(r.creditAdjusted)}</p>)}
        </div>
      )}
    </Modal>
  );
}
