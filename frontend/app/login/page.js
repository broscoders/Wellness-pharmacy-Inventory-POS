'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button, ErrorNote, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) router.replace('/dashboard'); }, [user, loading, router]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden bg-pine-dark p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold"><Pill className="h-6 w-6" /> Wellness Pharmacy</div>
        <div>
          <h1 className="max-w-md text-3xl font-semibold leading-tight">Every batch, every expiry, every rupee of udhaar - in one place.</h1>
          <p className="mt-4 max-w-md text-white/75">Billing at the counter, stock by batch, supplier payables and customer credit, with expired medicine blocked automatically.</p>
        </div>
        <p className="text-sm text-white/60">Built by Bro&apos;s Code</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Use the account given to you by the pharmacy owner.</p>
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
