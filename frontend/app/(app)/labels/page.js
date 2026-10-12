'use client';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Search, Trash2, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useCatalog } from '@/context/CatalogContext';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { money } from '@/lib/format';
import { sellPrice } from '@/lib/units';
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Select } from '@/components/ui';
import Barcode from '@/components/Barcode';

const SIZES = {
  a4: { label: 'A4 sheet, 3 x 8 labels (63 x 34 mm)', cls: 'label-sheet' },
  roll: { label: 'Label roll, 50 x 30 mm (one label per page)', cls: 'label-roll' },
};
const MAX_LABELS = 600;

function Label({ item, opts, shop }) {
  const price = opts.price === 'none' ? 0 : sellPrice(item.med, 'retail', opts.price);
  return (
    <div className="label">
      {opts.shop && <p className="label-shop">{shop}</p>}
      <p className="label-name">{item.name}</p>
      <Barcode value={item.barcode} height={34} width={1.5} fontSize={10} />
      {price > 0 && <p className="label-price">{money(price)}<span> / {opts.price}</span></p>}
    </div>
  );
}

export default function LabelsPage() {
  const catalog = useCatalog();
  const { can } = useAuth();
  const { settings } = useSettings();
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState([]); // { id, med, name, barcode, copies }
  const [size, setSize] = useState('a4');
  const [opts, setOpts] = useState({ price: 'strip', shop: true });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => (term.trim() && catalog?.ready ? catalog.search(term, { limit: 8 }) : []), [term, catalog]);
  const without = useMemo(() => (catalog?.items || []).filter((m) => !m.barcode).length, [catalog]);
  const own = useMemo(() => (catalog?.items || []).filter((m) => /^20\d{11}$/.test(m.barcode)), [catalog]);

  const add = (m, copies = 1) => setPicked((p) => (p.some((x) => x.id === m._id) ? p : [...p, { id: m._id, med: m, name: m.name, barcode: m.barcode, copies }]));
  const total = picked.reduce((s, p) => s + (Number(p.copies) || 0), 0);
  const labels = useMemo(() => picked.flatMap((p) => Array.from({ length: Math.min(Number(p.copies) || 0, MAX_LABELS) }, (_, i) => ({ ...p, key: `${p.id}-${i}` }))), [picked]);

  async function assign() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await api('/medicines/assign-barcodes', { method: 'POST', body: {} });
      setMsg(`${r.assigned} medicines now have their own barcode.${r.remaining ? ` ${r.remaining} still without (run again).` : ''}`);
      await catalog.refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const sheet = (
    <div className={`label-grid ${SIZES[size].cls}`}>
      {labels.slice(0, MAX_LABELS).map((l) => <Label key={l.key} item={l} opts={opts} shop={settings.shopName} />)}
    </div>
  );

  return (
    <>
      <PageHeader title="Barcode labels" subtitle="Print labels for medicines that arrive without a barcode, then stick them on the packs and scan at the counter" />
      <ErrorNote error={err} />
      {msg && <p className="mb-3 rounded-md bg-mint px-3 py-2 text-sm text-pine-dark">{msg}</p>}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <p className="font-semibold">1. Give barcodes</p>
            <p className="mt-1 text-sm text-muted">{without ? <><b>{without}</b> medicines have no barcode. Give each one the shop&apos;s own barcode (starts with 20, never clashes with a manufacturer&apos;s).</> : 'Every medicine has a barcode.'}</p>
            {can('medicines:manage') && <Button className="mt-3" onClick={assign} loading={busy} disabled={!without}><Wand2 className="h-4 w-4" /> Give barcodes to all without one</Button>}
          </Card>

          <Card className="p-4">
            <p className="font-semibold">2. Choose medicines</p>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
              <Input className="pl-9" placeholder="Search a medicine to add" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search medicine for label" />
            </div>
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {results.map((m) => (
                  <li key={m._id}><button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-mint" onClick={() => { if (m.barcode) { add(m); setTerm(''); } }} disabled={!m.barcode}>
                    <span className="truncate">{m.name}</span>{m.barcode ? <span className="num text-xs text-muted">{m.barcode}</span> : <Badge tone="warn">No barcode yet</Badge>}
                  </button></li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={!own.length} onClick={() => own.forEach((m) => add(m))}>Add all with shop barcodes ({own.length})</Button>
              {picked.length > 0 && <Button variant="ghost" size="sm" onClick={() => setPicked([])}>Clear list</Button>}
            </div>
          </Card>

          <Card className="p-4">
            <p className="font-semibold">3. Label style</p>
            <div className="mt-3 grid gap-3">
              <Field label="Paper"><Select value={size} onChange={(e) => setSize(e.target.value)}>{Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
              <Field label="Price on the label"><Select value={opts.price} onChange={(e) => setOpts({ ...opts, price: e.target.value })}><option value="strip">Per strip</option><option value="box">Per box</option><option value="unit">Per unit / tablet</option><option value="none">No price</option></Select></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opts.shop} onChange={(e) => setOpts({ ...opts, shop: e.target.checked })} /> Show shop name</label>
            </div>
          </Card>
        </div>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Labels to print: <span className="num">{total}</span></p>
            <Button onClick={() => window.print()} disabled={!total}><Printer className="h-4 w-4" /> Print labels</Button>
          </div>
          {picked.length === 0 ? <p className="py-12 text-center text-sm text-muted">Search and add medicines. Set how many labels each needs.</p> : (
            <>
              <ul className="mb-4 divide-y divide-line rounded-md border border-line">
                {picked.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span><span className="num text-xs text-muted">{p.barcode}</span>
                    <Input className="num h-8 w-16 text-center" type="number" min="1" max="200" value={p.copies} aria-label={`Labels for ${p.name}`} onChange={(e) => setPicked((l) => l.map((x) => (x.id === p.id ? { ...x, copies: e.target.value } : x)))} />
                    <button className="rounded p-1.5 text-muted hover:text-danger" onClick={() => setPicked((l) => l.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
              <p className="mb-2 text-xs text-muted">Preview{total > MAX_LABELS ? ` (first ${MAX_LABELS} labels; print in batches)` : ''}</p>
              <div className="no-print max-h-[55vh] overflow-auto rounded-md border border-line bg-paper p-3"><div className="label-preview">{sheet}</div></div>
            </>
          )}
        </Card>
      </div>
      {total > 0 && typeof document !== 'undefined' && createPortal(
        <div className={`print-root print-labels ${size === 'roll' ? 'print-roll' : ''}`}>{size === 'roll' && <style>{'@page { size: 50mm 30mm; margin: 0; }'}</style>}{sheet}</div>, document.body)}
    </>
  );
}
