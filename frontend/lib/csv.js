// Download rows as a CSV file (opens in Excel). rows: array of objects, columns: [{key,label}]
export function downloadCsv(filename, columns, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  rows.forEach((r) => lines.push(columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(',')));
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
