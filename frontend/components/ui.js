'use client';
import { X, Loader2 } from 'lucide-react';

export function Button({ variant = 'primary', size = 'md', className = '', loading, children, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-pine/40';
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4', lg: 'h-12 px-6 text-base' };
  const variants = {
    primary: 'bg-pine text-white hover:bg-pine-dark',
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
  const base = 'rounded-md border border-line bg-white text-ink placeholder:text-muted/70 focus:outline-none focus:border-pine focus:ring-2 focus:ring-pine/20';
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
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Card({ className = '', children }) {
  return <div className={`rounded-lg border border-line bg-card ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg', footer }) {
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[6vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${width} rounded-lg bg-white shadow-xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-mint" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading...' }) {
  return <div className="flex items-center justify-center gap-2 py-12 text-muted"><Loader2 className="h-5 w-5 animate-spin" />{label}</div>;
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
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[13px] text-muted">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2 font-medium ${h.right ? 'text-right' : ''}`}>{h.label ?? h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
