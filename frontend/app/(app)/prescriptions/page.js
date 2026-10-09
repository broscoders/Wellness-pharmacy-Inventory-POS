'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import { api, apiBlob, apiUpload } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateOnly, dateTime, money } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Spinner, Table, Textarea } from '@/components/ui';
import CustomerPicker from '@/components/CustomerPicker';

export default function PrescriptionsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | prescription
  const [viewId, setViewId] = useState(null);

  const seq = useRef(0); // only the newest request may update the screen
  const load = useCallback(async () => {
    const reqId = ++seq.current;
    try { const r = await api('/prescriptions', { params: { search: q, page, limit: 15 } }); if (reqId !== seq.current) return; setRows(r.data); setMeta(r.meta); setError(''); } catch (e) { setError(e.message); }
  }, [q, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); setQ(search); }, 300); return () => clearTimeout(t); }, [search]);

  return (
    <>
      <PageHeader title="Prescriptions" subtitle="Doctor prescriptions linked to patients and invoices"
        actions={can('prescriptions:manage') && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add prescription</Button>} />
      <Card>
        <div className="border-b border-line p-3"><div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="RX no, patient, doctor, reference..." value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No prescriptions recorded yet.</Empty> : (
          <Table head={['RX no', 'Date', 'Patient', 'Doctor', 'Medicines', 'File', 'Invoices']}>
            {rows.map((r) => (
              <tr key={r._id} className="cursor-pointer hover:bg-mint/60" onClick={() => setViewId(r._id)}>
                <td className="num px-3 py-2 font-medium">{r.rxNo}</td><td className="px-3 py-2 text-muted">{dateOnly(r.prescriptionDate)}</td><td className="px-3 py-2">{r.customerName || '-'}</td>
                <td className="px-3 py-2">Dr. {r.doctorName}</td><td className="px-3 py-2">{r.items.length}</td><td className="px-3 py-2">{r.hasFile ? <Badge tone="good">Attached</Badge> : <span className="text-muted">-</span>}</td><td className="px-3 py-2">{r.sales.length || '-'}</td>
              </tr>
            ))}
          </Table>
        )}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm"><span className="text-muted">Page {meta.page} of {meta.pages}</span>
            <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
        )}
      </Card>
      {editing && <RxForm rx={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {viewId && <RxView id={viewId} onClose={() => setViewId(null)} onEdit={(rx) => { setViewId(null); setEditing(rx); }} />}
    </>
  );
}

