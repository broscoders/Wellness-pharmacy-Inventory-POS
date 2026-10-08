'use client';
import { useCallback, useEffect, useState } from 'react';
import { PackagePlus, Pencil, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { money, stockText, dateOnly } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea } from '@/components/ui';

const emptyForm = {
  name: '', genericName: '', category: '', manufacturer: '', barcode: '', packType: 'Box', stripsPerBox: 10, unitsPerStrip: 10,
  purchasePrice: '', saleBox: '', saleStrip: '', saleUnit: '', wholesaleBox: '', minStockLevel: 0, requiresPrescription: false,
};

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

function toForm(m) {
  return {
    name: m.name, genericName: m.genericName || '', category: m.category?._id || m.category || '', manufacturer: m.manufacturer || '',
    barcode: m.barcode || '', packType: m.packType || 'Box', stripsPerBox: m.stripsPerBox, unitsPerStrip: m.unitsPerStrip,
    purchasePrice: m.purchasePrice || '', saleBox: m.salePrice?.box || '', saleStrip: m.salePrice?.strip || '', saleUnit: m.salePrice?.unit || '',
    wholesaleBox: m.wholesalePrice?.box || '', minStockLevel: m.minStockLevel || 0, requiresPrescription: !!m.requiresPrescription,
  };
}

function toPayload(f) {
  return {
    name: f.name, genericName: f.genericName || undefined, category: f.category || null, manufacturer: f.manufacturer || undefined,
    barcode: f.barcode || '', packType: f.packType || undefined, stripsPerBox: Number(f.stripsPerBox) || 1, unitsPerStrip: Number(f.unitsPerStrip) || 1,
    purchasePrice: num(f.purchasePrice) ?? 0,
    salePrice: { box: num(f.saleBox) ?? 0, strip: num(f.saleStrip) ?? 0, unit: num(f.saleUnit) ?? 0 },
    wholesalePrice: { box: num(f.wholesaleBox) ?? 0 },
    minStockLevel: Number(f.minStockLevel) || 0, requiresPrescription: f.requiresPrescription,
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
  const [editing, setEditing] = useState(null); // null | 'new' | medicine
  const [stockFor, setStockFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api('/medicines', { params: { search: q, page, limit: 15 } });
      setRows(r.data); setMeta(r.meta); setError('');
    } catch (e) { setError(e.message); }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/categories', { params: { limit: 100, active: 'true' } }).then((r) => setCategories(r.data)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => { setPage(1); setQ(search); }, 300); return () => clearTimeout(t); }, [search]);

  const canManage = can('medicines:manage');

  return (
    <>
      <PageHeader title="Medicines" subtitle="Catalogue with live stock, batches and prices"
        actions={canManage && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add medicine</Button>} />
      <Card>
        <div className="border-b border-line p-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <Input className="pl-9" placeholder="Search name, generic, barcode..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No medicines found.</Empty> : (
          <Table head={['Medicine', 'Category', { label: 'Sale price (box / strip / unit)', right: true }, { label: 'In stock', right: true }, 'Status', '']}>
            {rows.map((m) => (
              <tr key={m._id} className={m.isActive ? '' : 'opacity-50'}>
                <td className="px-3 py-2"><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.genericName || '-'}{m.barcode ? ` | ${m.barcode}` : ''}</p></td>
                <td className="px-3 py-2">{m.category?.name || '-'}</td>
                <td className="num px-3 py-2 text-right">{[m.salePrice?.box, m.salePrice?.strip, m.salePrice?.unit].map((p) => (p ? money(p) : '-')).join(' / ')}</td>
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
      {stockFor && <StockForm medicine={stockFor} onClose={() => setStockFor(null)} onSaved={() => { setStockFor(null); load(); }} />}
    </>
  );
}

function MedicineForm({ medicine, categories, onClose, onSaved }) {
  const [f, setF] = useState(medicine ? toForm(medicine) : emptyForm);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const hasStock = medicine && medicine.stock?.total > 0;

  async function save() {
    setBusy(true); setErr('');
    try {
      const body = toPayload(f);
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
        <Field label="Purchase price (per box)"><Input type="number" min="0" value={f.purchasePrice} onChange={set('purchasePrice')} /></Field>
        <Field label="Wholesale price (per box)"><Input type="number" min="0" value={f.wholesaleBox} onChange={set('wholesaleBox')} /></Field>
        <Field label="Sale price per box"><Input type="number" min="0" value={f.saleBox} onChange={set('saleBox')} /></Field>
        <Field label="Sale price per strip"><Input type="number" min="0" value={f.saleStrip} onChange={set('saleStrip')} /></Field>
        <Field label="Sale price per unit/tablet"><Input type="number" min="0" value={f.saleUnit} onChange={set('saleUnit')} /></Field>
        <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={f.requiresPrescription} onChange={set('requiresPrescription')} /> Requires prescription</label>
      </div>
    </Modal>
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
