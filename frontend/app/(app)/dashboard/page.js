'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, PackageX, Users, Truck, TrendingUp, ShoppingBag, Boxes, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { BarList, SalesChart } from '@/components/Charts';
import { money, dateTime } from '@/lib/format';
import { Badge, Card, ErrorNote, PageHeader, Spinner, Table } from '@/components/ui';
import { useSettings } from '@/context/SettingsContext';

function Stat({ icon: Icon, label, value, tone = 'default', note }) {
  const tones = { default: 'text-pine-dark bg-mint', warn: 'text-amber bg-amber-soft', bad: 'text-danger bg-danger-soft' };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-md ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{label}</p>
          <p className="num truncate text-xl font-semibold">{value}</p>
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { can } = useAuth();
  const [d, setD] = useState(null);
  const [mode, setMode] = useState('');
  const [error, setError] = useState('');
  const [trend, setTrend] = useState(null);
  const [span, setSpan] = useState(14);
  const owner = can('reports:view');

  useEffect(() => {
    api('/dashboard').then((r) => { setMode(r.mode || ''); setD(r.data); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!owner) return undefined;
    let alive = true;
    api('/dashboard/trends', { params: { days: span } }).then((r) => { if (alive) setTrend(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, [owner, span]);

  if (error) return <ErrorNote error={error} />;
  if (!d) return <Spinner />;
  if (mode === 'counter') return <CounterHome d={d} />;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Today at a glance" />
      <BackupReminder />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={ShoppingBag} label="Today's sales" value={money(d.todaySales)} note={`${d.todaySalesCount} invoices`} />
        {d.todayPurchases !== undefined && <Stat icon={Truck} label="Today's purchases" value={money(d.todayPurchases)} />}
        {d.todayProfit !== undefined && <Stat icon={TrendingUp} label="Today's profit" value={money(d.todayProfit)} note="Gross, before expenses" />}
        <Stat icon={Boxes} label="Total stock" value={`${Number(d.totalStockUnits).toLocaleString()} units`} note={d.stockValue !== undefined ? `Value ${money(d.stockValue)}` : undefined} />
        <Stat icon={AlertTriangle} label="Low stock" value={d.lowStock} tone={d.lowStock ? 'warn' : 'default'} note={`${d.outOfStock} out of stock`} />
        <Stat icon={Clock} label="Near expiry (90 days)" value={d.nearExpiry} tone={d.nearExpiry ? 'warn' : 'default'} note={`${d.nearExpiry30} within 30 days`} />
        <Stat icon={PackageX} label="Expired stock" value={d.expired} tone={d.expired ? 'bad' : 'default'} note="Blocked from sale" />
        <Stat icon={Users} label="Customer udhaar" value={money(d.customerOutstanding)} />
        {d.supplierPayables !== undefined && <Stat icon={Wallet} label="Supplier payables" value={money(d.supplierPayables)} />}
      </div>

      {owner && trend && (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.8fr_1fr]">
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="font-semibold">Sales and profit</h2><p className="text-xs text-muted"><span className="mr-3 inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-pine" /> Net sales</span><span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-amber" /> Gross profit</span></p></div>
              <div className="flex gap-1">{[7, 14, 30].map((n) => <button key={n} onClick={() => setSpan(n)} className={`rounded-md border px-3 py-1 text-sm ${span === n ? 'border-pine bg-mint font-medium text-pine-dark' : 'border-line text-muted hover:bg-mint'}`}>{n} days</button>)}</div>
            </div>
            <SalesChart days={trend.days} />
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Best sellers (30 days)</h2>
            {trend.topMedicines.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : <BarList rows={trend.topMedicines.map((t) => ({ label: t.name, value: t.revenue, note: `${t.units.toLocaleString()} units sold, profit ${money(t.profit)}` }))} />}
          </Card>
        </div>
      )}

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">Recent transactions</h2><Link href="/sales" className="text-sm text-pine hover:underline">All sales</Link></div>
        {d.recentTransactions.length === 0 ? (
          <p className="p-6 text-center text-muted">No transactions yet.</p>
        ) : (
          <Table head={['Reference', 'Type', 'Party', { label: 'Amount', right: true }, 'When']}>
            {d.recentTransactions.map((t) => (
              <tr key={`${t.kind}-${t.id}`}>
                <td className="px-3 py-2 font-medium num">{t.ref}</td>
                <td className="px-3 py-2"><Badge tone={t.kind === 'sale' ? 'good' : 'neutral'}>{t.kind === 'sale' ? 'Sale' : 'Purchase'}</Badge> {t.status === 'cancelled' && <Badge tone="bad">Cancelled</Badge>}</td>
                <td className="px-3 py-2">{t.party}</td>
                <td className="num px-3 py-2 text-right">{money(t.amount)}</td>
                <td className="px-3 py-2 text-muted">{dateTime(t.at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

// Owner only: a loud reminder when no backup has been downloaded for a week.
function BackupReminder() {
  const { can } = useAuth();
  const { settings } = useSettings();
  if (!can('settings:manage')) return null;
  const age = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000) : null;
  if (age !== null && age <= 7) return null;
  return (
    <p className="mb-4 rounded-md bg-amber-soft px-4 py-3 text-sm text-amber">
      {age === null ? 'No backup of your data has been downloaded yet.' : `Your last backup was ${age} days ago.`} <Link href="/settings" className="font-medium underline">Download a backup now</Link> so nothing is lost if the computer or the database has a problem.
    </p>
  );
}

// What counter staff see instead of the owner's dashboard: their own day, their shift, what needs attention. No profit or costs.
function CounterHome({ d }) {
  const { can, user } = useAuth();
  const links = [['/pos', 'Open POS', 'pos:use'], ['/shifts', 'Cash closing', 'shifts:use'], ['/medicines', 'Find a medicine', 'medicines:view'], ['/customers', 'Customers', 'customers:view'], ['/inventory', 'Stock', 'inventory:view'], ['/purchases', 'Purchases', 'purchases:view']].filter(([, , perm]) => can(perm));
  const a = d.alerts;
  return (
    <>
      <PageHeader title={`Hello, ${user?.name?.split(' ')[0] || ''}`} subtitle="Your day at a glance" />
      {can('shifts:use') && !d.shift && <p className="mb-4 rounded-md bg-amber-soft px-4 py-3 text-sm text-amber">You have not opened your cash drawer yet. <Link href="/shifts" className="font-medium underline">Open your shift</Link></p>}
      <div className="mb-4 flex flex-wrap gap-2">{links.map(([href, label]) => <Link key={href} href={href} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-mint">{label}</Link>)}</div>
      {can('pos:use') && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={ShoppingBag} label="Your sales today" value={money(d.today.total)} note={`${d.today.bills} bills`} />
          <Stat icon={Wallet} label="Cash taken" value={money(d.today.cash)} />
          <Stat icon={Wallet} label="Card / bank" value={money(d.today.card + d.today.bank)} />
          <Stat icon={Users} label="On udhaar" value={money(d.today.credit)} />
        </div>
      )}
      {a && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={AlertTriangle} label="Low stock" value={a.lowStock} tone={a.lowStock ? 'warn' : 'default'} note={`${a.outOfStock} out of stock`} />
          <Stat icon={Clock} label="Expiring in 30 days" value={a.nearExpiry30} tone={a.nearExpiry30 ? 'warn' : 'default'} />
          <Stat icon={PackageX} label="Expired" value={a.expired} tone={a.expired ? 'bad' : 'default'} note="Blocked from sale" />
        </div>
      )}
      {can('pos:use') && (
        <Card>
          <div className="border-b border-line px-4 py-3 font-semibold">Your recent bills</div>
          {d.recentSales.length === 0 ? <p className="p-6 text-center text-sm text-muted">No bills yet today.</p> : (
            <Table head={['Invoice', 'Time', 'Customer', { label: 'Total', right: true }]}>
              {d.recentSales.map((s) => <tr key={s._id}><td className="num px-3 py-2 font-medium">{s.invoiceNo}</td><td className="px-3 py-2 text-muted">{dateTime(s.createdAt)}</td><td className="px-3 py-2">{s.customerName || 'Walk-in'}</td><td className="num px-3 py-2 text-right">{money(s.total)}</td></tr>)}
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
