'use client';
import { useCallback, useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileUp, PackagePlus, Pencil, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { money, stockText, dateOnly, dateTime } from '@/lib/format';
import { unitsPerBox, sellPrice } from '@/lib/units';
import { locationText } from '@/lib/search';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea } from '@/components/ui';

const emptyForm = {
  name: '', genericName: '', category: '', manufacturer: '', barcode: '', packType: 'Box', stripsPerBox: 10, unitsPerStrip: 10,
  purchasePrice: '', saleBox: '', saleStrip: '', saleUnit: '', wholesaleBox: '', minStockLevel: 0, requiresPrescription: false,
  rack: '', row: '', side: '', dosageForm: '', storage: 'room', mrp: '',
};

// Margin = profit as a share of the selling price. Cost of a strip/unit is the box cost divided down.
const marginPct = (cost, price) => (cost > 0 && price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null);

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

function toForm(m) {
  return {
    name: m.name, genericName: m.genericName || '', category: m.category?._id || m.category || '', manufacturer: m.manufacturer || '',
    barcode: m.barcode || '', packType: m.packType || 'Box', stripsPerBox: m.stripsPerBox, unitsPerStrip: m.unitsPerStrip,
    purchasePrice: m.purchasePrice || '', saleBox: m.salePrice?.box || '', saleStrip: m.salePrice?.strip || '', saleUnit: m.salePrice?.unit || '',
    wholesaleBox: m.wholesalePrice?.box || '', minStockLevel: m.minStockLevel || 0, requiresPrescription: !!m.requiresPrescription,
    rack: m.rack || '', row: m.row || '', side: m.side || '', dosageForm: m.dosageForm || '', storage: m.storage || 'room', mrp: m.mrp || '',
  };
}

function toPayload(f, withCost) {
  return {
    name: f.name, genericName: f.genericName || undefined, category: f.category || null, manufacturer: f.manufacturer || undefined,
    barcode: f.barcode || '', packType: f.packType || undefined, stripsPerBox: Number(f.stripsPerBox) || 1, unitsPerStrip: Number(f.unitsPerStrip) || 1,
    ...(withCost ? { purchasePrice: num(f.purchasePrice) ?? 0 } : {}), // staff who cannot see costs never send one
    salePrice: { box: num(f.saleBox) ?? 0, strip: num(f.saleStrip) ?? 0, unit: num(f.saleUnit) ?? 0 },
    wholesalePrice: { box: num(f.wholesaleBox) ?? 0 },
    minStockLevel: Number(f.minStockLevel) || 0, requiresPrescription: f.requiresPrescription,
    rack: f.rack.trim(), row: f.row.trim(), side: f.side.trim(), dosageForm: f.dosageForm.trim(), storage: f.storage, mrp: num(f.mrp) ?? 0,
  };
}

