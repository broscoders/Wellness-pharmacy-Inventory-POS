'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Spinner, Table } from '@/components/ui';

export default function AuditPage() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => api('/audit', { params: { page, limit: 30, action } }).then((r) => { setRows(r.data); setMeta(r.meta); setError(''); }).catch((e) => setError(e.message)), 250);
    return () => clearTimeout(t);
  }, [page, action]);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what: stock adjustments, discounts, returns, cancellations, price changes" />
      <Card>
        <div className="border-b border-line p-3"><Input className="max-w-xs" placeholder="Filter by action, e.g. sale. or inventory." value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }} /></div>
        <ErrorNote error={error} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No entries.</Empty> : (
          <Table head={['When', 'User', 'Action', 'Details']}>
            {rows.map((a) => (
              <tr key={a._id}>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{dateTime(a.createdAt)}</td>
                <td className="px-3 py-2">{a.userName || '-'}</td>
                <td className="px-3 py-2"><Badge tone={/cancel|void|adjust|discount|return/.test(a.action) ? 'warn' : 'neutral'}>{a.action}</Badge></td>
                <td className="max-w-md truncate px-3 py-2 text-xs text-muted" title={JSON.stringify(a.details)}>{a.details ? JSON.stringify(a.details) : ''}</td>
              </tr>
            ))}
          </Table>
        )}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm"><span className="text-muted">Page {meta.page} of {meta.pages}</span>
            <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
        )}
      </Card>
    </>
  );
}
