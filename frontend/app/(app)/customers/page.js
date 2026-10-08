'use client';
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import ResourcePage, { ActiveBadge } from '@/components/ResourcePage';
import LedgerModal from '@/components/LedgerModal';
import { Badge, Button } from '@/components/ui';
import { money } from '@/lib/format';

const fields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone' },
  { key: 'type', label: 'Customer type', type: 'select', options: [{ value: 'retail', label: 'Retail' }, { value: 'wholesale', label: 'Wholesale' }] },
  { key: 'creditLimit', label: 'Udhaar limit', type: 'number', hint: '0 = no limit' },
  { key: 'address', label: 'Address', wide: true },
  { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
];

export default function CustomersPage() {
  const [ledger, setLedger] = useState(null);
  const [tick, setTick] = useState(0);
  return (
    <>
      <ResourcePage key={tick} title="Customers" subtitle="Customer records and udhaar (credit) balances" endpoint="/customers" manage="customers:manage" noun="customer" newLabel="Add customer"
        searchPlaceholder="Search name or phone..." archivable fields={fields} defaults={{ type: 'retail', creditLimit: 0 }}
        columns={[
          { label: 'Customer', render: (c) => <><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.phone || '-'}</p></> },
          { label: 'Type', render: (c) => <span className="capitalize">{c.type}</span> },
          { label: 'Udhaar balance', right: true, render: (c) => (c.balance > 0 ? <span className="font-medium text-amber">{money(c.balance)}</span> : money(0)) },
          { label: 'Limit', right: true, render: (c) => (c.creditLimit ? money(c.creditLimit) : <Badge>No limit</Badge>) },
          { label: 'Status', render: (c) => <ActiveBadge row={c} /> },
        ]}
        rowActions={(c) => <Button variant="ghost" size="sm" onClick={() => setLedger(c._id)}><BookOpen className="h-4 w-4" /> Ledger</Button>} />
      {ledger && <LedgerModal kind="customers" id={ledger} onClose={() => setLedger(null)} onChanged={() => setTick((t) => t + 1)} />}
    </>
  );
}
