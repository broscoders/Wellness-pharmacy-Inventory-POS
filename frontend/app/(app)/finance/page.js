'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Spinner, Table } from '@/components/ui';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function presets() {
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  return {
    month: ['This month', iso(new Date(y, m, 1)), iso(now)],
    last: ['Last month', iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
    d30: ['Last 30 days', iso(new Date(now.getTime() - 29 * 86400000)), iso(now)],
    year: ['This year', iso(new Date(y, 0, 1)), iso(now)],
  };
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const ISSUE = { below_cost: ['Sold below cost', 'bad'], above_mrp: ['Above MRP', 'bad'], no_price: ['No sale price', 'warn'], low_margin: ['Very low margin', 'warn'] };

// "+12.5%" vs the period before; hidden when there is nothing to compare with.
function Change({ now, before, goodWhenUp = true }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
  if (!Number.isFinite(pct) || pct === 0) return <span className="text-xs text-muted">same as before</span>;
  const good = goodWhenUp ? pct > 0 : pct < 0;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center text-xs font-medium ${good ? 'text-pine-dark' : 'text-danger'}`}><Icon className="h-3.5 w-3.5" />{Math.abs(pct)}% vs last period</span>;
}

function Stat({ label, value, sub, tone, children }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold ${tone === 'bad' ? 'text-danger' : ''}`}>{value}</p>
      {sub && <p className="num text-sm text-muted">{sub}</p>}
      <div className="mt-1">{children}</div>
    </Card>
  );
}

