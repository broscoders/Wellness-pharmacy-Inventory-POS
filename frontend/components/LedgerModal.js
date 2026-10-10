'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateOnly, dateTime, money } from '@/lib/format';
import { Badge, Button, ErrorNote, Field, Input, Modal, Select, Spinner, Table } from '@/components/ui';
import { Printer } from 'lucide-react';
import PrintDoc from '@/components/PrintDoc';

const LABEL = {
  sale_credit: 'Credit sale', payment: 'Payment', return_adjust: 'Return adjusted', sale_cancel: 'Invoice cancelled', opening: 'Opening', adjustment: 'Adjustment',
  purchase: 'Purchase', purchase_return: 'Purchase return',
};

// kind: 'customers' (we are owed) | 'suppliers' (we owe)
export default function LedgerModal({ kind, id, onClose, onChanged }) {
  const { can } = useAuth();
  const isCustomer = kind === 'customers';
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('ledger');
  const [docs, setDocs] = useState(null); // invoices (customer) or purchases (supplier)
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/${kind}/${id}/ledger`, { params: { limit: 100 } }).then(setData).catch((e) => setErr(e.message)), [kind, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const path = isCustomer ? '/sales' : '/purchases';
    api(path, { params: { [isCustomer ? 'customer' : 'supplier']: id, limit: 100 } }).then((r) => setDocs(r.data)).catch(() => setDocs([]));
  }, [id, isCustomer]);

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
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-line">
        <div className="flex gap-1">
          {[['ledger', 'Ledger'], ['docs', isCustomer ? `Invoices${docs ? ` (${docs.length})` : ''}` : `Purchases${docs ? ` (${docs.length})` : ''}`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 font-medium ${tab === k ? 'border-pine text-pine-dark' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mb-1" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print statement</Button>
      </div>
      {tab === 'ledger' ? (
        <>
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
          </>
      ) : !docs ? <Spinner /> : docs.length === 0 ? <p className="py-6 text-center text-muted">{isCustomer ? 'No invoices for this customer yet.' : 'No purchases from this supplier yet.'}</p> : (
        <Table head={[isCustomer ? 'Invoice' : 'Purchase', 'Date', ...(isCustomer ? [] : ['Supplier invoice']), { label: 'Total', right: true }, { label: isCustomer ? 'On credit' : 'Left unpaid', right: true }, 'Status']}>
          {docs.map((x) => (
            <tr key={x._id}>
              <td className="num px-3 py-2 font-medium">{x.invoiceNo || x.purchaseNo}</td><td className="px-3 py-2 text-muted">{dateTime(x.createdAt || x.purchaseDate)}</td>
              {!isCustomer && <td className="px-3 py-2">{x.supplierInvoiceNo || '-'}</td>}
              <td className="num px-3 py-2 text-right">{money(x.total)}</td><td className="num px-3 py-2 text-right">{(isCustomer ? x.creditAmount : x.dueAmount) ? money(isCustomer ? x.creditAmount : x.dueAmount) : '-'}</td>
              <td className="px-3 py-2"><Badge tone={x.status === 'cancelled' ? 'bad' : x.status === 'completed' || x.status === 'received' ? 'good' : 'warn'}>{String(x.status).replace('_', ' ')}</Badge></td>
            </tr>
          ))}
        </Table>
      )}

      <PrintDoc title={isCustomer ? 'Customer account statement' : 'Supplier account statement'} subtitle={`${who.name}${who.phone ? ` | ${who.phone}` : ''} | ${isCustomer ? 'Amount due from customer' : 'Amount we owe supplier'}: ${money(who.balance)}`}>
        <table>
          <thead><tr><th>Date</th><th>Entry</th><th>Reference</th><th className="r">Amount</th><th className="r">Balance</th></tr></thead>
          <tbody>{[...data.data].reverse().map((r) => <tr key={r._id}><td>{dateOnly(r.createdAt)}</td><td>{LABEL[r.type] || r.type}{r.method ? ` (${r.method.replace('_', ' ')})` : ''}</td><td>{r.invoiceNo || r.refNo || ''}</td><td className="r">{r.amount > 0 ? '+' : ''}{money(r.amount)}</td><td className="r">{money(r.balanceAfter)}</td></tr>)}</tbody>
        </table>
        <p className="mt-2 font-bold">Closing balance: {money(who.balance)}</p>
        {data.meta.total > data.data.length && <p className="text-[10px]">Showing the latest {data.data.length} of {data.meta.total} entries.</p>}
      </PrintDoc>
    </Modal>
  );
}
