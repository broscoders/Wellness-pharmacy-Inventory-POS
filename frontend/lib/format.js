export const money = (n) => {
  const v = Number(n || 0);
  const digits = Number.isInteger(v) ? 0 : 2; // whole rupees stay clean, fractions always show 2 decimals
  return `Rs ${v.toLocaleString('en-PK', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
};

export const dateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

export const dateOnly = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// {box:2, strip:3, unit:5} -> "2 box, 3 strip, 5 unit"
export function stockText(d) {
  if (!d) return '0';
  const parts = [];
  if (d.box) parts.push(`${d.box} box`);
  if (d.strip) parts.push(`${d.strip} strip`);
  if (d.unit) parts.push(`${d.unit} unit`);
  return parts.length ? parts.join(', ') : '0';
}
