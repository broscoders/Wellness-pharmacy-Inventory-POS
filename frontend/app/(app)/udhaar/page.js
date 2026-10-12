'use client';
import { useCallback, useEffect, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { dateOnly, money } from '@/lib/format';
import { udhaarMessage, waLink, waNumber } from '@/lib/whatsapp';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Select, Spinner, Table } from '@/components/ui';

export default function UdhaarRemindersPage() {
  const { settings } = useSettings();
  const [minDays, setMinDays] = useState(15);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const load = useCallback(async () => { try { setD(await api('/ops/udhaar-reminders', { params: { minDays } })); setError(''); } catch (e) { setError(e.message); } }, [minDays]);
  useEffect(() => { setD(null); load(); }, [load]);

  const msg = (r) => udhaarMessage({ name: r.name, balance: r.balance, shop: settings.shopName });
  async function sent(r) { try { await api(`/ops/udhaar-reminders/${r._id}/sent`, { method: 'POST' }); load(); } catch { /* the reminder still opened; only the "last reminded" note failed */ } }
  async function copy(r) { try { await navigator.clipboard.writeText(msg(r)); setCopied(r._id); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked */ } }

  return (
    <>
      <PageHeader title="Udhaar reminders" subtitle="Customers who owe money and have not paid for a while. One tap opens WhatsApp with the message ready: you just press Send."
        actions={<Select className="w-48" value={minDays} onChange={(e) => setMinDays(Number(e.target.value))} aria-label="Not paid for"><option value={7}>No payment for 7+ days</option><option value={15}>No payment for 15+ days</option><option value={30}>No payment for 30+ days</option><option value={60}>No payment for 60+ days</option></Select>} />
      <ErrorNote error={error} />
      {!d ? <Spinner /> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-muted">Customers to remind</p><p className="num mt-1 text-2xl font-semibold">{d.totals.customers}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Money waiting to be collected</p><p className="num mt-1 text-2xl font-semibold text-amber">{money(d.totals.amount)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Without a phone number</p><p className="num mt-1 text-2xl font-semibold">{d.totals.withoutPhone}</p></Card>
          </div>
          <Card>
            {d.data.length === 0 ? <Empty>Nobody has an overdue balance. </Empty> : (
              <Table head={['Customer', { label: 'Owes', right: true }, 'Last payment', { label: 'Days', right: true }, 'Last reminded', '']}>
                {d.data.map((r) => (
                  <tr key={r._id}>
                    <td className="px-3 py-2"><p className="font-medium">{r.name}</p><p className="num text-xs text-muted">{r.phone || 'No phone number'}</p></td>
                    <td className="num px-3 py-2 text-right font-semibold">{money(r.balance)}</td>
                    <td className="px-3 py-2 text-muted">{r.lastPaymentAt ? dateOnly(r.lastPaymentAt) : 'Never paid'}</td>
                    <td className={`num px-3 py-2 text-right ${r.daysSince >= 60 ? 'font-semibold text-danger' : r.daysSince >= 30 ? 'text-amber' : ''}`}>{r.daysSince}</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.lastReminderAt ? dateOnly(r.lastReminderAt) : <Badge>Not yet</Badge>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => copy(r)} title="Copy the message"><Copy className="h-4 w-4" /> {copied === r._id ? 'Copied' : 'Copy'}</Button>
                      <a href={waLink(r.phone, msg(r))} target="_blank" rel="noreferrer" onClick={() => sent(r)} className={waNumber(r.phone) ? '' : 'pointer-events-none opacity-40'} aria-disabled={!waNumber(r.phone)}><Button size="sm" disabled={!waNumber(r.phone)}><MessageCircle className="h-4 w-4" /> WhatsApp</Button></a>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <p className="mt-3 text-xs text-muted">Nothing is sent automatically. Days are counted from the last payment (or from when the udhaar began). Add or fix phone numbers on the Customers page. Local numbers like 0300-1234567 are converted to +92.</p>
        </>
      )}
    </>
  );
}
