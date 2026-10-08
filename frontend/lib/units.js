// Mirrors backend/src/utils/units.js (the server is always the final authority on prices and stock).
export const unitsPerBox = (m) => (m.stripsPerBox || 1) * (m.unitsPerStrip || 1);
export const baseQtyOfType = (m, t) => (t === 'box' ? unitsPerBox(m) : t === 'strip' ? m.unitsPerStrip || 1 : 1);

const hasPrice = (p = {}) => (p.box || 0) + (p.strip || 0) + (p.unit || 0) > 0;

export function pricePerBase(prices = {}, m, type) {
  if (prices[type] > 0) return prices[type] / baseQtyOfType(m, type);
  if (prices.unit > 0) return prices.unit;
  if (prices.strip > 0) return prices.strip / (m.unitsPerStrip || 1);
  if (prices.box > 0) return prices.box / unitsPerBox(m);
  return 0;
}

export function sellPrice(m, saleType, unitType) {
  const list = saleType === 'wholesale' && hasPrice(m.wholesalePrice) ? m.wholesalePrice : m.salePrice;
  return pricePerBase(list, m, unitType) * baseQtyOfType(m, unitType); // price of ONE box/strip/unit
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
