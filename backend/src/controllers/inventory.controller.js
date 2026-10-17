const { z } = require('zod');
const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta, escapeRegex } = require('../utils/pagination');
const { toBase, fromBase, parseExpiry, unitsPerBox } = require('../utils/units');
const { applyMovement } = require('../services/stock.service');
const { expiryStatus, DAY, getAlerts, suggestedBoxes } = require('../services/inventory.service');
const { objectId } = require('./medicine.controller');

const qtySchema = z.object({
  box: z.number().min(0).optional(),
  strip: z.number().min(0).optional(),
  unit: z.number().min(0).optional(),
});

const expiryField = z.string().refine((v) => parseExpiry(v), 'Invalid expiry date (use YYYY-MM-DD or YYYY-MM)');

const createBatchSchema = z.object({
  medicine: objectId,
  batchNumber: z.string().trim().min(1).max(50),
  expiryDate: expiryField,
  quantity: qtySchema, // entered as boxes/strips/units, stored as base units
  purchasePricePerBox: z.number().min(0).optional(),
  supplier: objectId.optional(),
  reason: z.string().trim().max(200).optional(),
});

const adjustSchema = z.object({
  mode: z.enum(['set', 'add', 'remove']),
  quantity: qtySchema,
  reason: z.string().trim().min(3, 'A reason is required for stock adjustments').max(200),
});

// Manually add a batch (opening stock / stock received outside the purchase module).
const createBatch = asyncHandler(async (req, res) => {
  const med = await Medicine.findById(req.body.medicine);
  if (!med) throw ApiError.notFound('Medicine not found');
  const qty = toBase(med, req.body.quantity);
  if (qty <= 0) throw ApiError.badRequest('Quantity must be greater than zero');

  const batch = await Batch.create({
    medicine: med._id,
    batchNumber: req.body.batchNumber,
    expiryDate: parseExpiry(req.body.expiryDate),
    quantity: 0,
    purchasePricePerBox: (req.user.permissions().includes('costs:view') ? req.body.purchasePricePerBox : undefined) ?? med.purchasePrice,
    supplier: req.body.supplier || med.supplier,
  });
  await applyMovement({
    batchId: batch._id, delta: qty, type: 'opening', reason: req.body.reason || 'Opening stock', userId: req.user._id,
  });
  await audit(req, 'inventory.batch_create', 'Batch', batch._id, { medicine: med.name, qty });
  const fresh = await Batch.findById(batch._id);
  res.status(201).json({ success: true, data: fresh });
});

const listBatches = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 25);
  const filter = {};
  if (req.query.medicine) filter.medicine = req.query.medicine;
  if (req.query.inStock !== 'false') filter.quantity = { $gt: 0 };
  const now = new Date();
  if (req.query.status === 'expired') filter.expiryDate = { $lt: now };
  if (req.query.status === 'active') filter.expiryDate = { $gte: now };
  if (req.query.expiringInDays) filter.expiryDate = { $gte: now, $lte: new Date(now.getTime() + Number(req.query.expiringInDays) * DAY) };

  const [batches, total] = await Promise.all([
    Batch.find(filter).populate('medicine', 'name genericName stripsPerBox unitsPerStrip').populate('supplier', 'name').sort({ expiryDate: 1 }).skip(skip).limit(limit),
    Batch.countDocuments(filter),
  ]);
  const data = batches.map((b) => {
    const o = b.toObject();
    return { ...o, ...expiryStatus(b.expiryDate), display: o.medicine ? fromBase(o.medicine, b.quantity) : undefined };
  });
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

// Stock adjustment (damage, count correction, expired write-off). Always needs a reason and is audited.
const adjust = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw ApiError.notFound('Batch not found');
  const med = await Medicine.findById(batch.medicine);
  const qty = toBase(med, req.body.quantity);
  const { mode, reason } = req.body;

  let delta;
  if (mode === 'set') delta = qty - batch.quantity;
  else if (mode === 'add') delta = qty;
  else delta = -qty;
  if (delta === 0) throw ApiError.badRequest('This adjustment changes nothing');

  const expired = batch.expiryDate < new Date();
  const updated = await applyMovement({
    batchId: batch._id,
    delta,
    type: delta < 0 && expired ? 'expired_writeoff' : 'adjustment',
    reason,
    userId: req.user._id,
  });
  await audit(req, 'inventory.adjust', 'Batch', batch._id, { medicine: med.name, batch: batch.batchNumber, mode, delta, reason });
  res.json({ success: true, data: updated });
});

