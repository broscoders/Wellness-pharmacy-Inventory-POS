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
      {[0, 1, 2, 3, 4].map((t) => {
        const v = (maxV / 4) * t;
        return <g key={t}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{short(v)}</text></g>;
      })}
      {days.map((d, i) => (
        <g key={d.day}>
          <rect x={x(i) - bw / 2} y={y(d.sales)} width={bw} height={Math.max(ih - (y(d.sales) - pt), 0)} rx="3" fill="var(--color-pine)" opacity="0.88">
            <title>{`${label(d.day)}: sales ${money(d.sales)}, profit ${money(d.profit)}, ${d.invoices} invoices`}</title>
          </rect>
          {i % every === 0 && <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{label(d.day)}</text>}
        </g>
      ))}
      <path d={line} fill="none" stroke="var(--color-amber)" strokeWidth="2" strokeLinejoin="round" />
      {days.map((d, i) => <circle key={d.day} cx={x(i)} cy={y(d.profit)} r="2.6" fill="var(--color-amber)"><title>{`${label(d.day)} profit ${money(d.profit)}`}</title></circle>)}
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
          <div className="mt-1 h-2 overflow-hidden rounded bg-mint"><div className="h-full rounded bg-pine" style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }} /></div>
          {r.note && <p className="mt-0.5 text-xs text-muted">{r.note}</p>}
        </li>
      ))}
    </ul>
  );
}
