'use client';
import { useCallback, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useCatalog } from '@/context/CatalogContext';
import { dateOnly, money, stockText } from '@/lib/format';
import { fromBase } from '@/lib/units';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, PageHeader, Select, Spinner, Table } from '@/components/ui';

const toBase = (m, c) => (Number(c.box) || 0) * (m.stripsPerBox || 1) * (m.unitsPerStrip || 1) + (Number(c.strip) || 0) * (m.unitsPerStrip || 1) + (Number(c.unit) || 0);
const typed = (c) => !!c && (c.box !== '' || c.strip !== '' || c.unit !== '') && ['box', 'strip', 'unit'].some((k) => c[k] !== undefined && c[k] !== '');
const signed = (m, n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${stockText(fromBase(m, Math.abs(n))) || '0'}`;

export default function StockTakePage() {
  const catalog = useCatalog();
  const racks = useMemo(() => [...new Set((catalog?.items || []).map((i) => i.rack).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [catalog]);
  const [rack, setRack] = useState('');
  const [rows, setRows] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [counts, setCounts] = useState({}); // batch id -> { box, strip, unit }
  const [review, setReview] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const load = async (r) => {
    setBusy(true); setError(''); setRows(null); setReview(null); setDone(null); setCounts({});
    try { const res = await api('/inventory/stock-take', { params: { rack: r } }); setRows(res.data); setTruncated(res.truncated); setNote(`${r === '__none__' ? 'No-rack items' : `Rack ${r}`} count`); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const medOf = (id) => rows.find((x) => x.batch === id)?.medicine;
  const lines = useMemo(() => (rows || []).filter((r) => typed(counts[r.batch])).map((r) => ({ batch: r.batch, counted: toBase(r.medicine, counts[r.batch]) })), [rows, counts]);
  const setCount = (id, k, v) => setCounts((c) => ({ ...c, [id]: { box: '', strip: '', unit: '', ...c[id], [k]: v } }));

  const doReview = useCallback(async () => {
    setBusy(true); setError('');
    try { setReview(await api('/inventory/stock-take', { method: 'POST', body: { lines, note: note || 'Stock count' } })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [lines, note]);
  async function apply() {
    setBusy(true); setError('');
    try {
      const r = await api('/inventory/stock-take', { method: 'POST', body: { note, apply: true, lines: review.data.map((x) => ({ batch: x.batch, counted: x.counted, expected: x.system })) } });
      setDone(r); setReview(null); setRows(null); catalog?.refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Stock take" subtitle="Count what is really on the shelf, rack by rack. The system compares it with its records and fixes the difference, with a note." />
      <ErrorNote error={error} />
      {done && (
        <Card className="mb-4 border-pine bg-mint p-4 text-pine-dark">
          <p className="font-semibold">Count saved</p>
          <p className="text-sm">{done.totals.counted} batches counted, {done.totals.matched} matched, {done.totals.short} short, {done.totals.over} extra. {done.adjusted} stock adjustment(s) were recorded.</p>
        </Card>
      )}
      {!review && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Which rack are you counting?">
              <Select className="w-56" value={rack} onChange={(e) => setRack(e.target.value)} aria-label="Rack">
                <option value="">Choose a rack...</option>
                {racks.map((r) => <option key={r} value={r}>Rack {r}</option>)}
                <option value="__none__">Medicines with no rack set</option>
              </Select>
            </Field>
            <Button onClick={() => load(rack)} disabled={!rack} loading={busy && !rows}><ClipboardCheck className="h-4 w-4" /> Start counting</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Quantities are not shown on the counting sheet on purpose: count the packs you can see and type them in. Leave a line empty if you did not count it.</p>
        </Card>
      )}

      {busy && !rows && !review && <Spinner />}
      {rows && !review && (
        rows.length === 0 ? <Card><Empty>No stock to count on this rack.</Empty></Card> : (
          <>
            {truncated && <p className="mb-2 rounded-md bg-amber-soft px-3 py-2 text-sm text-amber">Only the first 300 medicines are shown. Count these, then start again to continue.</p>}
            <Card>
              <Table head={['Medicine', 'Place', 'Batch', 'Expiry', { label: 'Counted: boxes', right: true }, { label: 'strips', right: true }, { label: 'loose units', right: true }]}>
                {rows.map((r) => (
                  <tr key={r.batch}>
                    <td className="px-3 py-2 font-medium">{r.medicine.name}</td>
                    <td className="px-3 py-2 text-xs text-muted">{[r.medicine.rack && `Rack ${r.medicine.rack}`, r.medicine.row && `Row ${r.medicine.row}`, r.medicine.side].filter(Boolean).join(' | ') || '-'}</td>
                    <td className="num px-3 py-2">{r.batchNumber}</td><td className="px-3 py-2 text-muted">{dateOnly(r.expiryDate)}</td>
                    {['box', 'strip', 'unit'].map((k) => <td key={k} className="px-3 py-2 text-right"><Input className="num h-8 w-16 text-center" type="number" min="0" value={counts[r.batch]?.[k] ?? ''} onChange={(e) => setCount(r.batch, k, e.target.value)} aria-label={`${r.medicine.name} ${r.batchNumber} ${k}`} /></td>)}
                  </tr>
                ))}
              </Table>
            </Card>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{lines.length} of {rows.length} batches counted</p>
              <Button onClick={doReview} disabled={!lines.length} loading={busy}>Review differences</Button>
            </div>
          </>
        )
      )}

      {review && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Card className="p-4"><p className="text-xs text-muted">Counted</p><p className="num text-2xl font-semibold">{review.totals.counted}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Matched exactly</p><p className="num text-2xl font-semibold text-pine-dark">{review.totals.matched}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Short</p><p className="num text-2xl font-semibold text-danger">{review.totals.short}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Extra</p><p className="num text-2xl font-semibold text-amber">{review.totals.over}</p></Card>
          </div>
          <Card>
            <Table head={['Medicine', 'Batch', { label: 'System says', right: true }, { label: 'You counted', right: true }, { label: 'Difference', right: true }, ...(review.totals.costValue !== undefined ? [{ label: 'Value (cost)', right: true }] : [])]}>
              {review.data.map((x) => {
                const m = medOf(x.batch);
                return (
                  <tr key={x.batch} className={x.difference ? '' : 'text-muted'}>
                    <td className="px-3 py-2 font-medium">{x.name}</td><td className="num px-3 py-2">{x.batchNumber}</td>
                    <td className="num px-3 py-2 text-right">{stockText(fromBase(m, x.system)) || '0'}</td><td className="num px-3 py-2 text-right">{stockText(fromBase(m, x.counted)) || '0'}</td>
                    <td className={`num px-3 py-2 text-right font-semibold ${x.difference < 0 ? 'text-danger' : x.difference > 0 ? 'text-amber' : ''}`}>{x.difference === 0 ? <Badge tone="good">Matched</Badge> : signed(m, x.difference)}</td>
                    {x.costValue !== undefined && <td className="num px-3 py-2 text-right">{x.difference ? money(x.costValue) : ''}</td>}
                  </tr>
                );
              })}
            </Table>
            {review.totals.costValue !== undefined && <p className="num border-t border-line px-4 py-3 text-right font-semibold">Net value of the differences: <span className={review.totals.costValue < 0 ? 'text-danger' : ''}>{money(review.totals.costValue)}</span></p>}
          </Card>
          <Card className="mt-4 p-4">
            <Field label="Note for the record *"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={apply} loading={busy} disabled={note.trim().length < 3 || review.totals.matched === review.totals.counted}>Apply {review.totals.short + review.totals.over} adjustment(s)</Button>
              <Button variant="secondary" onClick={doReview} disabled={busy}>Review again</Button>
              <Button variant="ghost" onClick={() => setReview(null)}>Back to counting</Button>
            </div>
            {review.totals.matched === review.totals.counted && <p className="mt-2 text-sm text-pine-dark">Everything you counted matches the system. Nothing to adjust.</p>}
            <p className="mt-2 text-xs text-muted">Each difference is saved as a stock adjustment with your name and this note. If a sale happens while you are reviewing, you will be asked to review again.</p>
          </Card>
        </>
      )}
    </>
  );
}
