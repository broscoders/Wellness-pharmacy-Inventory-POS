'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';

// Ctrl+K / Cmd+K: jump to any screen by typing a few letters.
export default function CommandPalette({ open, onClose, items }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => !t || i.label.toLowerCase().includes(t) || i.group.toLowerCase().includes(t)).slice(0, 12);
  }, [q, items]);
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => ref.current?.focus(), 10); } }, [open]);
  useEffect(() => setIdx(0), [q]);
  if (!open) return null;
  const go = (i) => { if (!i) return; onClose(); router.push(i.href); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((n) => Math.min(n + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((n) => Math.max(n - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(list[idx]); }
  };
  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center bg-ink/50 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" role="dialog" aria-label="Quick search">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-5 w-5 text-muted" />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Jump to... (POS, Medicines, Reports)" className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted/70" />
          <kbd className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {list.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches &ldquo;{q}&rdquo;</li>}
          {list.map((i, n) => (
            <li key={i.href}>
              <button onMouseEnter={() => setIdx(n)} onClick={() => go(i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${n === idx ? 'bg-mint text-pine-dark' : ''}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${n === idx ? 'brand-gradient text-white' : 'bg-paper text-muted'}`}><i.icon className="h-[18px] w-[18px]" /></span>
                <span className="flex-1 font-medium">{i.label}</span>
                <span className="text-xs text-muted">{i.group}</span>
                {n === idx && <CornerDownLeft className="h-4 w-4 text-pine" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
