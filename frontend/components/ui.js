'use client';
import { X, Loader2 } from 'lucide-react';

export function Button({ variant = 'primary', size = 'md', className = '', loading, children, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-pine/40';
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4', lg: 'h-12 px-6 text-base' };
  const variants = {
    primary: 'brand-gradient text-white shadow-md shadow-pine/25 hover:brightness-110 hover:shadow-lg',
    secondary: 'bg-white text-ink border border-line hover:bg-mint',
    danger: 'bg-danger text-white hover:opacity-90',
    ghost: 'text-muted hover:bg-mint hover:text-ink',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={props.disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// Default size/padding only apply when the caller did not pass their own, so classes never fight each other.
const has = (c, re) => new RegExp(`(^|\\s)(${re})`).test(c);
function fieldClass(className = '', extra = '') {
  const base = 'rounded-xl border border-line bg-white text-ink shadow-sm shadow-black/[.02] placeholder:text-muted/70 transition focus:outline-none focus:border-pine focus:ring-4 focus:ring-pine/15';
  const w = has(className, 'w-') ? '' : 'w-full';
  const h = has(className, 'h-') || extra ? '' : 'h-10';
  const pad = has(className, 'px-') ? '' : has(className, 'pl-') ? 'pr-3' : 'px-3';
  return `${base} ${w} ${h} ${pad} ${extra} ${className}`;
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = ({ className = '', ...p }) => <input className={fieldClass(className)} {...p} />;
export const Select = ({ className = '', children, ...p }) => <select className={fieldClass(className)} {...p}>{children}</select>;
export const Textarea = ({ className = '', ...p }) => <textarea className={fieldClass(className, 'py-2')} rows={3} {...p} />;

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-paper text-muted border-line',
    good: 'bg-mint text-pine-dark border-pine/20',
    warn: 'bg-amber-soft text-amber border-amber/30',
    bad: 'bg-danger-soft text-danger border-danger/20',
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Card({ className = '', children }) {
  return <div className={`rounded-2xl border border-line bg-card card-premium ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        <span className="brand-gradient mt-1.5 block h-1 w-10 rounded-full" />
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg', footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/50 backdrop-blur-sm p-4 pt-[4vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* the window never taller than the screen: the middle scrolls, the title and the buttons stay in view */}
      <div className={`flex max-h-[calc(100dvh-2rem)] w-full ${width} flex-col rounded-2xl bg-white shadow-2xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="no-print flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-mint" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="no-print flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading...' }) {
  return <div className="mx-auto max-w-5xl space-y-3 py-6" role="status" aria-label={label}><div className="skeleton h-24" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /></div><div className="skeleton h-64" /><span className="sr-only">{label}</span></div>;
}

export function Empty({ children }) {
  return <div className="py-12 text-center text-muted">{children}</div>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="mb-3 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</div>;
}

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-3 font-semibold ${h.right ? 'text-right' : ''}`}>{h.label ?? h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
