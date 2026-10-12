'use client';
import { useCallback, useEffect, useState } from 'react';
import { Ban, Pencil, Plus, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { dateOnly, money } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const KIND = { salary: 'Salary', advance: 'Advance', bonus: 'Bonus' };

export default function PayrollPage() {
  const [tab, setTab] = useState('sheet');
  const [month, setMonth] = useState(thisMonth());
  const [sheet, setSheet] = useState(null);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(null); // sheet row
  const [editing, setEditing] = useState(null); // null | 'new' | employee
  const [voiding, setVoiding] = useState(null); // payment

  const loadSheet = useCallback(async () => { try { setSheet(await api('/payroll/sheet', { params: { month } })); setError(''); } catch (e) { setError(e.message); } }, [month]);
  const loadStaff = useCallback(async () => { try { setStaff((await api('/payroll/employees', { params: { all: 'true' } })).data); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { setSheet(null); loadSheet(); }, [loadSheet]);
  useEffect(() => { loadStaff(); }, [loadStaff]);

  return (
    <>
      <PageHeader title="Staff salaries" subtitle="Monthly salary, advances and bonus. Every payment is added to expenses, so profit stays correct."
        actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add staff member</Button>} />
      <div className="mb-4 flex gap-2">
        {[['sheet', 'Salary sheet'], ['staff', 'Staff list']].map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full border px-3 py-1 text-sm font-medium ${tab === k ? 'border-pine bg-pine text-white' : 'border-line hover:bg-mint'}`}>{label}</button>)}
      </div>
      <ErrorNote error={error} />

      {tab === 'sheet' && (
        <>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <Field label="Salary month"><Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
            {sheet && (
              <div className="num flex gap-6 text-sm">
                <div><p className="text-xs text-muted">Salary bill</p><p className="text-lg font-semibold">{money(sheet.totals.base)}</p></div>
                <div><p className="text-xs text-muted">Paid so far</p><p className="text-lg font-semibold text-pine-dark">{money(sheet.totals.paid)}</p></div>
                <div><p className="text-xs text-muted">Still to pay</p><p className={`text-lg font-semibold ${sheet.totals.remaining ? 'text-amber' : ''}`}>{money(sheet.totals.remaining)}</p></div>
              </div>
            )}
          </div>
          <Card>
            {!sheet ? <Spinner /> : sheet.data.length === 0 ? <Empty>No staff yet. Add your first staff member.</Empty> : (
              <div className="divide-y divide-line">
                {sheet.data.map((r) => (
                  <div key={r.employee._id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="font-medium">{r.employee.name}</p><p className="text-xs text-muted">{r.employee.designation || 'Staff'}</p></div>
                      <div className="num grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-5">
                        <span><span className="block text-xs text-muted">Salary</span>{money(r.base)}</span>
                        <span><span className="block text-xs text-muted">Paid</span>{money(r.salaryPaid)}</span>
                        <span><span className="block text-xs text-muted">Advance</span>{money(r.advances)}</span>
                        <span><span className="block text-xs text-muted">Bonus</span>{money(r.bonus)}</span>
                        <span><span className="block text-xs text-muted">Remaining</span><b className={r.remaining > 0 ? 'text-amber' : r.remaining < 0 ? 'text-danger' : 'text-pine-dark'}>{money(r.remaining)}</b></span>
                      </div>
                      <Button size="sm" onClick={() => setPaying(r)}><Wallet className="h-4 w-4" /> Pay</Button>
                    </div>
                    {r.payments.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-xs text-muted">
                        {r.payments.map((x) => (
                          <li key={x._id} className="flex items-center gap-2"><Badge>{KIND[x.kind]}</Badge><span className="num font-medium text-ink">{money(x.amount)}</span><span>{dateOnly(x.at)} | {x.method.replace('_', ' ')}{x.note ? ` | ${x.note}` : ''}</span><button className="ml-auto inline-flex items-center gap-1 hover:text-danger" onClick={() => setVoiding(x)}><Ban className="h-3 w-3" /> Void</button></li>
                        ))}
                      </ul>
                    )}
                    {r.remaining < 0 && <p className="mt-2 text-xs text-danger">Advances are more than the salary for this month.</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'staff' && (
        <Card>
          {!staff ? <Spinner /> : staff.length === 0 ? <Empty>No staff yet.</Empty> : (
            <Table head={['Name', 'Role', 'Phone', 'Joined', { label: 'Monthly salary', right: true }, 'Status', '']}>
              {staff.map((e) => (
                <tr key={e._id} className={e.isActive ? '' : 'opacity-50'}>
                  <td className="px-3 py-2 font-medium">{e.name}</td><td className="px-3 py-2">{e.designation || '-'}</td><td className="px-3 py-2">{e.phone || '-'}</td><td className="px-3 py-2 text-muted">{e.joinDate ? dateOnly(e.joinDate) : '-'}</td>
                  <td className="num px-3 py-2 text-right">{money(e.monthlySalary)}</td><td className="px-3 py-2">{e.isActive ? <Badge tone="good">Active</Badge> : <Badge>Left</Badge>}</td>
                  <td className="px-3 py-2 text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /> Edit</Button></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {paying && <PayDialog row={paying} month={month} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); loadSheet(); }} />}
      {editing && <EmployeeForm employee={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadStaff(); loadSheet(); }} />}
      {voiding && <VoidDialog payment={voiding} onClose={() => setVoiding(null)} onSaved={() => { setVoiding(null); loadSheet(); }} />}
    </>
  );
}

function PayDialog({ row, month, onClose, onSaved }) {
  const [kind, setKind] = useState('salary');
  const [amount, setAmount] = useState(row.remaining > 0 ? String(row.remaining) : '');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const choose = (k) => { setKind(k); setAmount(k === 'salary' && row.remaining > 0 ? String(row.remaining) : ''); };
  async function save() {
    setBusy(true); setErr('');
    try { await api('/payroll/payments', { method: 'POST', body: { employee: row.employee._id, month, kind, amount: Number(amount), method, note: note || undefined } }); onSaved(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Pay ${row.employee.name} (${month})`} width="max-w-md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!(Number(amount) > 0)}>Save payment</Button></>}>
      <ErrorNote error={err} />
      <div className="mb-3 flex gap-2">{Object.entries(KIND).map(([k, label]) => <button key={k} onClick={() => choose(k)} className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${kind === k ? 'border-pine bg-mint text-pine-dark' : 'border-line'}`}>{label}</button>)}</div>
      <p className="mb-3 text-xs text-muted">{kind === 'salary' ? `Salary left to pay this month: ${money(row.remaining)}.` : kind === 'advance' ? 'An advance is deducted from this month\'s salary.' : 'A bonus is extra, on top of the salary.'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount"><Input className="num" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Paid by"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option></Select></Field>
        <div className="sm:col-span-2"><Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></Field></div>
      </div>
    </Modal>
  );
}

function EmployeeForm({ employee, onClose, onSaved }) {
  const [f, setF] = useState({ name: employee?.name || '', designation: employee?.designation || '', phone: employee?.phone || '', monthlySalary: employee?.monthlySalary ?? '', joinDate: employee?.joinDate ? employee.joinDate.slice(0, 10) : '', isActive: employee ? employee.isActive : true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function save() {
    setBusy(true); setErr('');
    const body = { name: f.name, designation: f.designation || undefined, phone: f.phone || undefined, monthlySalary: Number(f.monthlySalary), joinDate: f.joinDate || undefined, isActive: f.isActive };
    try { if (employee) await api(`/payroll/employees/${employee._id}`, { method: 'PATCH', body }); else await api('/payroll/employees', { method: 'POST', body }); onSaved(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={employee ? `Edit ${employee.name}` : 'Add staff member'} width="max-w-md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={f.name.trim().length < 2 || f.monthlySalary === ''}>Save</Button></>}>
      <ErrorNote error={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Role"><Input value={f.designation} onChange={set('designation')} placeholder="Pharmacist, Helper..." /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Monthly salary *"><Input className="num" type="number" min="0" value={f.monthlySalary} onChange={set('monthlySalary')} /></Field>
        <Field label="Joining date"><Input type="date" value={f.joinDate} onChange={set('joinDate')} /></Field>
        {employee && <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={f.isActive} onChange={set('isActive')} /> Still working here</label>}
      </div>
    </Modal>
  );
}

function VoidDialog({ payment, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr('');
    try { await api(`/payroll/payments/${payment._id}/void`, { method: 'POST', body: { reason } }); onSaved(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Void this payment" width="max-w-md" footer={<><Button variant="secondary" onClick={onClose}>Keep it</Button><Button variant="danger" onClick={save} loading={busy} disabled={reason.trim().length < 3}>Void payment</Button></>}>
      <ErrorNote error={err} />
      <p className="mb-3 text-sm text-muted">{KIND[payment.kind]} of {money(payment.amount)}. It will also be removed from expenses and profit.</p>
      <Field label="Reason *"><Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}
