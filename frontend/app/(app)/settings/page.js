'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import Receipt from '@/components/Receipt';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Textarea } from '@/components/ui';

// Example bill so the owner can see how the receipt header/footer will look.
const SAMPLE = {
  invoiceNo: 'INV-000123', type: 'retail', createdAt: new Date().toISOString(), createdByName: 'Cashier', customerName: '',
  items: [{ line: 0, name: 'Panadol 500mg', unitType: 'strip', cartQty: 2, batchNumber: 'B1', lineTotal: 50 }, { line: 1, name: 'Calpol 60ml', unitType: 'unit', cartQty: 1, batchNumber: 'C7', lineTotal: 95 }],
  subtotal: 145, discount: 0, total: 145, payments: [{ method: 'cash', amount: 150 }], changeGiven: 5, creditAmount: 0,
};

export default function SettingsPage() {
  const { settings, refresh } = useSettings();
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setF((cur) => cur || { ...settings }); }, [settings]);
  if (!f) return null;
  const set = (k) => (e) => { setSaved(false); setF({ ...f, [k]: e.target.value }); };

  async function save() {
    setBusy(true); setErr(''); setSaved(false);
    try {
      const { shopName, tagline, address, phone, email, licenseNo, ntn, receiptFooter } = f;
      await api('/settings', { method: 'PUT', body: { shopName, tagline, address, phone, email, licenseNo, ntn, receiptFooter } });
      await refresh(); setSaved(true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Shop settings" subtitle="This information is printed on every receipt" actions={<Button onClick={save} loading={busy}>Save settings</Button>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <ErrorNote error={err} />
          {saved && <p className="mb-3 rounded-md bg-mint px-3 py-2 text-pine-dark">Saved. New receipts will use these details.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shop name *"><Input value={f.shopName} onChange={set('shopName')} /></Field>
            <Field label="Tagline" hint="e.g. Your family pharmacy"><Input value={f.tagline} onChange={set('tagline')} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><Input value={f.address} onChange={set('address')} placeholder="Shop #, street, area, city" /></Field></div>
            <Field label="Phone / WhatsApp"><Input value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><Input value={f.email} onChange={set('email')} /></Field>
            <Field label="Drug sale license no."><Input value={f.licenseNo} onChange={set('licenseNo')} /></Field>
            <Field label="NTN"><Input value={f.ntn} onChange={set('ntn')} /></Field>
            <div className="sm:col-span-2"><Field label="Receipt footer message"><Textarea value={f.receiptFooter} onChange={set('receiptFooter')} /></Field></div>
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-muted">Receipt preview (updates after you save)</p>
          <div className="rounded-md border border-dashed border-line bg-white p-3"><Receipt sale={SAMPLE} /></div>
        </Card>
      </div>
    </>
  );
}
