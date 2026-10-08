const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const { fromBase } = require('../utils/units');

const DAY = 24 * 60 * 60 * 1000;

// Returns Map(medicineId -> { total, sellable, expired, nearestExpiry })
// "sellable" = not expired. Calculated in JS so it behaves the same on every MongoDB-compatible DB.
async function stockByMedicine(medicineIds) {
  const filter = { isActive: true, quantity: { $gt: 0 } };
  if (medicineIds) filter.medicine = { $in: medicineIds };
  const batches = await Batch.find(filter).select('medicine quantity expiryDate').lean();
  const now = new Date();
  const map = new Map();
  for (const b of batches) {
    const key = String(b.medicine);
    const s = map.get(key) || { total: 0, sellable: 0, expired: 0, nearestExpiry: null };
    s.total += b.quantity;
    if (b.expiryDate < now) s.expired += b.quantity;
    else {
      s.sellable += b.quantity;
      if (!s.nearestExpiry || b.expiryDate < s.nearestExpiry) s.nearestExpiry = b.expiryDate;
    }
    map.set(key, s);
  }
  return map;
}

function decorateMedicine(med, stockMap) {
  const obj = med.toObject ? med.toObject() : med;
  const s = stockMap.get(String(obj._id)) || { total: 0, sellable: 0, expired: 0, nearestExpiry: null };
  return {
    ...obj,
    stock: {
      ...s,
      display: fromBase(obj, s.sellable),
      isLow: s.sellable <= (obj.minStockLevel || 0),
      isOut: s.sellable === 0,
    },
  };
}

function expiryStatus(expiryDate, now = new Date()) {
  const days = Math.ceil((expiryDate - now) / DAY);
  if (days < 0) return { status: 'expired', daysLeft: days };
  if (days <= 30) return { status: 'expiring_30', daysLeft: days };
  if (days <= 60) return { status: 'expiring_60', daysLeft: days };
  if (days <= 90) return { status: 'expiring_90', daysLeft: days };
  return { status: 'ok', daysLeft: days };
}

async function getAlerts() {
  const now = new Date();
  const [meds, stockMap, batches] = await Promise.all([
    Medicine.find({ isActive: true }).select('name genericName minStockLevel stripsPerBox unitsPerStrip'),
    stockByMedicine(),
    Batch.find({ isActive: true, quantity: { $gt: 0 } }).populate('medicine', 'name stripsPerBox unitsPerStrip').sort({ expiryDate: 1 }),
  ]);

  const lowStock = [];
  const outOfStock = [];
  for (const m of meds) {
    const s = stockMap.get(String(m._id)) || { sellable: 0 };
    const row = { _id: m._id, name: m.name, genericName: m.genericName, minStockLevel: m.minStockLevel, available: s.sellable, display: fromBase(m, s.sellable) };
    if (s.sellable === 0) outOfStock.push(row);
    else if (s.sellable <= m.minStockLevel) lowStock.push(row);
  }

  const expired = [];
  const near = { d30: [], d60: [], d90: [] };
  for (const b of batches) {
    if (!b.medicine) continue;
    const { status, daysLeft } = expiryStatus(b.expiryDate, now);
    const row = { batchId: b._id, medicine: b.medicine.name, batchNumber: b.batchNumber, expiryDate: b.expiryDate, daysLeft, quantity: b.quantity, display: fromBase(b.medicine, b.quantity) };
    if (status === 'expired') expired.push(row);
    else if (status === 'expiring_30') near.d30.push(row);
    else if (status === 'expiring_60') near.d60.push(row);
    else if (status === 'expiring_90') near.d90.push(row);
  }

  return {
    data: { lowStock, outOfStock, expired, nearExpiry: near },
    counts: {
      lowStock: lowStock.length, outOfStock: outOfStock.length, expired: expired.length,
      nearExpiry30: near.d30.length, nearExpiry60: near.d60.length, nearExpiry90: near.d90.length,
    },
  };
}

module.exports = { stockByMedicine, decorateMedicine, expiryStatus, getAlerts, DAY };
