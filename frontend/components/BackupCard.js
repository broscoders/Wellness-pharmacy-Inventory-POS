'use client';
import { useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { buildBackup, markBackupDone, saveBundle } from '@/lib/backup';
import { dateTime } from '@/lib/format';
import { Button, Card, ErrorNote } from '@/components/ui';

// Owner-only. Downloads the whole database as one file to keep on a USB drive or cloud drive.
export default function BackupCard() {
  const { settings, refresh } = useSettings();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const age = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000) : null;

  async function run() {
    setBusy(true); setErr(''); setOk('');
    try {
      const bundle = await buildBackup(setProgress);
      saveBundle(bundle);
      await markBackupDone(); refresh();
      const n = Object.values(bundle.manifest.collections).reduce((s, x) => s + x, 0);
      setOk(`Backup saved: ${n.toLocaleString()} records in ${Object.keys(bundle.collections).length} groups. Copy the file somewhere safe (USB / cloud drive).`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); setProgress(null); }
  }

  return (
    <Card className="mb-5 max-w-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">Backup</p>
          <p className={`mt-1 text-sm ${age === null || age > 7 ? 'text-danger' : 'text-muted'}`}>{settings.lastBackupAt ? `Last backup downloaded ${dateTime(settings.lastBackupAt)} (${age} day${age === 1 ? '' : 's'} ago).` : 'No backup has been downloaded yet.'}</p>
          <p className="mt-1 text-xs text-muted">Downloads everything (medicines, stock, sales, customers, suppliers, staff accounts) as one file. Keep it private: it contains staff password hashes. Do this at least once a week, and before any big change.</p>
        </div>
        <Button onClick={run} loading={busy}><DatabaseBackup className="h-4 w-4" /> Download backup</Button>
      </div>
      {progress && <p className="mt-3 text-sm text-muted">Reading {progress.name} ({progress.index + 1} of {progress.total})...</p>}
      <ErrorNote error={err} />
      {ok && <p className="mt-3 rounded-md bg-mint px-3 py-2 text-sm text-pine-dark">{ok}</p>}
    </Card>
  );
}