// ---- Stock take (physical count) ----
// The counting sheet deliberately does NOT contain the system quantities, so the person counts what is really on the shelf
// instead of copying the screen. The review step then shows the differences; applying writes one stock adjustment per
// difference (with the reason and the person recorded) and refuses if stock moved while the count was being reviewed.
const takeSheetLimit = 300;
const takeSheet = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.rack === '__none__') filter.$or = [{ rack: { $exists: false } }, { rack: '' }, { rack: null }];
  else if (req.query.rack) filter.rack = new RegExp(`^${escapeRegex(String(req.query.rack))}$`, 'i');
  if (req.query.search) filter.name = new RegExp(escapeRegex(String(req.query.search)), 'i');
  const meds = await Medicine.find(filter).select('name genericName rack row side stripsPerBox unitsPerStrip').sort({ rack: 1, row: 1, name: 1 }).limit(takeSheetLimit).lean();
  const batches = await Batch.find({ medicine: { $in: meds.map((m) => m._id) }, isActive: true, quantity: { $gt: 0 } }).select('medicine batchNumber expiryDate').sort({ expiryDate: 1 }).lean();
  const byMed = new Map();
  for (const b of batches) { const k = String(b.medicine); if (!byMed.has(k)) byMed.set(k, []); byMed.get(k).push(b); }
  const rows = meds.flatMap((m) => (byMed.get(String(m._id)) || []).map((b) => ({ batch: b._id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, medicine: { _id: m._id, name: m.name, genericName: m.genericName, rack: m.rack || '', row: m.row || '', side: m.side || '', stripsPerBox: m.stripsPerBox, unitsPerStrip: m.unitsPerStrip } })));
  res.json({ success: true, data: rows, truncated: meds.length >= takeSheetLimit });
});

const stockTakeSchema = z.object({
  lines: z.array(z.object({ batch: objectId, counted: z.number().int().min(0), expected: z.number().int().min(0).optional() })).min(1, 'Count at least one batch').max(500),
  note: z.string().trim().min(3, 'A short note is required (for example: "Rack A monthly count")').max(150),
  apply: z.boolean().optional(),
});

const stockTake = asyncHandler(async (req, res) => {
  const { lines, note, apply } = req.body;
  const ids = lines.map((l) => l.batch);
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest('A batch is on the count twice');
  const batches = await Batch.find({ _id: { $in: ids } }).lean();
  const meds = await Medicine.find({ _id: { $in: batches.map((b) => b.medicine) } }).select('name stripsPerBox unitsPerStrip purchasePrice').lean();
  const medById = new Map(meds.map((m) => [String(m._id), m]));
  const batchById = new Map(batches.map((b) => [String(b._id), b]));
  const rows = lines.map((l) => {
    const b = batchById.get(String(l.batch)); if (!b) throw ApiError.notFound('A batch on this count was not found');
    const m = medById.get(String(b.medicine));
    const difference = l.counted - b.quantity;
    const perUnit = ((b.purchasePricePerBox || m.purchasePrice || 0) / unitsPerBox(m));
    return { batch: b._id, medicine: m._id, name: m.name, batchNumber: b.batchNumber, expiryDate: b.expiryDate, expired: b.expiryDate < new Date(), system: b.quantity, counted: l.counted, expected: l.expected, difference, costValue: Math.round(difference * perUnit * 100) / 100 };
  });
  const changed = rows.filter((r) => r.difference !== 0);
  const totals = { counted: rows.length, matched: rows.length - changed.length, short: changed.filter((r) => r.difference < 0).length, over: changed.filter((r) => r.difference > 0).length, costValue: Math.round(changed.reduce((s, r) => s + r.costValue, 0) * 100) / 100 };
  if (!apply) return res.json({ success: true, applied: false, data: rows, totals });

  const stale = changed.filter((r) => r.expected === undefined || r.expected !== r.system);
  if (stale.length) throw ApiError.conflict(`Stock changed while you were counting (${stale.slice(0, 3).map((r) => r.name).join(', ')}${stale.length > 3 ? '...' : ''}). Review the differences again before applying.`);
  const applied = [];
  for (const r of changed) {
    await applyMovement({ batchId: r.batch, delta: r.difference, type: r.difference < 0 && r.expired ? 'expired_writeoff' : 'adjustment', reason: `Stock take: ${note}`, userId: req.user._id });
    applied.push(r.batch);
  }
  await audit(req, 'inventory.stock_take', 'Batch', undefined, { note, counted: rows.length, adjusted: changed.length, short: totals.short, over: totals.over });
  res.json({ success: true, applied: true, adjusted: applied.length, data: rows, totals });
});

