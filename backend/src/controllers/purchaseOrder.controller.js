const { z } = require('zod');
const PurchaseOrder = require('../models/PurchaseOrder');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta, escapeRegex } = require('../utils/pagination');
const { createOrder, createFromReorder, buildItems, estimate, OPEN } = require('../services/po.service');
const { objectId } = require('./medicine.controller');

const lines = z.array(z.object({ medicine: objectId, boxes: z.number().int().min(1).max(100000), costPerBox: z.number().min(0).optional() })).min(1, 'Add at least one medicine').max(200);
const createSchema = z.object({ supplier: objectId, items: lines, expectedDate: z.string().optional(), notes: z.string().trim().max(300).optional() });
const reorderSchema = z.object({ supplier: objectId });
const updateSchema = z.object({ items: lines.optional(), expectedDate: z.string().nullable().optional(), notes: z.string().trim().max(300).optional() });
const statusSchema = z.object({ status: z.enum(['sent', 'cancelled']), reason: z.string().trim().max(200).optional() });

const create = asyncHandler(async (req, res) => {
  const po = await createOrder(req.body, req.user);
  await audit(req, 'po.create', 'PurchaseOrder', po._id, { poNo: po.poNo, items: po.items.length });
  res.status(201).json({ success: true, data: po });
});

const fromReorder = asyncHandler(async (req, res) => {
  const po = await createFromReorder(req.body.supplier, req.user);
  await audit(req, 'po.create', 'PurchaseOrder', po._id, { poNo: po.poNo, items: po.items.length, from: 'reorder' });
  res.status(201).json({ success: true, data: po });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.status === 'open') filter.status = { $in: OPEN };
  else if (req.query.status) filter.status = req.query.status;
  if (req.query.search) { const rx = new RegExp(escapeRegex(req.query.search), 'i'); filter.$or = [{ poNo: rx }, { supplierName: rx }]; }
  const [data, total] = await Promise.all([PurchaseOrder.find(filter).select('-items').sort({ createdAt: -1 }).skip(skip).limit(limit), PurchaseOrder.countDocuments(filter)]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

// Includes the medicine's pack details and last cost so the receive screen can pre-fill lines.
const getOne = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findById(req.params.id).populate('items.medicine', 'name stripsPerBox unitsPerStrip purchasePrice genericName');
  if (!po) throw ApiError.notFound('Purchase order not found');
  res.json({ success: true, data: po });
});

const update = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findById(req.params.id);
  if (!po) throw ApiError.notFound('Purchase order not found');
  if (po.status !== 'draft') throw ApiError.badRequest('Only a draft order can be edited. Cancel it and make a new one instead.');
  if (req.body.items) { po.items = await buildItems(req.body.items); po.estTotal = estimate(po.items); }
  if (req.body.notes !== undefined) po.notes = req.body.notes;
  if (req.body.expectedDate !== undefined) po.expectedDate = req.body.expectedDate ? new Date(req.body.expectedDate) : undefined;
  await po.save();
  await audit(req, 'po.update', 'PurchaseOrder', po._id, { poNo: po.poNo });
  res.json({ success: true, data: po });
});

const setStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const allowed = status === 'sent' ? ['draft'] : ['draft', 'sent', 'partial'];
  if (status === 'cancelled' && !(reason && reason.length >= 3)) throw ApiError.badRequest('A reason is required to cancel an order');
  const set = status === 'sent' ? { status, sentAt: new Date() } : { status, cancelReason: reason };
  const r = await PurchaseOrder.updateOne({ _id: req.params.id, status: { $in: allowed } }, { $set: set });
  if (r.matchedCount !== 1) throw ApiError.badRequest(`This order cannot be changed to "${status}" from its current status`);
  await audit(req, `po.${status}`, 'PurchaseOrder', req.params.id, { reason });
  res.json({ success: true, data: await PurchaseOrder.findById(req.params.id) });
});

module.exports = { create, fromReorder, list, getOne, update, setStatus, createSchema, reorderSchema, updateSchema, statusSchema };
