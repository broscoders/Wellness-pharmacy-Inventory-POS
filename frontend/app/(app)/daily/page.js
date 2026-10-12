'use client';
import { useCallback, useEffect, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { dailyMessage, waLink } from '@/lib/whatsapp';
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Spinner, Table } from '@/components/ui';

const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };

function Stat({ label, value, sub, tone }) {
  return <Card className="p-4"><p className="text-xs text-muted">{label}</p><p className={`num mt-1 text-xl font-semibold ${tone === 'bad' ? 'text-danger' : tone === 'good' ? 'text-pine-dark' : ''}`}>{value}</p>{sub && <p className="num text-xs text-muted">{sub}</p>}</Card>;
}

export default function DailySummaryPage() {
  const [date, setDate] = useState(today());
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => { try { setD((await api('/ops/daily-summary', { params: { date } })).data); setError(''); } catch (e) { setError(e.message); } }, [date]);
  useEffect(() => { setD(null); load(); }, [load]);
  const text = d ? dailyMessage(d) : '';
  const backupAge = d?.lastBackupAt ? Math.floor((Date.now() - new Date(d.lastBackupAt).getTime()) / 86400000) : null;

  return (
    <>
      <PageHeader title="Daily summary" subtitle="The whole day on one screen. Send it to yourself or your partners on WhatsApp at closing time."
        actions={<Field label=""><Input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day" /></Field>} />
      <ErrorNote error={error} />
      {!d ? <Spinner /> : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <a href={waLink('', text)} target="_blank" rel="noreferrer"><Button><MessageCircle className="h-4 w-4" /> Send on WhatsApp</Button></a>
            <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}><Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy text'}</Button>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Sales" value={money(d.sales.total)} sub={`${d.sales.bills} bills${d.sales.returns ? `, ${d.sales.returns} returns` : ''}`} />
            <Stat label="Gross profit" value={money(d.profit.grossProfit)} sub={`${d.profit.grossMarginPercent}% margin`} />
            <Stat label="Expenses (incl. salaries)" value={money(d.profit.expenses)} />
            <Stat label="Net profit" value={money(d.profit.netProfit)} tone={d.profit.netProfit < 0 ? 'bad' : 'good'} />
          </div>
          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Card className="p-4">
              <p className="mb-2 font-semibold">How customers paid</p>
              <div className="num grid grid-cols-2 gap-2 text-sm"><span>Cash</span><b className="text-right">{money(d.sales.cash)}</b><span>Card</span><b className="text-right">{money(d.sales.card)}</b><span>Bank transfer</span><b className="text-right">{money(d.sales.bank)}</b><span>Udhaar (credit)</span><b className="text-right">{money(d.sales.credit)}</b></div>
              <p className="mb-2 mt-4 font-semibold">Udhaar</p>
              <div className="num grid grid-cols-2 gap-2 text-sm"><span>Given today</span><b className="text-right">{money(d.udhaar.given)}</b><span>Received today</span><b className="text-right">{money(d.udhaar.received)}</b><span>Total owed to you</span><b className="text-right">{money(d.udhaar.totalOwed)}</b><span>You owe suppliers</span><b className="text-right">{money(d.payables)}</b></div>
            </Card>
            <Card className="p-4">
              <p className="mb-2 font-semibold">Cash drawers</p>
              {d.cash.shiftsClosed === 0 ? <p className="text-sm text-muted">No shift was closed on this day.</p> : d.cash.difference === 0 ? <p className="text-sm text-pine-dark">All {d.cash.shiftsClosed} closed shift(s) matched exactly.</p> : (
                <ul className="text-sm">{d.cash.shortOrExtra.map((s) => <li key={s.shiftNo} className="flex justify-between"><span>{s.user} ({s.shiftNo})</span><b className={`num ${s.difference < 0 ? 'text-danger' : 'text-amber'}`}>{s.difference > 0 ? '+' : ''}{money(s.difference)}</b></li>)}</ul>
              )}
              <p className="mb-2 mt-4 font-semibold">Stock needs attention</p>
              <div className="flex flex-wrap gap-2 text-sm"><Badge tone={d.stockAlerts.outOfStock ? 'bad' : 'good'}>{d.stockAlerts.outOfStock} out of stock</Badge><Badge tone={d.stockAlerts.lowStock ? 'warn' : 'good'}>{d.stockAlerts.lowStock} low</Badge><Badge tone={d.stockAlerts.expired ? 'bad' : 'good'}>{d.stockAlerts.expired} expired</Badge><Badge tone={d.stockAlerts.nearExpiry30 ? 'warn' : 'good'}>{d.stockAlerts.nearExpiry30} expiring in 30 days</Badge></div>
              <p className="mb-1 mt-4 font-semibold">Backup</p>
              <p className={`text-sm ${backupAge === null || backupAge > 7 ? 'text-danger' : 'text-muted'}`}>{d.lastBackupAt ? `Last downloaded ${dateTime(d.lastBackupAt)} (${backupAge} days ago)` : 'No backup has been downloaded yet.'} <a href="/settings" className="underline">Settings &gt; Backup</a></p>
            </Card>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><div className="border-b border-line px-4 py-3 font-semibold">Top sellers</div>{d.topSellers.length === 0 ? <p className="p-4 text-sm text-muted">No sales.</p> : <Table head={['Medicine', { label: 'Boxes', right: true }, { label: 'Revenue', right: true }]}>{d.topSellers.map((t) => <tr key={t.name}><td className="px-3 py-2 font-medium">{t.name}</td><td className="num px-3 py-2 text-right">{t.boxes}</td><td className="num px-3 py-2 text-right">{money(t.revenue)}</td></tr>)}</Table>}</Card>
            <Card><div className="border-b border-line px-4 py-3 font-semibold">Sales by staff</div>{d.staff.length === 0 ? <p className="p-4 text-sm text-muted">No sales.</p> : <Table head={['Staff', { label: 'Bills', right: true }, { label: 'Sales', right: true }]}>{d.staff.map((s) => <tr key={s.name}><td className="px-3 py-2 font-medium">{s.name}</td><td className="num px-3 py-2 text-right">{s.bills}</td><td className="num px-3 py-2 text-right">{money(s.total)}</td></tr>)}</Table>}</Card>
          </div>
        </>
      )}
    </>
  );
}
