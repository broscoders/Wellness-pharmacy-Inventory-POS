'use client';
import { useEffect, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Field, Input } from '@/components/ui';

export default function CustomerPicker({ customer, onChange, label = 'Customer (optional)', showBalance = true }) {
  const [term, setTerm] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!term.trim()) { setList([]); return undefined; }
    const t = setTimeout(() => api('/customers', { params: { search: term.trim(), active: 'true', limit: 6 } }).then((r) => setList(r.data)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [term]);

  if (customer) {
    return (
      <div className="flex items-center justify-between rounded-md bg-mint px-3 py-2">
        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-pine-dark" /><div><p className="font-medium">{customer.name}</p>{showBalance && <p className="num text-xs text-muted">Owes {money(customer.balance)}{customer.creditLimit ? ` | limit ${money(customer.creditLimit)}` : ''}</p>}</div></div>
        <button type="button" onClick={() => onChange(null)} aria-label="Remove customer"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <Field label={label}>
      <div className="relative">
        <Input placeholder="Search name or phone" value={term} onChange={(e) => setTerm(e.target.value)} />
        {list.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full rounded-md border border-line bg-white shadow-lg">
            {list.map((c) => <li key={c._id}><button type="button" className="flex w-full justify-between px-3 py-2 text-left hover:bg-mint" onClick={() => { onChange(c); setTerm(''); setList([]); }}><span>{c.name}</span><span className="text-xs text-muted">{c.phone}</span></button></li>)}
          </ul>
        )}
      </div>
    </Field>
  );
}
