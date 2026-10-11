const Batch = require('../models/Batch');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');

/**
 * Atomically change a batch quantity and record the movement.
 * delta > 0 adds stock, delta < 0 removes (fails if not enough stock - never goes negative).
 */
async function applyMovement({ batchId, delta, type, reason, refModel, refId, userId }) {
  const filter = { _id: batchId };
  if (delta < 0) filter.quantity = { $gte: -delta };

  // Conditional single-document update: the stock check and the decrement happen together,
  // so two cashiers can never both sell the last units. matchedCount tells us if it applied.
  const result = await Batch.updateOne(filter, { $inc: { quantity: delta } });
  if (result.matchedCount !== 1 || result.modifiedCount !== 1) throw ApiError.badRequest('Not enough stock in this batch (or batch not found)');

  const batch = await Batch.findById(batchId);
  await StockMovement.create({
    medicine: batch.medicine,
    batch: batch._id,
    type,
    quantity: delta,
    balanceAfter: batch.quantity,
    reason,
    refModel,
    refId,
    user: userId,
  });
  return batch;
}

/**
 * FEFO (First Expiry, First Out) allocation.
 * Picks sellable batches (not expired, stock > 0) ordered by earliest expiry
 * and splits the requested base-unit quantity across them.
 * Returns [{ batch, quantity }]. Throws if total sellable stock is not enough.
 * Expired batches are NEVER selected, so expired medicine can't be sold.
 */
async function allocateFEFO(medicineId, quantity) {
  const batches = await Batch.find({ medicine: medicineId, isActive: true, quantity: { $gt: 0 }, expiryDate: { $gte: new Date() } }).sort({ expiryDate: 1, createdAt: 1 });
  return planFEFO(batches, quantity);
}

/**
 * Pure FEFO planner (no database): batches must be sorted earliest-expiry first and contain only sellable stock.
 * Splits `quantity` over them. Throws when the total is not enough.
 */
function planFEFO(batches, quantity) {
  const total = batches.reduce((s, b) => s + b.quantity, 0);
  if (total < quantity) throw ApiError.badRequest(`Insufficient non-expired stock. Available: ${total}, requested: ${quantity}`);
  const plan = [];
  let remaining = quantity;
  for (const b of batches) {
    if (remaining <= 0) break;
    if (b.quantity <= 0) continue;
    const take = Math.min(b.quantity, remaining);
    plan.push({ batch: b, quantity: take });
    remaining -= take;
  }
  return plan;
}

// Everything sellable (not expired, in stock) for several medicines in ONE query, grouped by medicine, earliest expiry first.
async function loadSellableBatches(medicineIds) {
  const batches = await Batch.find({ medicine: { $in: medicineIds }, isActive: true, quantity: { $gt: 0 }, expiryDate: { $gte: new Date() } })
    .sort({ expiryDate: 1, createdAt: 1 }).lean();
  const byMedicine = new Map();
  for (const b of batches) {
    const k = String(b.medicine);
    if (!byMedicine.has(k)) byMedicine.set(k, []);
    byMedicine.get(k).push(b);
  }
  return byMedicine;
}

// Atomic decrement in ONE round trip (the stock check and the decrement are one conditional update). Returns the updated batch.
// The history row is written later by recordMovements so a whole bill needs one insert instead of one per batch.
async function takeStock(batchId, qty) {
  const batch = await Batch.findOneAndUpdate({ _id: batchId, quantity: { $gte: qty } }, { $inc: { quantity: -qty } }, { returnDocument: 'after' });
  if (!batch) throw ApiError.badRequest('Not enough stock in this batch (or batch not found)');
  return batch;
}

// Undo takeStock for a failed bill (one round trip for all batches).
async function putBackStock(list) {
  if (!list.length) return;
  await Batch.bulkWrite(list.map((m) => ({ updateOne: { filter: { _id: m.batchId }, update: { $inc: { quantity: m.qty } } } })));
}

async function recordMovements(rows) {
  if (rows.length) await StockMovement.insertMany(rows);
}

module.exports = { applyMovement, allocateFEFO, planFEFO, loadSellableBatches, takeStock, putBackStock, recordMovements };
