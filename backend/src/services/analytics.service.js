const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const { round2, dayRange, localDay } = require('../utils/money');
const { unitsPerBox } = require('../utils/units');

const DAY = 86400000;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

// Net sales and gross profit for every business day in the range (days with no sales are returned as zero).
async function salesByDay(start, end) {
  const filter = { createdAt: { $gte: start, $lt: end } };
  const [sales, returns] = await Promise.all([
    Sale.find({ ...filter, status: { $ne: 'cancelled' } }).select('total createdAt items.costTotal').lean(),
    SaleReturn.find(filter).select('refundAmount createdAt items.cost').lean(),
  ]);
  const days = new Map();
  for (let t = start.getTime(); t < end.getTime(); t += DAY) days.set(localDay(new Date(t)), { day: localDay(new Date(t)), sales: 0, profit: 0, invoices: 0 });
  const slot = (d) => days.get(localDay(d));
  for (const s of sales) {
    const r = slot(s.createdAt); if (!r) continue;
    r.invoices += 1; r.sales += s.total; r.profit += s.total - sum(s.items, (i) => i.costTotal);
  }
  for (const rt of returns) {
    const r = slot(rt.createdAt); if (!r) continue;
    r.sales -= rt.refundAmount; r.profit -= rt.refundAmount - sum(rt.items, (i) => i.cost);
  }
  return [...days.values()].map((r) => ({ ...r, sales: round2(r.sales), profit: round2(r.profit) }));
}

// Per-medicine sales in the range. Returned quantities are taken out proportionally.
async function productStats(start, end) {
  const [sales, meds] = await Promise.all([
    Sale.find({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } }).select('items').lean(),
    Medicine.find().populate('category', 'name').select('name category stripsPerBox unitsPerStrip').lean(),
  ]);
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const stats = new Map();
  for (const s of sales) {
    for (const it of s.items) {
      const kept = it.baseQty ? Math.max(it.baseQty - (it.returnedBase || 0), 0) / it.baseQty : 0;
      if (kept === 0) continue;
      const m = byId.get(String(it.medicine)); if (!m) continue;
      const row = stats.get(String(m._id)) || { medicine: m._id, name: m.name, category: m.category?.name || 'Uncategorised', units: 0, revenue: 0, cost: 0 };
      row.units += it.baseQty * kept; row.revenue += it.netTotal * kept; row.cost += it.costTotal * kept;
      stats.set(String(m._id), row);
    }
  }
  return [...stats.values()].map((r) => {
    const m = byId.get(String(r.medicine));
    const upb = unitsPerBox(m);
    return { ...r, units: Math.round(r.units), boxes: round2(r.units / upb), revenue: round2(r.revenue), cost: round2(r.cost), profit: round2(r.revenue - r.cost), margin: r.revenue ? round2(((r.revenue - r.cost) / r.revenue) * 100) : 0 };
  });
}

// Stock that has not moved: has sellable stock but no sale in the last `days` days. Sorted by money tied up.
async function slowMoving(days = 60) {
  const since = new Date(Date.now() - days * DAY);
  const [recent, batches, meds] = await Promise.all([
    Sale.find({ createdAt: { $gte: since }, status: { $ne: 'cancelled' } }).select('items.medicine').lean(),
    Batch.find({ isActive: true, quantity: { $gt: 0 }, expiryDate: { $gte: new Date() } }).select('medicine quantity purchasePricePerBox').lean(),
    Medicine.find({ isActive: true }).populate('category', 'name').select('name category stripsPerBox unitsPerStrip purchasePrice').lean(),
  ]);
  const sold = new Set(recent.flatMap((s) => s.items.map((i) => String(i.medicine))));
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const stock = new Map();
  for (const b of batches) {
    const m = byId.get(String(b.medicine)); if (!m) continue;
    const cur = stock.get(String(m._id)) || { units: 0, value: 0 };
    cur.units += b.quantity; cur.value += ((b.purchasePricePerBox || m.purchasePrice || 0) / unitsPerBox(m)) * b.quantity;
    stock.set(String(m._id), cur);
  }
  return [...stock.entries()].filter(([id]) => !sold.has(id)).map(([id, s]) => {
    const m = byId.get(id);
    return { medicine: m._id, name: m.name, category: m.category?.name || 'Uncategorised', units: s.units, boxes: round2(s.units / unitsPerBox(m)), value: Math.round(s.value) };
  }).sort((a, b) => b.value - a.value);
}

module.exports = { salesByDay, productStats, slowMoving, dayRange };