export default function FinancePage() {
  const P = useMemo(presets, []);
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(P.month[1]);
  const [to, setTo] = useState(P.month[2]);
  const [d, setD] = useState(null);
  const [issues, setIssues] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const r = await api('/finance/summary', { params: { from, to } }); setD(r); setError(''); } catch (e) { setError(e.message); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/finance/pricing-issues').then(setIssues).catch(() => {}); }, []);

  const pick = (k) => { setPreset(k); setD(null); setFrom(P[k][1]); setTo(P[k][2]); };
  const c = d?.data.current; const p = d?.data.previous; const bal = d?.data.balance; const trend = d?.data.trend || [];
  const maxBar = Math.max(1, ...trend.flatMap((t) => [t.netSales, t.expenses, Math.abs(t.netProfit)]));

  return (
    <>
      <PageHeader title="Finance" subtitle="Profit, margins and where the money goes" actions={<Link href="/payroll"><Button variant="secondary">Staff salaries</Button></Link>} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-2 p-3">
          {Object.entries(P).map(([k, [label]]) => (
            <button key={k} onClick={() => pick(k)} className={`rounded-full border px-3 py-1 text-xs font-medium ${preset === k ? 'border-pine bg-pine text-white' : 'border-line hover:bg-mint'}`}>{label}</button>
          ))}
          <div className="ml-auto flex items-end gap-2">
            <Field label="From"><Input type="date" value={from} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} /></Field>
          </div>
        </div>
      </Card>
      <ErrorNote error={error} />
      {!d ? <Spinner /> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Net sales" value={money(c.netSales)} sub={`${c.invoices} bills`}><Change now={c.netSales} before={p.netSales} /></Stat>
            <Stat label="Gross profit" value={money(c.grossProfit)} sub={`${c.grossMarginPercent}% margin`}><Change now={c.grossProfit} before={p.grossProfit} /></Stat>
            <Stat label="Expenses" value={money(c.expenses)} sub={`${c.expenseRatioPercent}% of net sales`}><Change now={c.expenses} before={p.expenses} goodWhenUp={false} /></Stat>
            <Stat label="Net profit" value={money(c.estimatedNetProfit)} sub={`${c.netMarginPercent}% of net sales`} tone={c.estimatedNetProfit < 0 ? 'bad' : undefined}><Change now={c.estimatedNetProfit} before={p.estimatedNetProfit} /></Stat>
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="border-b border-line px-4 py-3 font-semibold">Profit and loss <span className="ml-2 text-xs font-normal text-muted">{d.range.from} to {d.range.to}</span></div>
              <div className="num divide-y divide-line text-sm">
                {[['Sales', c.sales], ['Less: returns', -c.salesReturns], ['Net sales', c.netSales, 'b'], ['Less: cost of medicines sold', -c.purchaseCostOfGoodsSold]].map(([l, v, b]) => <div key={l} className={`flex justify-between px-4 py-2 ${b ? 'font-semibold' : ''}`}><span>{l}</span><span>{money(v)}</span></div>)}
                <div className="flex justify-between bg-mint px-4 py-2 font-semibold"><span>Gross profit <span className="font-normal text-muted">({c.grossMarginPercent}%)</span></span><span>{money(c.grossProfit)}</span></div>
                {Object.keys(c.expensesByCategory).length === 0 && <div className="px-4 py-2 text-muted">No expenses recorded in this period.</div>}
                {Object.entries(c.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} className="px-4 py-2">
                    <div className="flex justify-between"><span className="capitalize">Less: {k}</span><span>{money(-v)}</span></div>
                    <div className="mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 rounded bg-paper"><div className="h-1.5 rounded bg-amber" style={{ width: `${Math.min(100, (v / Math.max(c.expenses, 1)) * 100)}%` }} /></div><span className="w-24 text-right text-xs text-muted">{Math.round((v / Math.max(c.netSales, 1)) * 1000) / 10}% of sales</span></div>
                  </div>
                ))}
                <div className={`flex justify-between px-4 py-3 text-base font-semibold ${c.estimatedNetProfit < 0 ? 'bg-danger-soft text-danger' : 'bg-pine-dark text-white'}`}><span>Net profit <span className="text-sm font-normal opacity-80">({c.netMarginPercent}%)</span></span><span>{money(c.estimatedNetProfit)}</span></div>
              </div>
              <p className="border-t border-line px-4 py-3 text-xs text-muted">Cost of medicines uses the purchase cost of the exact batches sold. Salaries paid in Payroll are counted in expenses. Purchases made in this period ({money(c.purchasesMade)}) are stock, not a cost, until the medicines are sold.</p>
            </Card>

            <Card>
              <div className="border-b border-line px-4 py-3 font-semibold">Last 6 months</div>
              <div className="space-y-3 p-4">
                {trend.map((t) => (
                  <div key={t.month}>
                    <div className="flex items-baseline justify-between text-sm"><span className="font-medium">{monthLabel(t.month)}</span><span className={`num ${t.netProfit < 0 ? 'text-danger' : 'text-pine-dark'}`}>net {money(t.netProfit)} ({t.netMarginPercent}%)</span></div>
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center gap-2"><div className="h-2 rounded bg-pine" style={{ width: `${(t.netSales / maxBar) * 100}%` }} /><span className="num text-xs text-muted">sales {money(t.netSales)}</span></div>
                      <div className="flex items-center gap-2"><div className="h-2 rounded bg-mint-dark" style={{ width: `${(Math.max(t.grossProfit, 0) / maxBar) * 100}%`, background: '#7bb892' }} /><span className="num text-xs text-muted">gross profit {money(t.grossProfit)}</span></div>
                      <div className="flex items-center gap-2"><div className="h-2 rounded bg-amber" style={{ width: `${(t.expenses / maxBar) * 100}%` }} /><span className="num text-xs text-muted">expenses {money(t.expenses)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Stock on shelf (at cost)" value={money(bal.stockValueAtCost)} sub="sellable, not expired" />
            <Stat label="Customers owe you (udhaar)" value={money(bal.customerReceivables)} />
            <Stat label="You owe suppliers" value={money(bal.supplierPayables)} />
            <Stat label="Stock + udhaar - payables" value={money(bal.netPosition)} sub="what the business holds, before cash" />
          </div>

          <Card>
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="font-semibold">Price check</span><span className="text-xs text-muted">Prices that lose money or break the rules</span></div>
            {!issues ? <Spinner /> : issues.data.length === 0 ? <p className="p-6 text-center text-sm text-pine-dark">All medicine prices look healthy.</p> : (
              <Table head={['Medicine', 'Problem', { label: 'Cost / box', right: true }, { label: 'Sale / box', right: true }, { label: 'MRP', right: true }]}>
                {issues.data.slice(0, 30).map((x, i) => (
                  <tr key={`${x._id}-${i}`}>
                    <td className="px-3 py-2 font-medium">{x.name}</td>
                    <td className="px-3 py-2"><Badge tone={ISSUE[x.issue][1]}>{ISSUE[x.issue][0]}</Badge> <span className="text-xs text-muted">{x.detail}</span></td>
                    <td className="num px-3 py-2 text-right">{money(x.purchasePrice)}</td><td className="num px-3 py-2 text-right">{x.salePriceBox ? money(x.salePriceBox) : '-'}</td><td className="num px-3 py-2 text-right">{x.mrp ? money(x.mrp) : '-'}</td>
                  </tr>
                ))}
              </Table>
            )}
            {issues && issues.data.length > 30 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Showing the 30 most serious of {issues.data.length}. Fix prices on the Medicines page.</p>}
          </Card>
        </>
      )}
    </>
  );
}
