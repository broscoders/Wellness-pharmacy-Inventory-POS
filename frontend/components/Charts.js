'use client';
import { money } from '@/lib/format';

// "nice" upper limit for an axis: 1, 2, 2.5, 5 x 10^n
function niceMax(v) {
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}
const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

/** Bars = net sales per day, line = gross profit per day. days: [{day:'2026-10-09', sales, profit, invoices}] */
export function SalesChart({ days }) {
  const W = 720; const H = 250; const pl = 46; const pr = 10; const pt = 14; const pb = 30;
  const maxV = niceMax(Math.max(...days.map((d) => Math.max(d.sales, d.profit)), 1));
  const iw = W - pl - pr; const ih = H - pt - pb;
  const step = iw / days.length; const bw = Math.min(step * 0.62, 34);
  const y = (v) => pt + ih - (Math.max(v, 0) / maxV) * ih;
  const x = (i) => pl + step * i + step / 2;
  const every = days.length > 20 ? 4 : days.length > 10 ? 2 : 1;
  const line = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.profit).toFixed(1)}`).join(' ');
  const label = (d) => { const dt = new Date(`${d}T00:00:00Z`); return `${dt.getUTCDate()} ${dt.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Net sales and gross profit per day">
      <defs><linearGradient id="barG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#0d9373" stopOpacity="0.55" /></linearGradient><linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity="0.28" /><stop offset="100%" stopColor="#f59e0b" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((t) => {
        const v = (maxV / 4) * t;
        return <g key={t}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 4" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{short(v)}</text></g>;
      })}
      {days.map((d, i) => (
        <g key={d.day}>
          <rect x={x(i) - bw / 2} y={y(d.sales)} width={bw} height={Math.max(ih - (y(d.sales) - pt), 0)} rx="6" fill="url(#barG)">
            <title>{`${label(d.day)}: sales ${money(d.sales)}, profit ${money(d.profit)}, ${d.invoices} invoices`}</title>
          </rect>
          {i % every === 0 && <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{label(d.day)}</text>}
        </g>
      ))}
      <path d={`${line} L${x(days.length - 1).toFixed(1)},${pt + ih} L${x(0).toFixed(1)},${pt + ih} Z`} fill="url(#areaG)" />
      <path d={line} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {days.map((d, i) => <circle key={d.day} cx={x(i)} cy={y(d.profit)} r="3.2" fill="#fff" stroke="#f59e0b" strokeWidth="2"><title>{`${label(d.day)} profit ${money(d.profit)}`}</title></circle>)}
    </svg>
  );
}

/** Horizontal bars: rows = [{label, value, note}] */
export function BarList({ rows, format = money }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate font-medium">{r.label}</span><span className="num shrink-0">{format(r.value)}</span></div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-mint"><div className="brand-gradient h-full rounded-full" style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }} /></div>
          {r.note && <p className="mt-0.5 text-xs text-muted">{r.note}</p>}
        </li>
      ))}
    </ul>
  );
}
