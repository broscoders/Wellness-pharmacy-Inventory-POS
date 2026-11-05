'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { homeFor } from '@/lib/access';

export default function LoginPage() {
  const { user, loading, login, can } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) router.replace(homeFor(can)); }, [user, loading, router, can]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(email, password);
      router.replace(homeFor((p) => !!u.permissions?.includes(p)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="sidebar-dark relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-300/10 blur-3xl" />
        <div className="relative flex items-center gap-3 text-xl font-bold text-white"><span className="brand-gradient flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg shadow-black/30"><Pill className="h-6 w-6" /></span> Wellness Pharmacy</div>
        <div className="relative">
          <h1 className="max-w-lg text-5xl font-extrabold leading-[1.1] tracking-tight text-white">Every batch, every expiry, <span className="text-gradient">every rupee of udhaar</span> - in one place.</h1>
          <p className="mt-5 max-w-md text-lg text-emerald-50/75">Billing at the counter, stock by batch, supplier payables and customer credit, with expired medicine blocked automatically.</p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
            {[['FEFO', 'Batch & expiry'], ['POS', 'Fast billing'], ['Udhaar', 'Credit ledger']].map(([t, d]) => (
              <div key={t} className="glass floaty rounded-2xl p-4 text-white"><p className="text-lg font-bold">{t}</p><p className="text-xs text-emerald-100/70">{d}</p></div>
            ))}
          </div>
        </div>
        <p className="relative text-sm text-emerald-100/60">Built by Bro&apos;s Code</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="card-premium w-full max-w-sm space-y-5 rounded-3xl border border-line bg-white p-8">
          <div>
            <span className="brand-gradient mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg shadow-pine/30 lg:hidden"><Pill className="h-6 w-6" /></span>
            <h2 className="text-3xl font-extrabold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted">Sign in with the account given to you by the pharmacy owner.</p>
          </div>
          <ErrorNote error={error} />
          <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@pharmacy.com" /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in</Button>
        </form>
      </section>
    </main>
  );
}