const movements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 30);
  const filter = {};
  if (req.query.medicine) filter.medicine = req.query.medicine;
  if (req.query.batch) filter.batch = req.query.batch;
  if (req.query.type) filter.type = req.query.type;
  const [data, total] = await Promise.all([
    StockMovement.find(filter).populate('medicine', 'name').populate('batch', 'batchNumber expiryDate').populate('user', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    StockMovement.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

// Low stock / out of stock / expired / near expiry (30, 60, 90 days) in one call.
const alerts = asyncHandler(async (req, res) => {
  const { data, counts } = await getAlerts();
  res.json({ success: true, data, counts });
});

// Totals for the dashboard / reports. Stock value = quantity x purchase cost per unit.
const summary = asyncHandler(async (req, res) => {
  const batches = await Batch.find({ isActive: true, quantity: { $gt: 0 } }).populate('medicine', 'stripsPerBox unitsPerStrip purchasePrice').lean();
  const now = new Date();
  let totalUnits = 0, stockValue = 0, expiredValue = 0;
  for (const b of batches) {
    if (!b.medicine) continue;
    const cost = (b.purchasePricePerBox || b.medicine.purchasePrice || 0) / unitsPerBox(b.medicine);
    const value = cost * b.quantity;
    totalUnits += b.quantity;
    if (b.expiryDate < now) expiredValue += value; else stockValue += value;
  }
  res.json({ success: true, data: { totalUnits, stockValue: Math.round(stockValue), expiredStockValue: Math.round(expiredValue), batchCount: batches.length } });
});

// Shopping list: everything low or out of stock, grouped by the supplier it is normally bought from.
// Suggested quantity = enough to reach the maximum level (or twice the minimum if no maximum is set), at least one full box, in whole boxes.
const reorder = asyncHandler(async (req, res) => {
  const { data } = await getAlerts();
  const rows = [...data.outOfStock, ...data.lowStock];
  const meds = await Medicine.find({ _id: { $in: rows.map((r) => r._id) } }).populate('supplier', 'name phone').lean();
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const groups = new Map();
  for (const r of rows) {
    const m = byId.get(String(r._id)); if (!m) continue;
    const upb = unitsPerBox(m);
    const boxes = suggestedBoxes(m, r.available);
    const name = m.supplier?.name || 'No supplier set';
    const g = groups.get(name) || { supplier: name, phone: m.supplier?.phone || '', items: [], total: 0 };
    const cost = Math.round(boxes * (m.purchasePrice || 0));
    g.items.push({ medicineId: m._id, name: m.name, genericName: m.genericName, available: r.available, availableDisplay: r.display, minStockLevel: m.minStockLevel, suggestedBoxes: boxes, unitsPerBox: upb, estCost: cost, outOfStock: r.available === 0 });
    g.total += cost;
    groups.set(name, g);
  }
  const list = [...groups.values()].sort((a, b) => a.supplier.localeCompare(b.supplier));
  list.forEach((g) => g.items.sort((a, b) => a.name.localeCompare(b.name)));
  res.json({ success: true, data: list, totals: { items: rows.length, estCost: list.reduce((s, g) => s + g.total, 0) } });
});

module.exports = { takeSheet, stockTake, stockTakeSchema, reorder, createBatch, listBatches, adjust, movements, alerts, summary, createBatchSchema, adjustSchema };
