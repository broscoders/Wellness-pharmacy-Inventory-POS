const { z } = require('zod');
const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta } = require('../utils/pagination');
const { toBase, fromBase, parseExpiry, unitsPerBox } = require('../utils/units');
const { applyMovement } = require('../services/stock.service');
const { expiryStatus, DAY, getAlerts } = require('../services/inventory.service');
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
    purchasePricePerBox: req.body.purchasePricePerBox ?? med.purchasePrice,
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

module.exports = { createBatch, listBatches, adjust, movements, alerts, summary, createBatchSchema, adjustSchema };
