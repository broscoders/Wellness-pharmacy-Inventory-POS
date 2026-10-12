'use client';
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { dateOnly, money, stockText } from '@/lib/format';
import { waLink, returnMessage } from '@/lib/whatsapp';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Select, Spinner, Table } from '@/components/ui';
import PrintDoc from '@/components/PrintDoc';

export default function ExpiryReturnsPage() {
  const { settings } = useSettings();
  const [days, setDays] = useState(90);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(null);
  const load = useCallback(async () => { try { setD(await api('/ops/expiry-plan', { params: { days } })); setError(''); } catch (e) { setError(e.message); } }, [days]);
  useEffect(() => { setD(null); load(); }, [load]);

  const toSend = (g) => g.lines.filter((l) => l.status === 'expired' || l.unlikelyToSell);
  const print = (g) => { setPrinting(g); setTimeout(() => window.print(), 150); };

  return (
    <>
      <PageHeader title="Expiry returns" subtitle="Expired stock and stock that will not sell in time, grouped by supplier so you can send it back before it becomes a loss"
        actions={<Select className="w-44" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Look ahead">{[30, 60, 90, 180].map((n) => <option key={n} value={n}>Expiring within {n} days</option>)}</Select>} />
      <ErrorNote error={error} />
      {!d ? <Spinner /> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-muted">Already expired (cost)</p><p className="num mt-1 text-2xl font-semibold text-danger">{money(d.totals.expiredValue)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Will probably NOT sell in time (cost)</p><p className="num mt-1 text-2xl font-semibold text-amber">{money(d.totals.atRiskValue)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">All stock expiring in {d.days} days (cost)</p><p className="num mt-1 text-2xl font-semibold">{money(d.totals.expiringValue)}</p></Card>
          </div>
          {d.groups.length === 0 ? <Card><Empty>Nothing is expired or expiring within {d.days} days.</Empty></Card> : d.groups.map((g) => {
            const send = toSend(g);
            const msg = returnMessage({ shop: settings.shopName, supplier: g.supplier?.name || 'Sir', lines: send.map((l) => ({ name: l.name, batchNumber: l.batchNumber, expiry: dateOnly(l.expiryDate), qty: stockText(l.display) })) });
            return (
              <Card key={g.supplier?._id || 'none'} className="mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <div><p className="font-semibold">{g.supplier ? g.supplier.name : 'No supplier set on these medicines'}</p><p className="num text-xs text-muted">Expired {money(g.expiredValue)} | At risk {money(g.atRiskValue)}</p></div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={!send.length} onClick={() => print(g)}><Printer className="h-4 w-4" /> Print return list</Button>
                    {g.supplier && <a href={waLink(g.supplier.phone, msg)} target="_blank" rel="noreferrer" className={send.length ? '' : 'pointer-events-none opacity-50'}><Button variant="secondary" size="sm"><MessageCircle className="h-4 w-4" /> WhatsApp</Button></a>}
                  </div>
                </div>
                <Table head={['Medicine', 'Batch', 'Expiry', { label: 'Quantity', right: true }, { label: 'Cost', right: true }, 'Will it sell in time?']}>
                  {g.lines.map((l) => (
                    <tr key={`${l.medicine}-${l.batchNumber}`}>
                      <td className="px-3 py-2 font-medium">{l.name}</td><td className="num px-3 py-2">{l.batchNumber}</td>
                      <td className="px-3 py-2"><span className="num mr-2">{dateOnly(l.expiryDate)}</span>{l.status === 'expired' ? <Badge tone="bad">Expired</Badge> : <Badge tone="warn">{l.daysLeft} days left</Badge>}</td>
                      <td className="num px-3 py-2 text-right">{stockText(l.display)}</td><td className="num px-3 py-2 text-right">{money(l.costValue)}</td>
                      <td className="px-3 py-2 text-xs">{l.status === 'expired' ? <span className="text-danger">Return / claim, do not sell</span> : l.unlikelyToSell ? <span className="font-medium text-amber">{l.daysToSellOut === null ? 'No sales in 30 days: return or discount' : `Needs ~${l.daysToSellOut} days to sell, only ${l.daysLeft} left`}</span> : <span className="text-pine-dark">Yes, about {l.daysToSellOut} days</span>}</td>
                    </tr>
                  ))}
                </Table>
              </Card>
            );
          })}
          <p className="text-xs text-muted">Estimates use the last 30 days of sales and sell the earliest expiry first. When the supplier accepts the return, record it in Purchases (Return) so stock and the supplier ledger are corrected.</p>
        </>
      )}
      {printing && (
        <PrintDoc title={`Return list: ${printing.supplier?.name || 'Supplier'}`} subtitle="Expired and slow-moving near-expiry stock">
          <table><thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Cost</th></tr></thead>
            <tbody>{toSend(printing).map((l, i) => <tr key={`${l.medicine}-${l.batchNumber}`}><td>{i + 1}</td><td>{l.name}</td><td>{l.batchNumber}</td><td>{dateOnly(l.expiryDate)}</td><td>{stockText(l.display)}</td><td>{money(l.costValue)}</td></tr>)}</tbody></table>
        </PrintDoc>
      )}
    </>
  );
}