export default function MedicinesPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [fCategory, setFCategory] = useState('');
  const [fManufacturer, setFManufacturer] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | medicine
  const [stockFor, setStockFor] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const seq = useRef(0); // only the newest request may update the screen
  const load = useCallback(async () => {
    const reqId = ++seq.current;
    try {
      const r = await api('/medicines', { params: { search: q, category: fCategory, manufacturer: fManufacturer, page, limit: 15 } }); if (reqId !== seq.current) return;
      setRows(r.data); setMeta(r.meta); setError('');
    } catch (e) { setError(e.message); }
  }, [q, page, fCategory, fManufacturer]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/medicines/filters').then((r) => { setCategories(r.categories); setManufacturers(r.manufacturers); }).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => { setPage(1); setQ(search); }, 300); return () => clearTimeout(t); }, [search]);

  const canManage = can('medicines:manage');

  return (
    <>
      <PageHeader title="Medicines" subtitle="Catalogue with live stock, batches and prices"
        actions={canManage && <>{can('inventory:manage') && <Link href="/medicines/import" className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 font-medium hover:bg-mint"><FileUp className="h-4 w-4" /> Import from file</Link>}<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add medicine</Button></>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <Input className="pl-9" placeholder="Search name, generic, barcode..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="w-44" value={fCategory} onChange={(e) => { setPage(1); setFCategory(e.target.value); }} aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select>
          <Select className="w-48" value={fManufacturer} onChange={(e) => { setPage(1); setFManufacturer(e.target.value); }} aria-label="Manufacturer"><option value="">All manufacturers</option>{manufacturers.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
          {(fCategory || fManufacturer) && <Button variant="ghost" size="sm" onClick={() => { setPage(1); setFCategory(''); setFManufacturer(''); }}>Clear filters</Button>}
        </div>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No medicines found.</Empty> : (
          <Table head={['Medicine', 'Category', { label: 'Sale price (box / strip / unit)', right: true }, { label: 'In stock', right: true }, 'Status', '']}>
            {rows.map((m) => (
              <tr key={m._id} className={m.isActive ? '' : 'opacity-50'}>
                <td className="px-3 py-2"><button className="text-left font-medium text-pine-dark hover:underline" onClick={() => setDetailId(m._id)}>{m.name}</button><p className="text-xs text-muted">{m.genericName || '-'}{m.manufacturer ? ` | ${m.manufacturer}` : ''}{m.barcode ? ` | ${m.barcode}` : ''}</p>{locationText(m) && <p className="text-xs font-medium text-pine-dark">{locationText(m)}{m.storage === 'fridge' ? ' | Fridge' : ''}</p>}{m.supplier?.name && <p className="text-xs text-muted">Supplier: {m.supplier.name}</p>}</td>
                <td className="px-3 py-2">{m.category?.name || '-'}</td>
                <td className="num px-3 py-2 text-right">{[m.salePrice?.box, m.salePrice?.strip, m.salePrice?.unit].map((p) => (p ? money(p) : '-')).join(' / ')}{(() => { const mg = marginPct(m.purchasePrice, m.salePrice?.box); return mg === null ? null : <p className={`text-xs ${mg < 0 ? 'font-semibold text-danger' : mg < 8 ? 'text-amber' : 'text-muted'}`}>margin {mg}%</p>; })()}</td>
                <td className="num px-3 py-2 text-right">{stockText(m.stock.display)}<p className="text-xs text-muted">{m.stock.sellable} units</p></td>
                <td className="px-3 py-2 space-x-1">
                  {m.stock.isOut ? <Badge tone="bad">Out of stock</Badge> : m.stock.isLow ? <Badge tone="warn">Low</Badge> : <Badge tone="good">OK</Badge>}
                  {m.stock.expired > 0 && <Badge tone="bad">Expired batch</Badge>}
                  {m.stock.nearestExpiry && <span className="text-xs text-muted">exp {dateOnly(m.stock.nearestExpiry)}</span>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {can('inventory:manage') && <Button variant="ghost" size="sm" onClick={() => setStockFor(m)}><PackagePlus className="h-4 w-4" /> Stock</Button>}
                  {canManage && <Button variant="ghost" size="sm" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /> Edit</Button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm">
            <span className="text-muted">Page {meta.page} of {meta.pages} ({meta.total} medicines)</span>
            <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button></div>
          </div>
        )}
      </Card>

      {editing && <MedicineForm medicine={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {detailId && <MedicineDetail id={detailId} onClose={() => setDetailId(null)} />}
      {stockFor && <StockForm medicine={stockFor} onClose={() => setStockFor(null)} onSaved={() => { setStockFor(null); load(); }} />}
    </>
  );
}

function MedicineForm({ medicine, categories, onClose, onSaved }) {
  const { can } = useAuth();
  const [f, setF] = useState(medicine ? toForm(medicine) : emptyForm);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const hasStock = medicine && medicine.stock?.total > 0;

  async function save() {
    setBusy(true); setErr('');
    try {
      const body = toPayload(f, can('costs:view'));
      if (medicine) await api(`/medicines/${medicine._id}`, { method: 'PATCH', body });
      else await api('/medicines', { method: 'POST', body });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={medicine ? `Edit ${medicine.name}` : 'Add medicine'} width="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Medicine name *"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Generic name"><Input value={f.genericName} onChange={set('genericName')} /></Field>
        <Field label="Category"><Select value={f.category} onChange={set('category')}><option value="">-</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
        <Field label="Manufacturer"><Input value={f.manufacturer} onChange={set('manufacturer')} /></Field>
        <Field label="Barcode"><Input value={f.barcode} onChange={set('barcode')} /></Field>
        <Field label="Minimum stock (units)" hint="Alert when stock falls to this level"><Input type="number" min="0" value={f.minStockLevel} onChange={set('minStockLevel')} /></Field>
        <Field label="Strips in 1 box" hint={hasStock ? 'Locked: this medicine has stock' : '1 box = ? strips'}><Input type="number" min="1" disabled={hasStock} value={f.stripsPerBox} onChange={set('stripsPerBox')} /></Field>
        <Field label="Units in 1 strip" hint={hasStock ? 'Locked: this medicine has stock' : '1 strip = ? tablets'}><Input type="number" min="1" disabled={hasStock} value={f.unitsPerStrip} onChange={set('unitsPerStrip')} /></Field>
        {can('costs:view') && <Field label="Purchase price (per box)"><Input type="number" min="0" value={f.purchasePrice} onChange={set('purchasePrice')} /></Field>}
        <Field label="Wholesale price (per box)"><Input type="number" min="0" value={f.wholesaleBox} onChange={set('wholesaleBox')} /></Field>
        <Field label="Sale price per box"><Input type="number" min="0" value={f.saleBox} onChange={set('saleBox')} /></Field>
        <Field label="Sale price per strip"><Input type="number" min="0" value={f.saleStrip} onChange={set('saleStrip')} /></Field>
        <Field label="Sale price per unit/tablet"><Input type="number" min="0" value={f.saleUnit} onChange={set('saleUnit')} /></Field>
        <Field label="MRP (printed price per box)" hint="Selling above this is not allowed"><Input type="number" min="0" value={f.mrp} onChange={set('mrp')} /></Field>
        <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={f.requiresPrescription} onChange={set('requiresPrescription')} /> Requires prescription</label>
      </div>
      {can('costs:view') && <MarginPreview f={f} />}
      <h3 className="mb-2 mt-5 font-semibold">Where to find it</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Rack"><Input value={f.rack} onChange={set('rack')} placeholder="e.g. A" /></Field>
        <Field label="Row / shelf"><Input value={f.row} onChange={set('row')} placeholder="e.g. 3" /></Field>
        <Field label="Side"><Input value={f.side} onChange={set('side')} placeholder="e.g. Left" /></Field>
        <Field label="Dosage form"><Input list="dosage-forms" value={f.dosageForm} onChange={set('dosageForm')} placeholder="Tablet, Syrup..." /></Field>
        <Field label="Storage"><Select value={f.storage} onChange={set('storage')}><option value="room">Room temperature</option><option value="cool">Cool place</option><option value="fridge">Fridge (2-8 C)</option></Select></Field>
      </div>
      <datalist id="dosage-forms">{['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Drops', 'Cream', 'Ointment', 'Gel', 'Inhaler', 'Sachet', 'Suppository', 'Other'].map((d) => <option key={d} value={d} />)}</datalist>
    </Modal>
  );
}

// Live profit check while typing prices, so a bad price is caught before it is saved.
function MarginPreview({ f }) {
  const cost = Number(f.purchasePrice) || 0;
  if (!cost) return null;
  const upb = (Number(f.stripsPerBox) || 1) * (Number(f.unitsPerStrip) || 1);
  const rows = [['box', Number(f.saleBox), cost], ['strip', Number(f.saleStrip), cost / (Number(f.stripsPerBox) || 1)], ['unit', Number(f.saleUnit), cost / upb]].filter(([, p]) => p > 0);
  const mrp = Number(f.mrp) || 0;
  if (!rows.length) return null;
  return (
    <div className="mt-3 rounded-md bg-paper p-3 text-sm">
      <p className="mb-1 font-medium">Profit margin on your sale prices</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {rows.map(([k, p, c]) => { const m = marginPct(c, p); return <span key={k} className={`num ${m < 0 ? 'font-semibold text-danger' : m < 5 ? 'text-amber' : 'text-pine-dark'}`}>Per {k}: {m}% <span className="text-muted">(profit {Math.round((p - c) * 100) / 100})</span></span>; })}
      </div>
      {rows.some(([, p, c]) => p < c) && <p className="mt-1 text-danger">A sale price is below cost. This medicine would be sold at a loss.</p>}
      {mrp > 0 && Number(f.saleBox) > mrp && <p className="mt-1 text-danger">Box sale price is above the MRP ({mrp}).</p>}
    </div>
  );
}

function StockForm({ medicine, onClose, onSaved }) {
  const [f, setF] = useState({ batchNumber: '', expiryDate: '', box: '', strip: '', unit: '', reason: 'Opening stock' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setErr('');
    try {
      await api('/inventory/batches', {
        method: 'POST',
        body: { medicine: medicine._id, batchNumber: f.batchNumber, expiryDate: f.expiryDate, reason: f.reason || undefined, quantity: { box: num(f.box) ?? 0, strip: num(f.strip) ?? 0, unit: num(f.unit) ?? 0 } },
      });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Add stock: ${medicine.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Add stock</Button></>}>
      <p className="mb-3 text-sm text-muted">For opening stock or stock received outside a purchase. Normal buying should go through Purchases so the supplier ledger stays correct.</p>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Batch number *"><Input value={f.batchNumber} onChange={set('batchNumber')} /></Field>
        <Field label="Expiry date *" hint="Pick a date, or type YYYY-MM"><Input type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
        <Field label="Boxes"><Input type="number" min="0" value={f.box} onChange={set('box')} /></Field>
        <Field label="Strips"><Input type="number" min="0" value={f.strip} onChange={set('strip')} /></Field>
        <Field label="Loose units"><Input type="number" min="0" value={f.unit} onChange={set('unit')} /></Field>
        <Field label="Note"><Input value={f.reason} onChange={set('reason')} /></Field>
      </div>
    </Modal>
  );
}

const MOVE = { opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale', sale_return: 'Customer return', purchase_return: 'Returned to supplier', adjustment: 'Adjustment', expired_writeoff: 'Expired write-off' };

function MedicineDetail({ id, onClose }) {
  const [m, setM] = useState(null);
  const [batches, setBatches] = useState([]);
  const [moves, setMoves] = useState([]);
  const [err, setErr] = useState('');

  const { can } = useAuth();
  const canCost = can('costs:view'); const canInv = can('inventory:view');
  useEffect(() => {
    // counter staff have no stock-room page, so they only get the medicine itself (its stock comes with it)
    Promise.all([api(`/medicines/${id}`), canInv ? api('/inventory/batches', { params: { medicine: id, inStock: 'false', limit: 50 } }) : { data: [] }, canInv ? api('/inventory/movements', { params: { medicine: id, limit: 10 } }) : { data: [] }])
      .then(([a, b, c]) => { setM(a.data); setBatches(b.data); setMoves(c.data); }).catch((e) => setErr(e.message));
  }, [id, canInv]);

  if (!m) return <Modal open onClose={onClose} title="Medicine"><ErrorNote error={err} />{!err && <Spinner />}</Modal>;
  const upb = unitsPerBox(m);
  const retailBox = sellPrice(m, 'retail', 'box');
  const margin = retailBox > 0 && m.purchasePrice > 0 ? Math.round(((retailBox - m.purchasePrice) / retailBox) * 1000) / 10 : null;
  const stockValue = batches.filter((b) => b.status !== 'expired').reduce((s, b) => s + ((b.purchasePricePerBox || m.purchasePrice || 0) / upb) * b.quantity, 0);

  return (
    <Modal open onClose={onClose} title={m.name} width="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        {m.genericName && <span>{m.genericName}</span>}{m.manufacturer && <span>| {m.manufacturer}</span>}{m.category?.name && <Badge>{m.category.name}</Badge>}
        {m.supplier?.name && <span>| Supplier: {m.supplier.name}</span>}{m.requiresPrescription && <Badge tone="warn">Prescription (Rx)</Badge>}{m.barcode && <span className="num">| Barcode {m.barcode}</span>}{m.dosageForm && <Badge>{m.dosageForm}</Badge>}{m.storage === 'fridge' && <Badge tone="good">Keep in fridge</Badge>}{m.storage === 'cool' && <Badge>Cool place</Badge>}{locationText(m) && <Badge tone="good">{locationText(m)}</Badge>}{m.mrp > 0 && <span className="num">| MRP {money(m.mrp)}</span>}{!m.isActive && <Badge tone="bad">Inactive</Badge>}
      </div>
      <div className={`mb-5 grid gap-3 ${canCost ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
        <div className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">Pack</p><p className="font-medium">1 box = {m.stripsPerBox} strip x {m.unitsPerStrip}</p><p className="text-xs text-muted">{upb} units per box</p></div>
        <div className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">Sellable stock</p><p className="num font-medium">{stockText(m.stock.display)}</p><p className="text-xs text-muted">{m.stock.sellable} units{m.stock.expired ? `, ${m.stock.expired} expired` : ''}</p></div>
        {canCost && <div className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">Stock value (at cost)</p><p className="num font-medium">{money(Math.round(stockValue))}</p><p className="text-xs text-muted">Minimum level {m.minStockLevel} units</p></div>}
        {canCost && <div className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">Margin on box (retail)</p><p className={`num font-medium ${margin !== null && margin < 8 ? 'text-danger' : ''}`}>{margin === null ? '-' : `${margin}%`}</p><p className="text-xs text-muted">Cost {money(m.purchasePrice)} / sale {money(retailBox)}</p></div>}
      </div>

      <h3 className="mb-1 font-semibold">Prices</h3>
      <Table head={['', { label: 'Box', right: true }, { label: 'Strip', right: true }, { label: 'Unit', right: true }]}>
        <tr><td className="px-3 py-2">Retail</td>{['box', 'strip', 'unit'].map((k) => <td key={k} className="num px-3 py-2 text-right">{m.salePrice?.[k] ? money(m.salePrice[k]) : '-'}</td>)}</tr>
        <tr><td className="px-3 py-2">Wholesale</td>{['box', 'strip', 'unit'].map((k) => <td key={k} className="num px-3 py-2 text-right">{m.wholesalePrice?.[k] ? money(m.wholesalePrice[k]) : '-'}</td>)}</tr>
        {canCost && <tr><td className="px-3 py-2">Purchase (per box)</td><td className="num px-3 py-2 text-right">{money(m.purchasePrice)}</td><td /><td /></tr>}
      </Table>

      {canInv && <h3 className="mb-1 mt-5 font-semibold">Batches</h3>}
      {canInv && (batches.length === 0 ? <p className="text-sm text-muted">No batches yet.</p> : (
        <Table head={['Batch', 'Expiry', { label: 'Quantity', right: true }, ...(canCost ? [{ label: 'Cost / box', right: true }] : [])]}>
          {batches.map((b) => (
            <tr key={b._id} className={b.quantity === 0 ? 'opacity-50' : ''}>
              <td className="num px-3 py-2 font-medium">{b.batchNumber}</td>
              <td className="px-3 py-2"><span className="num mr-2">{dateOnly(b.expiryDate)}</span>{b.status === 'expired' ? <Badge tone="bad">Expired</Badge> : b.status === 'expiring_30' ? <Badge tone="bad">{b.daysLeft} days left</Badge> : b.status === 'ok' ? <Badge tone="good">{b.daysLeft} days</Badge> : <Badge tone="warn">{b.daysLeft} days left</Badge>}</td>
              <td className="num px-3 py-2 text-right">{stockText(b.display)} <span className="text-xs text-muted">({b.quantity})</span></td>{canCost && <td className="num px-3 py-2 text-right">{money(b.purchasePricePerBox)}</td>}
            </tr>
          ))}
        </Table>
      ))}

      {canInv && <h3 className="mb-1 mt-5 font-semibold">Recent stock movements</h3>}
      {canInv && (moves.length === 0 ? <p className="text-sm text-muted">No movements yet.</p> : (
        <Table head={['When', 'Type', 'Batch', { label: 'Change', right: true }, { label: 'Balance', right: true }, 'By']}>
          {moves.map((x) => (
            <tr key={x._id}><td className="px-3 py-2 text-muted">{dateTime(x.createdAt)}</td><td className="px-3 py-2">{MOVE[x.type] || x.type}</td><td className="num px-3 py-2">{x.batch?.batchNumber}</td>
              <td className={`num px-3 py-2 text-right font-medium ${x.quantity > 0 ? 'text-pine-dark' : 'text-danger'}`}>{x.quantity > 0 ? '+' : ''}{x.quantity}</td><td className="num px-3 py-2 text-right">{x.balanceAfter}</td><td className="px-3 py-2">{x.user?.name || '-'}</td></tr>
          ))}
        </Table>
      ))}
    </Modal>
  );
}
