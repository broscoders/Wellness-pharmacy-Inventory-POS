'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileUp } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { mapRows, parseCsv, TEMPLATE_COLUMNS, TEMPLATE_SAMPLE } from '@/lib/importCsv';
import { Badge, Button, Card, ErrorNote, PageHeader, Table } from '@/components/ui';

const TONE = { create: 'good', update: 'warn', skip: 'neutral', error: 'bad' };
const LABEL = { create: 'Will add', update: 'Will update', skip: 'Skipped', error: 'Problem' };

export default function ImportPage() {
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null); // { name, records, recognised, ignored }
  const [update, setUpdate] = useState(false);
  const [check, setCheck] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const template = () => downloadCsv('medicines-import-template.csv', TEMPLATE_COLUMNS.map((k) => ({ key: k, label: k })), TEMPLATE_SAMPLE);

  async function onFile(e) {
    const file = e.target.files?.[0];
    setCheck(null); setResult(null); setErr(''); setParsed(null);
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The file has no data rows. Use the template: first row = column names, then one medicine per row.');
      const m = mapRows(rows);
      if (!m.recognised.includes('name')) throw new Error('No "name" column found. The first row must contain column names like name, barcode, salePriceStrip... Download the template to see them.');
      if (m.records.length > 1500) throw new Error(`The file has ${m.records.length} rows. Maximum is 1500 per import - split the file into parts.`);
      setParsed({ file: file.name, ...m });
    } catch (ex) { setErr(ex.message); }
  }

  async function run(dryRun) {
    setBusy(true); setErr('');
    try {
      const r = await api('/medicines/import', { method: 'POST', body: { rows: parsed.records, dryRun, updateExisting: update } });
      if (dryRun) setCheck(r); else { setResult(r); setCheck(null); }
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  const s = (result || check)?.summary;
  const canImport = check && check.summary.create + check.summary.update > 0;

  return (
    <>
      <PageHeader title="Import medicines from a file" subtitle="Move your register / old software data in one go (opening stock included)"
        actions={<Link href="/medicines" className="inline-flex items-center gap-1 text-sm text-pine hover:underline"><ArrowLeft className="h-4 w-4" /> Back to medicines</Link>} />

      <Card className="mb-4 p-5">
        <h2 className="mb-2 font-semibold">1. Get the file ready</h2>
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Download the template and open it in Excel. Delete the 2 sample rows and type or paste your medicines (one per row).</li>
          <li>Only <b className="text-ink">name</b> is compulsory. Prices are per box / strip / unit; stock is entered as opening boxes, strips and units.</li>
          <li>If you give opening stock you must also give <b className="text-ink">batchNumber</b> and <b className="text-ink">expiry</b> (like 2028-06 or 2028-06-30).</li>
          <li>Save as <b className="text-ink">CSV</b> (Excel: File, Save As, CSV UTF-8) and choose it below. Categories and suppliers you mention are created automatically.</li>
        </ol>
        <Button variant="secondary" onClick={template}><Download className="h-4 w-4" /> Download template (CSV)</Button>
      </Card>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 font-semibold">2. Choose the file and check it</h2>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full max-w-md text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2" />
        <ErrorNote error={err} />
        {parsed && (
          <div className="mt-4 space-y-3">
            <p className="text-sm"><b>{parsed.file}</b>: {parsed.records.length} rows found. Columns used: {parsed.recognised.join(', ')}.</p>
            {parsed.ignored.length > 0 && <p className="text-sm text-amber">Columns not recognised and ignored: {parsed.ignored.join(', ')}</p>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={update} onChange={(e) => { setUpdate(e.target.checked); setCheck(null); }} /> Also update medicines that already exist (same barcode or name). Otherwise they are skipped.</label>
            <Button onClick={() => run(true)} loading={busy && !check} disabled={busy}><FileUp className="h-4 w-4" /> Check file (nothing is saved yet)</Button>
          </div>
        )}
      </Card>

      {s && (
        <Card className="mb-4 p-5">
          <h2 className="mb-3 font-semibold">{result ? 'Import finished' : '3. Check the result, then import'}</h2>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            {[['create', result ? 'Added' : 'To add'], ['update', result ? 'Updated' : 'To update'], ['skip', 'Skipped (already there)'], ['errors', 'Rows with problems']].map(([k, l]) => (
              <div key={k} className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">{l}</p><p className={`num text-xl font-semibold ${k === 'errors' && s.errors ? 'text-danger' : ''}`}>{s[k]}</p></div>
            ))}
          </div>
          {s.stockBatches > 0 && <p className="mb-3 text-sm text-muted">{s.stockBatches} opening stock batch(es) {result ? 'created' : 'will be created'}.</p>}
          {(result || check).rows.length > 0 && (
            <Table head={['Row in file', 'Medicine', 'Result', 'Details']}>
              {(result || check).rows.map((r) => (
                <tr key={r.row}>
                  <td className="num px-3 py-2">{r.row}</td><td className="px-3 py-2 font-medium">{r.name || '-'}</td>
                  <td className="px-3 py-2"><Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge></td>
                  <td className="px-3 py-2 text-sm">{[...r.messages, ...r.warnings.map((w) => `Note: ${w}`)].join('. ')}</td>
                </tr>
              ))}
            </Table>
          )}
          {check && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => run(false)} loading={busy} disabled={!canImport}>Import {check.summary.create + check.summary.update} medicine(s) now</Button>
              {check.summary.errors > 0 && <span className="text-sm text-amber">{check.summary.errors} row(s) with problems will be skipped. Fix them in the file and import again if you want them too (medicines already added are skipped, so it is safe).</span>}
            </div>
          )}
          {result && <div className="mt-4"><Link href="/medicines" className="font-medium text-pine hover:underline">Go to the medicines list</Link></div>}
        </Card>
      )}
    </>
  );
}