function RxView({ id, onClose, onEdit }) {
  const { can } = useAuth();
  const [rx, setRx] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/prescriptions/${id}`).then((r) => setRx(r.data)).catch((e) => setErr(e.message)); }, [id]);

  async function openFile() {
    try { const blob = await apiBlob(`/prescriptions/${id}/file`); window.open(URL.createObjectURL(blob), '_blank', 'noopener'); } catch (e) { setErr(e.message); }
  }
  if (!rx) return <Modal open onClose={onClose} title="Prescription"><ErrorNote error={err} />{!err && <Spinner />}</Modal>;
  return (
    <Modal open onClose={onClose} title={`${rx.rxNo} - Dr. ${rx.doctorName}`} width="max-w-2xl"
      footer={<>{rx.hasFile && <Button variant="secondary" onClick={openFile}><ExternalLink className="h-4 w-4" /> Open attached file</Button>}{can('prescriptions:manage') && <Button onClick={() => onEdit(rx)}>Edit</Button>}</>}>
      <ErrorNote error={err} />
      <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-muted">Patient</dt><dd className="font-medium">{rx.customerName || '-'}</dd></div>
        <div><dt className="text-muted">Prescription date</dt><dd className="font-medium">{dateOnly(rx.prescriptionDate)}</dd></div>
        <div><dt className="text-muted">Doctor reference</dt><dd className="font-medium">{rx.reference || '-'}</dd></div>
        <div><dt className="text-muted">Recorded by</dt><dd className="font-medium">{rx.createdByName} ({dateTime(rx.createdAt)})</dd></div>
      </dl>
      {rx.items.length > 0 && <Table head={['Medicine', 'Dosage', 'Instructions']}>{rx.items.map((i, k) => <tr key={k}><td className="px-3 py-2 font-medium">{i.name}</td><td className="px-3 py-2">{i.dosage || '-'}</td><td className="px-3 py-2">{i.instructions || '-'}</td></tr>)}</Table>}
      {rx.notes && <p className="mt-3 text-sm"><span className="text-muted">Notes: </span>{rx.notes}</p>}
      <h3 className="mb-1 mt-4 font-semibold">Invoices using this prescription</h3>
      {rx.sales.length === 0 ? <p className="text-sm text-muted">Not used in any invoice yet.</p> : rx.sales.map((s) => <p key={s._id} className="text-sm">{s.invoiceNo} - {money(s.total)} ({dateTime(s.createdAt)})</p>)}
    </Modal>
  );
}

function RxForm({ rx, onClose, onSaved }) {
  const fileRef = useRef(null);
  const [customer, setCustomer] = useState(null);
  const [f, setF] = useState({ customerName: rx?.customerName || '', prescriptionDate: (rx?.prescriptionDate || new Date().toISOString()).slice(0, 10), doctorName: rx?.doctorName || '', reference: rx?.reference || '', notes: rx?.notes || '' });
  const [items, setItems] = useState(rx?.items?.map((i) => ({ name: i.name, dosage: i.dosage || '', instructions: i.instructions || '' })) || []);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setItem = (i, patch) => setItems((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function save() {
    setBusy(true); setErr('');
    try {
      const file = fileRef.current?.files?.[0];
      if (file && file.size > 2 * 1024 * 1024) throw new Error('File is larger than 2 MB. Use a smaller photo.');
      const body = {
        customer: customer?._id || undefined, customerName: customer?.name || f.customerName || undefined, prescriptionDate: f.prescriptionDate || undefined,
        doctorName: f.doctorName, reference: f.reference || undefined, notes: f.notes || undefined,
        items: items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), dosage: i.dosage || undefined, instructions: i.instructions || undefined })),
      };
      const saved = rx ? await api(`/prescriptions/${rx._id}`, { method: 'PATCH', body }) : await api('/prescriptions', { method: 'POST', body });
      if (file) await apiUpload(`/prescriptions/${saved.data._id}/file`, file);
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={rx ? `Edit ${rx.rxNo}` : 'Add prescription'} width="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={f.doctorName.trim().length < 2}>Save</Button></>}>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><CustomerPicker customer={customer} onChange={setCustomer} label="Link to an existing customer (optional)" showBalance={false} /></div>
        {!customer && <Field label="Or patient name"><Input value={f.customerName} onChange={set('customerName')} /></Field>}
        <Field label="Prescription date"><Input type="date" value={f.prescriptionDate} onChange={set('prescriptionDate')} /></Field>
        <Field label="Doctor name *"><Input value={f.doctorName} onChange={set('doctorName')} /></Field>
        <Field label="Doctor reference / reg. no."><Input value={f.reference} onChange={set('reference')} /></Field>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between"><span className="text-[13px] font-medium">Medicines prescribed</span><Button variant="ghost" size="sm" onClick={() => setItems([...items, { name: '', dosage: '', instructions: '' }])}><Plus className="h-4 w-4" /> Add line</Button></div>
        {items.map((it, i) => (
          <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1.4fr_1fr_1.4fr_auto]">
            <Input placeholder="Medicine" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} /><Input placeholder="Dosage (1+0+1)" value={it.dosage} onChange={(e) => setItem(i, { dosage: e.target.value })} />
            <Input placeholder="Instructions" value={it.instructions} onChange={(e) => setItem(i, { instructions: e.target.value })} />
            <button className="rounded p-2 text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3">
        <Field label="Notes"><Textarea value={f.notes} onChange={set('notes')} /></Field>
        <Field label="Prescription photo / PDF" hint={`JPG, PNG, WEBP or PDF up to 2 MB.${rx?.hasFile ? ` Currently attached: ${rx.fileName}. Choosing a file replaces it.` : ''}`}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2" />
        </Field>
      </div>
    </Modal>
  );
}
