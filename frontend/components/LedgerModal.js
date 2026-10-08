'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateTime, money } from '@/lib/format';
import { Badge, Button, ErrorNote, Field, Input, Modal, Select, Spinner, Table } from '@/components/ui';

const LABEL = {
  sale_credit: 'Credit sale', payment: 'Payment', return_adjust: 'Return adjusted', sale_cancel: 'Invoice cancelled', opening: 'Opening', adjustment: 'Adjustment',
  purchase: 'Purchase', purchase_return: 'Purchase return',
};

// kind: 'customers' (we are owed) | 'suppliers' (we owe)
export default function LedgerModal({ kind, id, onClose, onChanged }) {
  const { can } = useAuth();
  const isCustomer = kind === 'customers';
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/${kind}/${id}/ledger`, { params: { limit: 50 } }).then(setData).catch((e) => setErr(e.message)), [kind, id]);
  useEffect(() => { load(); }, [load]);

  async function pay() {
    setBusy(true); setErr('');
    try {
      await api(`/${kind}/${id}/payments`, { method: 'POST', body: { amount: Number(amount), method, note: note || undefined } });
      setAmount(''); setNote(''); await load(); onChanged?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!data) return <Modal open onClose={onClose} title="Ledger"><ErrorNote error={err} />{!err && <Spinner />}</Modal>;
  const who = data.customer || data.supplier;

  return (
    <Modal open onClose={onClose} title={`${who.name} - ledger`} width="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-mint px-4 py-3">
        <span>{isCustomer ? 'Customer owes us' : 'We owe supplier'}</span>
        <span className="num text-xl font-semibold">{money(who.balance)}</span>
      </div>
      <ErrorNote error={err} />
      {can('payments:manage') && who.balance > 0 && (
        <div className="mb-4 grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_140px_1fr_auto] sm:items-end">
          <Field label={isCustomer ? 'Payment received' : 'Payment made'}><Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`up to ${who.balance}`} /></Field>
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></Select></Field>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button onClick={pay} loading={busy} disabled={!(Number(amount) > 0)}>Save</Button>
        </div>
      )}
      {data.data.length === 0 ? <p className="py-6 text-center text-muted">No entries yet.</p> : (
        <Table head={['Date', 'Entry', 'Reference', { label: 'Amount', right: true }, { label: 'Balance', right: true }]}>
          {data.data.map((r) => (
            <tr key={r._id}>
              <td className="px-3 py-2 text-muted">{dateTime(r.createdAt)}</td>
              <td className="px-3 py-2"><Badge tone={r.amount > 0 ? 'warn' : 'good'}>{LABEL[r.type] || r.type}</Badge>{r.method ? <span className="ml-1 text-xs capitalize text-muted">{r.method.replace('_', ' ')}</span> : null}</td>
              <td className="px-3 py-2">{r.invoiceNo || r.refNo || '-'}</td>
              <td className={`num px-3 py-2 text-right ${r.amount > 0 ? '' : 'text-pine-dark'}`}>{r.amount > 0 ? '+' : ''}{money(r.amount)}</td>
              <td className="num px-3 py-2 text-right">{money(r.balanceAfter)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}
