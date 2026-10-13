'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Lock, Unlock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateTime, money } from '@/lib/format';
import { round2 } from '@/lib/units';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Spinner, Table, Textarea } from '@/components/ui';

export default function ShiftsPage() {
  const { can } = useAuth();
  const [cur, setCur] = useState(undefined); // undefined = loading, null = no open shift
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // 'move' | 'close'
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([api('/shifts/current'), api('/shifts', { params: { status: 'closed', limit: 20 } })]);
      setCur(c.data); setHistory(h.data); setError('');
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000); return () => clearInterval(t); }, [load]);

  return (
    <>
      <PageHeader title="Cash closing" subtitle="Open your drawer, sell, then count the cash at the end. The system shows what should be there." />
      <ErrorNote error={error} />
      {cur === undefined ? <Spinner /> : cur === null ? <OpenShift onOpened={load} /> : (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div><p className="font-semibold">{cur.shiftNo} <Badge tone="good">Open</Badge></p><p className="text-xs text-muted">Opened {dateTime(cur.openedAt)} by {cur.userName}</p></div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDialog('move')}><ArrowDownToLine className="h-4 w-4" /> Cash in / out</Button>
              <Button onClick={() => setDialog('close')}><Lock className="h-4 w-4" /> Close shift</Button>
            </div>
          </div>
          <Live s={cur.live} movements={cur.movements} />
        </Card>
      )}

      <Card>
        <div className="border-b border-line px-4 py-3 font-semibold">{can('shifts:manage') ? 'Recent closed shifts (all cashiers)' : 'Your recent closed shifts'}</div>
        {!history ? <Spinner /> : history.length === 0 ? <Empty>No closed shifts yet.</Empty> : (
          <Table head={['Shift', 'Cashier', 'Opened', 'Closed', { label: 'Expected', right: true }, { label: 'Counted', right: true }, { label: 'Difference', right: true }]}>
            {history.map((s) => (
              <tr key={s._id} className="cursor-pointer hover:bg-paper" onClick={() => setDetail(s._id)}>
                <td className="num px-3 py-2">{s.shiftNo}</td><td className="px-3 py-2">{s.userName}</td><td className="px-3 py-2 text-muted">{dateTime(s.openedAt)}</td><td className="px-3 py-2 text-muted">{dateTime(s.closedAt)}</td>
                <td className="num px-3 py-2 text-right">{money(s.expectedCash)}</td><td className="num px-3 py-2 text-right">{money(s.countedCash)}</td>
                <td className={`num px-3 py-2 text-right font-semibold ${s.difference < 0 ? 'text-danger' : s.difference > 0 ? 'text-amber' : 'text-pine-dark'}`}>{s.difference === 0 ? 'Matched' : `${s.difference > 0 ? '+' : ''}${money(s.difference)}`}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {dialog === 'move' && cur && <MoveCash shift={cur} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}
      {dialog === 'close' && cur && <CloseShift shift={cur} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}
      {detail && <ShiftDetail id={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function OpenShift({ onOpened }) {
  const [cash, setCash] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true); setErr('');
    try { await api('/shifts', { method: 'POST', body: { openingCash: Number(cash) || 0 } }); onOpened(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="mb-5 max-w-lg p-5">
      <p className="font-semibold">Open your cash drawer</p>
      <p className="mt-1 text-sm text-muted">Count the cash in the drawer now and enter it. Everything you sell and receive from here on is tracked against it.</p>
      <ErrorNote error={err} />
      <div className="mt-4 flex items-end gap-3">
        <Field label="Cash in drawer now"><Input className="num w-40 text-right" type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" autoFocus /></Field>
        <Button onClick={open} loading={busy}><Unlock className="h-4 w-4" /> Open shift</Button>
      </div>
    </Card>
  );
}

function Row({ label, value, sign, muted }) {
  return <div className="flex justify-between py-1.5"><span className={muted ? 'text-muted' : ''}>{label}</span><span className="num">{sign}{money(value)}</span></div>;
}

// The drawer sum, line by line, so the cashier and owner can see exactly where the expected figure comes from.
function Live({ s, movements = [] }) {
  if (!s) return null;
  if (s.expectedCash === undefined) {
    // blind closing: no sums, so nobody can simply type the expected figure
    return (
      <div className="p-4 text-sm">
        <div className="num grid max-w-sm grid-cols-2 gap-2"><span className="text-muted">Opening cash</span><b className="text-right">{money(s.openingCash)}</b><span className="text-muted">Bills this shift</span><b className="text-right">{s.salesCount}</b><span className="text-muted">Sales this shift</span><b className="text-right">{money(s.salesTotal)}</b></div>
        <p className="mt-3 rounded-md bg-paper p-3 text-muted">When you finish, count the cash in the drawer and press Close shift. The system compares it with what it expects and tells you the result.</p>
        {movements.length > 0 && <div className="mt-3"><p className="mb-1 font-medium">Cash in / out</p>{movements.map((m) => <p key={m._id} className="flex justify-between text-xs text-muted"><span>{m.reason}</span><span className="num">{m.type === 'in' ? '+' : '-'}{money(m.amount)}</span></p>)}</div>}
      </div>
    );
  }
  return (
    <div className="grid gap-6 p-4 lg:grid-cols-[1fr_1fr_280px]">
      <div className="text-sm">
        <p className="mb-1 font-medium">Cash in the drawer</p>
        <Row label="Opening cash" value={s.openingCash} />
        <Row label={`Cash sales (${s.salesCount} bills)`} value={s.cashSales} sign="+ " />
        <Row label="Udhaar payments received in cash" value={s.customerPayments} sign="+ " />
        <Row label="Cash put in" value={s.cashIn} sign="+ " />
        <Row label="Cash refunds on returns" value={s.cashRefunds} sign="- " />
        {s.cancelledRefunds > 0 && <Row label="Refunds of cancelled earlier bills" value={s.cancelledRefunds} sign="- " />}
        <Row label="Supplier payments in cash" value={s.supplierPayments} sign="- " />
        <Row label="Expenses paid in cash" value={s.expenses} sign="- " />
        <Row label="Cash taken out" value={s.cashOut} sign="- " />
      </div>
      <div className="text-sm">
        <p className="mb-1 font-medium">Not cash (for your information)</p>
        <Row label="Card sales" value={s.cardSales} muted />
        <Row label="Bank transfer sales" value={s.bankSales} muted />
        <Row label="Udhaar (credit) sales" value={s.creditSales} muted />
        <Row label="All sales today in this shift" value={s.salesTotal} muted />
        {movements.length > 0 && <div className="mt-3"><p className="mb-1 font-medium">Cash in / out</p>{movements.map((m) => <p key={m._id} className="flex justify-between text-xs text-muted"><span>{m.reason}</span><span className="num">{m.type === 'in' ? '+' : '-'}{money(m.amount)}</span></p>)}</div>}
      </div>
      <div className="self-start rounded-lg bg-pine-dark p-4 text-white">
        <p className="text-sm text-white/70">Should be in the drawer</p>
        <p className="num mt-1 text-3xl font-semibold">{money(s.expectedCash)}</p>
      </div>
    </div>
  );
}

function MoveCash({ shift, onClose, onSaved }) {
  const [f, setF] = useState({ type: 'out', amount: '', reason: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr('');
    try { await api(`/shifts/${shift._id}/movement`, { method: 'POST', body: { type: f.type, amount: Number(f.amount), reason: f.reason } }); onSaved(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Cash in / out of the drawer" width="max-w-md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!(Number(f.amount) > 0) || f.reason.trim().length < 3}>Save</Button></>}>
      <ErrorNote error={err} />
      <p className="mb-3 text-sm text-muted">For money that is not a sale: owner takes cash, change brought from the bank, tea, a small payment. Shop expenses and supplier payments entered in the system are counted automatically.</p>
      <div className="mb-3 flex gap-2">
        {[['out', 'Cash taken out', ArrowUpFromLine], ['in', 'Cash put in', ArrowDownToLine]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setF({ ...f, type: k })} className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${f.type === k ? 'border-pine bg-mint text-pine-dark' : 'border-line'}`}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
      <div className="grid gap-3">
        <Field label="Amount"><Input className="num" type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
        <Field label="Reason"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Owner took cash" /></Field>
      </div>
    </Modal>
  );
}

function CloseShift({ shift, onClose, onSaved }) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const expected = shift.live.expectedCash; // undefined for cashiers (blind closing)
  const blind = expected === undefined;
  const [needNote, setNeedNote] = useState(false); // blind: the note box appears only if the server says the cash does not match
  const has = counted !== '';
  const diff = has && !blind ? round2(Number(counted) - expected) : 0;
  const showNote = blind ? needNote : diff !== 0;
  async function close() {
    setBusy(true); setErr('');
    try { await api(`/shifts/${shift._id}/close`, { method: 'POST', body: { countedCash: Number(counted), notes: showNote && notes ? notes : undefined } }); onSaved(); } catch (e) { if (blind && /does not match/i.test(e.message)) { setNeedNote(true); setErr(''); } else setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Close shift" width="max-w-md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={close} loading={busy} disabled={!has || (showNote && notes.trim().length < 3)}>Close shift</Button></>}>
      <ErrorNote error={err} />
      <p className="text-sm text-muted">{blind ? 'Count all the cash in the drawer and type the total.' : 'Count all the cash in the drawer and type the total. Do not look at the expected figure first.'}</p>
      <div className="mt-3 grid gap-3">
        <Field label="Cash counted in the drawer"><Input className="num h-12 text-right text-lg" type="number" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus /></Field>
        {has && !blind && (
          <div className="rounded-md bg-paper p-3 text-sm num">
            <div className="flex justify-between"><span className="text-muted">System expects</span><span>{money(expected)}</span></div>
            <div className={`mt-1 flex justify-between text-base font-semibold ${diff < 0 ? 'text-danger' : diff > 0 ? 'text-amber' : 'text-pine-dark'}`}><span>{diff === 0 ? 'Cash matches' : diff < 0 ? 'Cash is short by' : 'Cash is extra by'}</span><span>{diff === 0 ? '' : money(Math.abs(diff))}</span></div>
          </div>
        )}
        {blind && needNote && <p className="rounded-md bg-amber-soft p-2 text-sm text-amber">The counted cash does not match what the system expects. Count again, or write what happened below.</p>}
        {has && showNote && <Field label="Why is there a difference? *"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Short explanation for the owner" /></Field>}
      </div>
    </Modal>
  );
}

function ShiftDetail({ id, onClose }) {
  const [s, setS] = useState(null);
  useEffect(() => { api(`/shifts/${id}`).then((r) => setS(r.data)).catch(() => {}); }, [id]);
  return (
    <Modal open onClose={onClose} title={s ? `${s.shiftNo} - ${s.userName}` : 'Shift'} width="max-w-4xl">
      {!s ? <Spinner /> : (
        <>
          <p className="text-xs text-muted">{dateTime(s.openedAt)} to {dateTime(s.closedAt)}</p>
          <Live s={{ ...(s.summary || {}), expectedCash: s.expectedCash }} movements={s.movements} />
          <div className="mt-2 grid gap-1 text-sm num sm:grid-cols-3">
            <p>Counted: <b>{money(s.countedCash)}</b></p><p>Difference: <b className={s.difference < 0 ? 'text-danger' : ''}>{money(s.difference)}</b></p><p>Closed by: {s.closedByName}</p>
          </div>
          {s.notes && <p className="mt-2 rounded bg-amber-soft p-2 text-sm">Note: {s.notes}</p>}
        </>
      )}
    </Modal>
  );
}
