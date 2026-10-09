'use client';
import { useState } from 'react';
import { api, setAccessToken } from '@/lib/api';
import { Button, ErrorNote, Field, Input, Modal } from '@/components/ui';

export default function ChangePassword({ onClose }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const mismatch = f.confirm && f.newPassword !== f.confirm;
  const ok = f.currentPassword && f.newPassword.length >= 8 && f.newPassword === f.confirm;

  async function save() {
    setBusy(true); setErr('');
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      if (r.accessToken) setAccessToken(r.accessToken); // other devices are signed out, this one stays signed in
      setDone(true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Change password"
      footer={done ? <Button onClick={onClose}>Close</Button> : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!ok}>Change password</Button></>}>
      {done ? <p className="rounded-md bg-mint p-3 text-pine-dark">Password changed. Any other device where you were signed in has been signed out.</p> : (
        <div className="space-y-3">
          <ErrorNote error={err} />
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={f.currentPassword} onChange={set('currentPassword')} /></Field>
          <Field label="New password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" value={f.newPassword} onChange={set('newPassword')} /></Field>
          <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></Field>
          {mismatch && <p className="text-sm text-danger">The two passwords do not match.</p>}
        </div>
      )}
    </Modal>
  );
}
