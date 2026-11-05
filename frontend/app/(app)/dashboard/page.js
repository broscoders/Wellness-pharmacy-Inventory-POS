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

function Hero({ name, shop, d }) {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const alerts = (d.lowStock || 0) + (d.nearExpiry30 || 0) + (d.expired || 0);
  return (
    <section className="hero mb-6 rounded-3xl p-6 text-white shadow-xl shadow-pine/20 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-100/80"><i className="live-dot" /> {today}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight lg:text-4xl">{greet}, <span className="text-gradient">{name?.split(' ')[0] || 'there'}</span></h1>
          <p className="mt-1 text-emerald-50/75">Dashboard &middot; {shop} &middot; today at a glance</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="glass rounded-2xl px-5 py-3"><p className="text-xs uppercase tracking-wider text-emerald-100/70">Today&apos;s sales</p><p className="num text-2xl font-extrabold">{money(d.todaySales)}</p></div>
          <div className="glass rounded-2xl px-5 py-3"><p className="text-xs uppercase tracking-wider text-emerald-100/70">Needs attention</p><p className="num text-2xl font-extrabold">{alerts}</p></div>
          <Link href="/pos" className="flex items-center gap-2 self-stretch rounded-2xl bg-white px-6 font-bold text-pine-dark shadow-lg transition hover:scale-[1.03]"><ShoppingBag className="h-5 w-5" /> Open POS</Link>
        </div>
      </div>
    </section>
  );
}

function Spark({ values, color = '#10b981' }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1); const W = 120; const H = 34;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 3 - (v / max) * (H - 8)).toFixed(1)}`);
  const id = `sp${color.slice(1)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-9 w-full" aria-hidden="true" preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`M${pts.join(' L')} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={`M${pts.join(' L')}`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ icon: Icon, label, value, tone = 'default', note, href, spark }) {
  const tones = { default: 'text-white brand-gradient shadow-md shadow-pine/30', warn: 'text-white bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-orange-300/40', bad: 'text-white bg-gradient-to-br from-rose-500 to-red-600 shadow-md shadow-red-300/40' };
  const body = (
    <Card className="group h-full p-5 hover:-translate-y-0.5">
      <div className="flex items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
          <p className="num truncate text-2xl font-bold">{value}</p>
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
      </div>
      {spark && <Spark values={spark} color={tone === 'warn' ? '#f59e0b' : tone === 'bad' ? '#ef4444' : '#10b981'} />}
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export default function DashboardPage() {
  const { can, user } = useAuth();
  const { settings } = useSettings();
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
      <Hero name={user?.name} shop={settings.shopName} d={d} />
      <BackupReminder />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={ShoppingBag} label="Today's sales" value={money(d.todaySales)} note={`${d.todaySalesCount} invoices`} href="/sales" spark={trend?.days?.map((x) => x.sales)} />
        {d.todayPurchases !== undefined && <Stat icon={Truck} label="Today's purchases" value={money(d.todayPurchases)} />}
        {d.todayProfit !== undefined && <Stat icon={TrendingUp} label="Today's profit" value={money(d.todayProfit)} note="Gross, before expenses" href="/finance" spark={trend?.days?.map((x) => x.profit)} />}
        <Stat icon={Boxes} label="Total stock" value={`${Number(d.totalStockUnits).toLocaleString()} units`} note={d.stockValue !== undefined ? `Value ${money(d.stockValue)}` : undefined} />
        <Stat icon={AlertTriangle} label="Low stock" value={d.lowStock} tone={d.lowStock ? 'warn' : 'default'} note={`${d.outOfStock} out of stock`} href="/inventory" />
        <Stat icon={Clock} label="Near expiry (90 days)" value={d.nearExpiry} tone={d.nearExpiry ? 'warn' : 'default'} note={`${d.nearExpiry30} within 30 days`} href="/inventory" />
        <Stat icon={PackageX} label="Expired stock" value={d.expired} tone={d.expired ? 'bad' : 'default'} note="Blocked from sale" href="/expiry-returns" />
        <Stat icon={Users} label="Customer udhaar" value={money(d.customerOutstanding)} href="/udhaar" />
        {d.supplierPayables !== undefined && <Stat icon={Wallet} label="Supplier payables" value={money(d.supplierPayables)} />}
      </div>

      {owner && trend && (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.8fr_1fr]">
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-lg font-bold">Sales and profit</h2><p className="text-xs text-muted"><span className="mr-3 inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-pine" /> Net sales</span><span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-amber" /> Gross profit</span></p></div>
              <div className="flex gap-1">{[7, 14, 30].map((n) => <button key={n} onClick={() => setSpan(n)} className={`rounded-full border px-4 py-1 text-sm ${span === n ? 'brand-gradient border-transparent font-semibold text-white shadow' : 'border-line text-muted hover:bg-mint'}`}>{n} days</button>)}</div>
            </div>
            <SalesChart days={trend.days} />
          </Card>
          <Card className="p-4">
            <h2 className="mb-4 text-lg font-bold">Best sellers (30 days)</h2>
            {trend.topMedicines.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : <BarList rows={trend.topMedicines.map((t) => ({ label: t.name, value: t.revenue, note: `${t.units.toLocaleString()} units sold, profit ${money(t.profit)}` }))} />}
          </Card>
        </div>
      )}

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-lg font-bold">Recent transactions</h2><Link href="/sales" className="text-sm text-pine hover:underline">All sales</Link></div>
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
