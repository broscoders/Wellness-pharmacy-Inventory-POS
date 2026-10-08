'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { stockText } from '@/lib/format';
import { Input } from '@/components/ui';

// Type to search, click a result: onPick(medicine)
export default function MedicineSearch({ onPick, placeholder = 'Search medicine...', autoFocus }) {
  const [term, setTerm] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!term.trim()) { setList([]); return undefined; }
    const t = setTimeout(() => api('/medicines', { params: { search: term.trim(), active: 'true', limit: 8 } }).then((r) => setList(r.data)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [term]);
  return (
    <div className="relative">
      <Input autoFocus={autoFocus} placeholder={placeholder} value={term} onChange={(e) => setTerm(e.target.value)} />
      {list.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-line bg-white shadow-lg">
          {list.map((m) => (
            <li key={m._id}><button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-mint" onClick={() => { onPick(m); setTerm(''); setList([]); }}>
              <span><span className="font-medium">{m.name}</span> <span className="text-xs text-muted">{m.genericName}</span></span><span className="text-xs text-muted">{stockText(m.stock.display)}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
