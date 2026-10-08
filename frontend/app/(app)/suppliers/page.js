'use client';
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import ResourcePage, { ActiveBadge } from '@/components/ResourcePage';
import LedgerModal from '@/components/LedgerModal';
import { Button } from '@/components/ui';
import { money } from '@/lib/format';

const fields = [
  { key: 'name', label: 'Supplier / company name', required: true },
  { key: 'contactPerson', label: 'Contact person' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address', label: 'Address', wide: true },
  { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
];

export default function SuppliersPage() {
  const [ledger, setLedger] = useState(null);
  const [tick, setTick] = useState(0);
  return (
    <>
      <ResourcePage key={tick} title="Suppliers" subtitle="Wholesalers, payables and payments" endpoint="/suppliers" manage="suppliers:manage" noun="supplier" newLabel="Add supplier"
        searchPlaceholder="Search name, phone, contact..." archivable fields={fields}
        columns={[
          { label: 'Supplier', render: (s) => <><p className="font-medium">{s.name}</p><p className="text-xs text-muted">{s.contactPerson || ''}</p></> },
          { label: 'Phone', render: (s) => s.phone || '-' },
          { label: 'We owe', right: true, render: (s) => (s.balance > 0 ? <span className="font-medium text-amber">{money(s.balance)}</span> : money(0)) },
          { label: 'Status', render: (s) => <ActiveBadge row={s} /> },
        ]}
        rowActions={(s) => <Button variant="ghost" size="sm" onClick={() => setLedger(s._id)}><BookOpen className="h-4 w-4" /> Ledger / Pay</Button>} />
      {ledger && <LedgerModal kind="suppliers" id={ledger} onClose={() => setLedger(null)} onChanged={() => setTick((t) => t + 1)} />}
    </>
  );
}
