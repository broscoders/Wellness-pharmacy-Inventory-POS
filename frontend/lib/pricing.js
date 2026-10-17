// Price formulas used by the medicine form. Pure functions, so they can be tested on their own.
//
// MARGIN here always means profit as a share of the SELLING price (the same as everywhere else in the app):
//   margin = (price - cost) / price      so a Rs 400 box sold at Rs 500 has a 20% margin.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const marginPct = (cost, price) => (cost > 0 && price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null);

// The strip and single-tablet price that follow from a box price.
export function derivedPrices(box, stripsPerBox, unitsPerStrip) {
  const b = Number(box) || 0;
  const strips = Math.max(1, Number(stripsPerBox) || 1);
  const per = Math.max(1, Number(unitsPerStrip) || 1);
  if (!(b > 0)) return { strip: 0, unit: 0 };
  return { strip: round2(b / strips), unit: round2(b / (strips * per)) };
}

// The box price that gives the wanted margin, rounded UP to a whole rupee and never above the MRP.
// Returns { price, cappedByMrp }.
export function priceFromMargin(cost, marginPercent, { mrp = 0 } = {}) {
  const c = Number(cost) || 0;
  const m = Number(marginPercent);
  if (!(c > 0) || !Number.isFinite(m) || m < 0 || m >= 100) return { price: 0, cappedByMrp: false };
  const raw = Math.ceil(c / (1 - m / 100) - 1e-9);
  const cap = Number(mrp) > 0 && raw > Number(mrp);
  return { price: cap ? Number(mrp) : raw, cappedByMrp: cap };
}

// "1 box = 10 strips = 100 tablets"
export function packText(stripsPerBox, unitsPerStrip) {
  const s = Math.max(1, Number(stripsPerBox) || 1);
  const u = Math.max(1, Number(unitsPerStrip) || 1);
  if (s === 1 && u === 1) return '1 box = 1 piece';
  if (u === 1) return `1 box = ${s} pieces`;
  if (s === 1) return `1 box = ${u} pieces`;
  return `1 box = ${s} strips = ${s * u} tablets`;
}
