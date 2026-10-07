const Batch = require('../models/Batch');
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

module.exports = { stockByMedicine, decorateMedicine, expiryStatus, DAY };
