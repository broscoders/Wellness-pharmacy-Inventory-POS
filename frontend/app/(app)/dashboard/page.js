'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, PackageX, Users, Truck, TrendingUp, ShoppingBag, Boxes, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { money, dateTime } from '@/lib/format';
import { Badge, Card, ErrorNote, PageHeader, Spinner, Table } from '@/components/ui';

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
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard').then((r) => setD(r.data)).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote error={error} />;
  if (!d) return <Spinner />;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Today at a glance" />
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
