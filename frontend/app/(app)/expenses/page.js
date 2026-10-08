'use client';
import { useCallback, useEffect, useState } from 'react';
import { Ban, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateOnly, money } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';

const CATS = ['rent', 'electricity', 'salaries', 'internet', 'delivery', 'maintenance', 'other'];
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const nextDay = (s) => new Date(new Date(`${s}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);

export default function ExpensesPage() {
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [cat, setCat] = useState('');
  const [rows, setRows] = useState(null);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState(null);

  const load = useCallback(async () => {
    try { const r = await api('/expenses', { params: { from, to: nextDay(to), category: cat, limit: 100 } }); setRows(r.data); setTotals(r.totals); setError(''); } catch (e) { setError(e.message); }
  }, [from, to, cat]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Expenses" subtitle="Rent, bills, salaries and other running costs" actions={can('expenses:manage') && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add expense</Button>} />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Category"><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All</option>{CATS.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</Select></Field>
          {totals && <div className="ml-auto text-right"><p className="text-xs text-muted">Total in this period</p><p className="num text-xl font-semibold">{money(totals.total)}</p></div>}
        </div>
        {totals && Object.keys(totals.byCategory).length > 0 && <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2">{Object.entries(totals.byCategory).map(([k, v]) => <Badge key={k}><span className="capitalize">{k}</span>: {money(v)}</Badge>)}</div>}
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No expenses in this period.</Empty> : (
          <Table head={['No', 'Date', 'Category', 'Description', 'Method', { label: 'Amount', right: true }, 'By', '']}>
            {rows.map((e) => (
              <tr key={e._id}>
                <td className="num px-3 py-2">{e.expenseNo}</td><td className="px-3 py-2 text-muted">{dateOnly(e.date)}</td><td className="px-3 py-2 capitalize">{e.category}</td><td className="px-3 py-2">{e.description || '-'}</td>
                <td className="px-3 py-2 capitalize">{e.paymentMethod.replace('_', ' ')}</td><td className="num px-3 py-2 text-right font-medium">{money(e.amount)}</td><td className="px-3 py-2">{e.createdByName}</td>
                <td className="px-3 py-2 text-right">{can('expenses:manage') && <Button variant="ghost" size="sm" onClick={() => setVoiding(e)}><Ban className="h-4 w-4" /> Void</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {adding && <AddExpense onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {voiding && <VoidExpense expense={voiding} onClose={() => setVoiding(null)} onSaved={() => { setVoiding(null); load(); }} />}
    </>
  );
}

function AddExpense({ onClose, onSaved }) {
  const [f, setF] = useState({ category: 'rent', amount: '', date: today(), description: '', paymentMethod: 'cash' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true); setErr('');
    try { await api('/expenses', { method: 'POST', body: { category: f.category, amount: Number(f.amount), date: f.date, description: f.description || undefined, paymentMethod: f.paymentMethod } }); onSaved(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add expense" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!(Number(f.amount) > 0)}>Save</Button></>}>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category"><Select value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</Select></Field>
        <Field label="Amount *"><Input type="number" min="0" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Paid by"><Select value={f.paymentMethod} onChange={set('paymentMethod')}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></Select></Field>
        <div className="sm:col-span-2"><Field label="Description"><Input value={f.description} onChange={set('description')} placeholder="e.g. October electricity bill" /></Field></div>
      </div>
    </Modal>
  );
}

function VoidExpense({ expense, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr('');
    try { await api(`/expenses/${expense._id}/void`, { method: 'POST', body: { reason } }); onSaved(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Void ${expense.expenseNo}`} footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button variant="danger" onClick={save} loading={busy} disabled={reason.trim().length < 3}>Void expense</Button></>}>
      <p className="mb-3 text-sm text-muted">Expenses are never deleted. A voided expense stays in the records with your reason, and is left out of totals.</p>
      <ErrorNote error={err} />
      <Field label="Reason *"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" /></Field>
    </Modal>
  );
}
