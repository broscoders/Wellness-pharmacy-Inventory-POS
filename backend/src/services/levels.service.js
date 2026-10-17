const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const { fromBase } = require('../utils/units');

// Reorder levels worked out from what a medicine really sells:
//   minimum = what sells in LEAD_DAYS (the time it takes to get new stock)
//   maximum = what sells in COVER_DAYS (do not hold more than a month of it)
// both rounded UP to whole strips, and the maximum is always at least one strip above the minimum.
const WINDOW_DAYS = 60; // how far back the selling speed is measured
const LEAD_DAYS = 7;
const COVER_DAYS = 30;
const DAY = 86400000;

// units (net of returns) sold per medicine in the last WINDOW_DAYS
async function soldByMedicine(now = new Date()) {
  const sales = await Sale.find({ createdAt: { $gte: new Date(now.getTime() - WINDOW_DAYS * DAY) }, status: { $ne: 'cancelled' } }).select('items.medicine items.baseQty items.returnedBase').lean();
  const sold = new Map();
  for (const s of sales) for (const i of s.items) sold.set(String(i.medicine), (sold.get(String(i.medicine)) || 0) + Math.max((i.baseQty || 0) - (i.returnedBase || 0), 0));
  return sold;
}

function suggestLevels(med, soldUnits) {
  const perDay = soldUnits / WINDOW_DAYS;
  if (!(perDay > 0)) return null;
  const step = (med.unitsPerStrip || 1) > 1 ? med.unitsPerStrip : 1;
  const up = (x) => Math.ceil(x / step) * step;
  const min = Math.max(up(perDay * LEAD_DAYS), step);
  const max = Math.max(up(perDay * COVER_DAYS), min + step);
  return { perDay: Math.round(perDay * 100) / 100, min, max };
}

async function levelsPreview() {
  const sold = await soldByMedicine();
  const meds = await Medicine.find({ _id: { $in: [...sold.keys()] }, isActive: true }).select('name genericName stripsPerBox unitsPerStrip minStockLevel maxStockLevel').lean();
  const rows = meds.map((m) => {
    const sug = suggestLevels(m, sold.get(String(m._id)));
    if (!sug) return null;
    return {
      _id: m._id, name: m.name, sold: sold.get(String(m._id)), perDay: sug.perDay,
      current: { min: m.minStockLevel || 0, max: m.maxStockLevel || 0, minDisplay: fromBase(m, m.minStockLevel || 0), maxDisplay: fromBase(m, m.maxStockLevel || 0) },
      suggested: { min: sug.min, max: sug.max, minDisplay: fromBase(m, sug.min), maxDisplay: fromBase(m, sug.max) },
      changed: sug.min !== (m.minStockLevel || 0) || sug.max !== (m.maxStockLevel || 0),
    };
  }).filter(Boolean).sort((a, b) => b.perDay - a.perDay);
  return { windowDays: WINDOW_DAYS, leadDays: LEAD_DAYS, coverDays: COVER_DAYS, data: rows };
}

module.exports = { soldByMedicine, suggestLevels, levelsPreview, WINDOW_DAYS, LEAD_DAYS, COVER_DAYS };
