'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { money, stockText, dateOnly } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, PageHeader, Select, Spinner, Table } from '@/components/ui';

const TABS = [['sales', 'Sales'], ['profit', 'Profit & loss'], ['inventory', 'Inventory'], ['suppliers', 'Suppliers'], ['customers', 'Customers']];
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

function Summary({ items }) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value, tone]) => (
        <div key={label} className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">{label}</p><p className={`num text-lg font-semibold ${tone === 'bad' ? 'text-danger' : ''}`}>{value}</p></div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [groupBy, setGroupBy] = useState('day');
  const [loaded, setLoaded] = useState(null); // { key, res } - data is tagged with the request it belongs to
  const [error, setError] = useState('');
  const key = `${tab}|${from}|${to}|${tab === 'sales' ? groupBy : ''}`;
  // Never render another tab's data in this tab's layout (they have different shapes).
  const d = loaded?.key === key ? loaded.res : null;

  useEffect(() => {
    let alive = true;
    setError('');
    api(`/reports/${tab}`, { params: { from, to, groupBy: tab === 'sales' ? groupBy : undefined } })
      .then((res) => { if (alive) setLoaded({ key, res }); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [key, tab, from, to, groupBy]);

  const csv = (name, cols, rows) => (
    <Button variant="secondary" size="sm" disabled={!rows?.length} onClick={() => downloadCsv(`${name}-${from}-to-${to}.csv`, cols, rows)}><Download className="h-4 w-4" /> Export CSV</Button>
  );

  return (
    <>
      <PageHeader title="Reports" subtitle="Owner reports. Dates use Pakistan time." />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 font-medium ${tab === k ? 'border-pine text-pine-dark' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>)}
      </div>
      {tab !== 'inventory' && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {tab === 'sales' && <Field label="Group by"><Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></Select></Field>}
        </div>
      )}
      <ErrorNote error={error} />
      {!d && !error && <Spinner />}

      {d && tab === 'sales' && (
        <div className="space-y-4">
          <Card>
            <Summary items={[['Invoices', d.totals.invoices], ['Gross sales', money(d.totals.gross)], ['Returns', money(d.totals.returns)], ['Net sales', money(d.totals.net)]]} />
            <div className="flex justify-end px-3 pb-2">{csv('sales', [{ key: 'period', label: 'Period' }, { key: 'invoices', label: 'Invoices' }, { key: 'gross', label: 'Gross' }, { key: 'returns', label: 'Returns' }, { key: 'net', label: 'Net' }, { key: 'cost', label: 'Cost' }, { key: 'profit', label: 'Gross profit' }], d.data)}</div>
            {d.data.length === 0 ? <Empty>No sales in this period.</Empty> : (
              <Table head={['Period', { label: 'Invoices', right: true }, { label: 'Gross', right: true }, { label: 'Returns', right: true }, { label: 'Net', right: true }, { label: 'Cost', right: true }, { label: 'Gross profit', right: true }]}>
                {d.data.map((r) => <tr key={r.period}><td className="px-3 py-2 font-medium">{r.period}</td><td className="num px-3 py-2 text-right">{r.invoices}</td><td className="num px-3 py-2 text-right">{money(r.gross)}</td><td className="num px-3 py-2 text-right">{money(r.returns)}</td><td className="num px-3 py-2 text-right">{money(r.net)}</td><td className="num px-3 py-2 text-right">{money(r.cost)}</td><td className="num px-3 py-2 text-right font-medium">{money(r.profit)}</td></tr>)}
              </Table>
            )}
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4"><h3 className="mb-2 font-semibold">Retail vs wholesale</h3>{['retail', 'wholesale'].map((t) => <p key={t} className="flex justify-between text-sm"><span className="capitalize">{t} ({d.byType[t].invoices})</span><span className="num">{money(d.byType[t].total)}</span></p>)}</Card>
            <Card className="p-4"><h3 className="mb-2 font-semibold">Money received by method</h3>{Object.entries(d.byPayment).map(([k, v]) => <p key={k} className="flex justify-between text-sm"><span className="capitalize">{k === 'credit' ? 'Credit (udhaar)' : k.replace('_', ' ')}</span><span className="num">{money(v)}</span></p>)}</Card>
            <Card className="p-4"><h3 className="mb-2 font-semibold">Staff-wise sales</h3>{d.byStaff.length === 0 ? <p className="text-sm text-muted">-</p> : d.byStaff.map((s) => <p key={s.staff} className="flex justify-between text-sm"><span>{s.staff} ({s.invoices})</span><span className="num">{money(s.total)}</span></p>)}</Card>
          </div>
        </div>
      )}

      {d && tab === 'profit' && (
        <Card className="max-w-2xl">
          <div className="space-y-2 p-5 text-[15px]">
            {[['Sales (invoiced)', d.data.sales], ['Less: sales returns', -d.data.salesReturns], ['Net sales', d.data.netSales, 'b'], ['Less: purchase cost of goods sold', -d.data.purchaseCostOfGoodsSold], ['Gross profit', d.data.grossProfit, 'b'], ['Less: expenses', -d.data.expenses], ['Estimated net profit', d.data.estimatedNetProfit, 'B']].map(([l, v, b]) => (
              <div key={l} className={`flex justify-between ${b ? 'border-t border-line pt-2 font-semibold' : ''} ${b === 'B' ? 'text-lg' : ''}`}><span>{l}</span><span className={`num ${v < 0 && b === 'B' ? 'text-danger' : ''}`}>{v < 0 ? `- ${money(-v)}` : money(v)}</span></div>
            ))}
          </div>
          {Object.keys(d.data.expensesByCategory).length > 0 && <div className="border-t border-line px-5 py-3"><p className="mb-1 text-sm font-medium">Expenses by category</p><div className="flex flex-wrap gap-2">{Object.entries(d.data.expensesByCategory).map(([k, v]) => <Badge key={k}><span className="capitalize">{k}</span>: {money(v)}</Badge>)}</div></div>}
          <p className="border-t border-line px-5 py-3 text-xs text-muted">Purchases made in this period (information only): {money(d.data.purchasesMade)}. Profit is estimated: cost of goods sold uses the purchase cost of the exact batches sold.</p>
        </Card>
      )}

      {d && tab === 'inventory' && (
        <div className="space-y-4">
          <Card>
            <Summary items={[['Medicines', d.totals.medicines], ['Sellable stock value (at cost)', money(d.totals.stockValue)], ['Expired stock value', money(d.totals.expiredValue), d.totals.expiredValue ? 'bad' : undefined], ['Low / out of stock', `${d.data.lowStock.length} / ${d.data.outOfStock.length}`]]} />
            <div className="flex justify-end px-3 pb-2">{csv('inventory', [{ key: 'name', label: 'Medicine' }, { key: 'category', label: 'Category' }, { label: 'Sellable units', value: (r) => r.sellable }, { label: 'Expired units', value: (r) => r.expired }, { key: 'value', label: 'Value (cost)' }], d.data.stock)}</div>
            <Table head={['Medicine', 'Category', { label: 'Sellable stock', right: true }, { label: 'Expired units', right: true }, { label: 'Value at cost', right: true }]}>
              {d.data.stock.map((r) => <tr key={r._id}><td className="px-3 py-2 font-medium">{r.name}</td><td className="px-3 py-2">{r.category || '-'}</td><td className="num px-3 py-2 text-right">{stockText(r.display)} <span className="text-xs text-muted">({r.sellable})</span></td><td className="num px-3 py-2 text-right">{r.expired ? <span className="text-danger">{r.expired}</span> : '-'}</td><td className="num px-3 py-2 text-right">{money(r.value)}</td></tr>)}
            </Table>
          </Card>
          <p className="text-sm text-muted">Expiry and low-stock details are in Inventory, Alerts. Stock movement history is in Inventory, Stock history.</p>
        </div>
      )}

      {d && tab === 'suppliers' && (
        <Card>
          <Summary items={[['Purchases', money(d.totals.purchases)], ['Payments made', money(d.totals.payments)], ['Returned to suppliers', money(d.totals.returns)], ['We owe (now)', money(d.totals.outstanding)]]} />
          <div className="flex justify-end px-3 pb-2">{csv('suppliers', [{ key: 'name', label: 'Supplier' }, { key: 'purchases', label: 'Purchases' }, { key: 'payments', label: 'Payments' }, { key: 'returns', label: 'Returns' }, { key: 'outstanding', label: 'Outstanding' }], d.data)}</div>
          {d.data.length === 0 ? <Empty>No supplier activity.</Empty> : (
            <Table head={['Supplier', { label: 'Purchases', right: true }, { label: 'Payments', right: true }, { label: 'Returns', right: true }, { label: 'Outstanding now', right: true }]}>
              {d.data.map((r) => <tr key={r._id}><td className="px-3 py-2 font-medium">{r.name}</td><td className="num px-3 py-2 text-right">{money(r.purchases)}</td><td className="num px-3 py-2 text-right">{money(r.payments)}</td><td className="num px-3 py-2 text-right">{money(r.returns)}</td><td className="num px-3 py-2 text-right font-medium">{money(r.outstanding)}</td></tr>)}
            </Table>
          )}
        </Card>
      )}

      {d && tab === 'customers' && (
        <Card>
          <Summary items={[['Purchases', money(d.totals.purchases)], ['Given on credit', money(d.totals.credit)], ['Payments received', money(d.totals.payments)], ['Customers owe (now)', money(d.totals.outstanding)]]} />
          <div className="flex justify-end px-3 pb-2">{csv('customers', [{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'invoices', label: 'Invoices' }, { key: 'purchases', label: 'Purchases' }, { key: 'credit', label: 'Credit' }, { key: 'payments', label: 'Payments' }, { key: 'outstanding', label: 'Outstanding' }], d.data)}</div>
          {d.data.length === 0 ? <Empty>No customer activity.</Empty> : (
            <Table head={['Customer', { label: 'Invoices', right: true }, { label: 'Purchases', right: true }, { label: 'On credit', right: true }, { label: 'Payments', right: true }, { label: 'Outstanding now', right: true }]}>
              {d.data.map((r) => <tr key={r._id}><td className="px-3 py-2"><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.phone}</p></td><td className="num px-3 py-2 text-right">{r.invoices}</td><td className="num px-3 py-2 text-right">{money(r.purchases)}</td><td className="num px-3 py-2 text-right">{money(r.credit)}</td><td className="num px-3 py-2 text-right">{money(r.payments)}</td><td className="num px-3 py-2 text-right font-medium">{money(r.outstanding)}</td></tr>)}
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
