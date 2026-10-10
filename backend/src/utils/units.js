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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const endOfMonth = (y, m) => new Date(Date.UTC(y, m, 0, 23, 59, 59)); // m is 1-12; day 0 of next month = last day
const validDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Expiry as printed on packs / written in registers. Month-only values mean the LAST day of that month.
 * Accepted: 2028-06-30, 2028-06, 30/06/2028, 30-06-2028 (day first), 06/2028, 06-2028, Jun 2028, JUN-2028.
 * Returns null when it is not a real date.
 */
function parseExpiry(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value ?? '').trim();
  let m;
  const full = (y, mo, d) => (y >= 2000 && y <= 2100 && validDay(y, mo, d) ? new Date(Date.UTC(y, mo - 1, d, 23, 59, 59)) : null);
  const month = (y, mo) => (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 ? endOfMonth(y, mo) : null);
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s))) return full(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) return month(+m[1], +m[2]);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) return full(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{1,2})[/.-](\d{4})$/.exec(s))) return month(+m[2], +m[1]);
  if ((m = /^([A-Za-z]{3,9})[\s/.-]+(\d{4})$/.exec(s))) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return idx >= 0 ? month(+m[2], idx + 1) : null;
  }
  return null;
}

module.exports = { unitsPerBox, toBase, fromBase, unitPrice, parseExpiry };
