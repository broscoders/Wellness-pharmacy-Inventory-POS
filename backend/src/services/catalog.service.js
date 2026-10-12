// POS catalog: every sellable medicine in ONE compact response, so the counter can search in memory
// (instantly, even on a slow connection) instead of asking the server on every keystroke.
//
//   full  (no `since`)  -> all active medicines, with their live batches
//   delta (`since`)     -> only medicines whose own record OR whose batches changed since that time,
//                          plus `removed` ids (deactivated medicines) so the browser can drop them.
//
// Stock is sent as batches [quantity, expiryMs] instead of a single number, so the browser can work out
// "sellable now" itself and an expiry date passing at midnight can never leave a stale number on screen.
// The server stays the final authority: checkout re-checks stock and expiry on every sale.
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Category = require('../models/Category');
const Sale = require('../models/Sale');

const POP_DAYS = 30;
const POP_TTL_MS = 10 * 60 * 1000;
let popCache = { at: 0, map: new Map() };

// How many bill lines each medicine appeared on during the last 30 days (cancelled bills ignored).
async function popularity() {
  if (Date.now() - popCache.at < POP_TTL_MS) return popCache.map;
  const since = new Date(Date.now() - POP_DAYS * 24 * 3600 * 1000);
  const rows = await Sale.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.medicine', lines: { $sum: 1 } } },
  ]);
  popCache = { at: Date.now(), map: new Map(rows.map((r) => [String(r._id), r.lines])) };
  return popCache.map;
}

const priceOf = (p = {}) => ({ box: p.box || 0, strip: p.strip || 0, unit: p.unit || 0 });

function shape(m, batchesByMed, pop) {
  const id = String(m._id);
  return {
    _id: id,
    name: m.name,
    genericName: m.genericName || '',
    manufacturer: m.manufacturer || '',
    category: m.category ? String(m.category) : null,
    barcode: m.barcode || '',
    stripsPerBox: m.stripsPerBox || 1,
    unitsPerStrip: m.unitsPerStrip || 1,
    salePrice: priceOf(m.salePrice),
    wholesalePrice: priceOf(m.wholesalePrice),
    minStockLevel: m.minStockLevel || 0,
    requiresPrescription: !!m.requiresPrescription,
    rack: m.rack || '', row: m.row || '', side: m.side || '',
    dosageForm: m.dosageForm || '',
    storage: m.storage || 'room',
    pop: pop.get(id) || 0,
    batches: (batchesByMed.get(id) || []).map((b) => [b.quantity, b.expiryDate.getTime()]),
  };
}

async function buildCatalog({ since } = {}) {
  const serverTime = new Date();
  const [categories, pop] = await Promise.all([Category.find({ isActive: true }).select('name').sort({ name: 1 }).lean(), popularity()]);

  let medFilter = { isActive: true };
  let batchFilter = { isActive: true, quantity: { $gt: 0 } };
  let removed = [];

  if (since) {
    const [touchedMeds, touchedBatchMeds] = await Promise.all([
      Medicine.find({ updatedAt: { $gte: since } }).select('_id isActive').lean(),
      Batch.distinct('medicine', { updatedAt: { $gte: since } }),
    ]);
    removed = touchedMeds.filter((m) => !m.isActive).map((m) => String(m._id));
    const ids = new Set([...touchedMeds.filter((m) => m.isActive).map((m) => String(m._id)), ...touchedBatchMeds.map(String)]);
    removed.forEach((id) => ids.delete(id));
    const list = [...ids];
    medFilter = { _id: { $in: list }, isActive: true };
    batchFilter = { ...batchFilter, medicine: { $in: list } };
  }

  const [meds, batches] = await Promise.all([
    Medicine.find(medFilter).select('name genericName manufacturer category barcode stripsPerBox unitsPerStrip salePrice wholesalePrice minStockLevel requiresPrescription rack row side dosageForm storage').sort({ name: 1 }).lean(),
    Batch.find(batchFilter).select('medicine quantity expiryDate').sort({ expiryDate: 1 }).lean(),
  ]);

  const byMed = new Map();
  for (const b of batches) {
    const k = String(b.medicine);
    if (!byMed.has(k)) byMed.set(k, []);
    byMed.get(k).push(b);
  }

  return {
    mode: since ? 'delta' : 'full',
    serverTime: serverTime.toISOString(),
    categories: categories.map((c) => ({ _id: String(c._id), name: c.name })),
    removed,
    data: meds.map((m) => shape(m, byMed, pop)),
  };
}

module.exports = { buildCatalog };
