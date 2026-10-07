// All stock is stored in the smallest unit ("base unit" = 1 tablet/piece).
// 1 box = stripsPerBox strips, 1 strip = unitsPerStrip units.

function unitsPerBox(med) {
  return (med.stripsPerBox || 1) * (med.unitsPerStrip || 1);
}

// {box, strip, unit} -> total base units
function toBase(med, { box = 0, strip = 0, unit = 0 } = {}) {
  return Math.round(box * unitsPerBox(med) + strip * (med.unitsPerStrip || 1) + unit);
}

// total base units -> {box, strip, unit} for display, e.g. 235 => 2 boxes, 3 strips, 5 units
function fromBase(med, total) {
  const upb = unitsPerBox(med);
  const ups = med.unitsPerStrip || 1;
  const box = Math.floor(total / upb);
  const rem = total - box * upb;
  const strip = Math.floor(rem / ups);
  const unit = rem - strip * ups;
  return { box, strip, unit };
}

// Price for one base unit when selling in a given unit type.
function unitPrice(prices = {}, med, type) {
  if (prices[type] > 0) {
    if (type === 'box') return prices.box / unitsPerBox(med);
    if (type === 'strip') return prices.strip / (med.unitsPerStrip || 1);
    return prices.unit;
  }
  // derive from any other defined price
  if (prices.unit > 0) return prices.unit;
  if (prices.strip > 0) return prices.strip / (med.unitsPerStrip || 1);
  if (prices.box > 0) return prices.box / unitsPerBox(med);
  return 0;
}

// Accepts "YYYY-MM-DD" or "YYYY-MM" (month-only means the last day of that month, as printed on packs).
function parseExpiry(value) {
  if (value instanceof Date) return value;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2], 0, 23, 59, 59)); // day 0 of next month = last day
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(23, 59, 59, 0);
  return d;
}

module.exports = { unitsPerBox, toBase, fromBase, unitPrice, parseExpiry };
