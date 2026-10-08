const { z } = require('zod');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta, escapeRegex } = require('../utils/pagination');
const { parseExpiry } = require('../utils/units');
const { createPurchase, createPurchaseReturn } = require('../services/purchase.service');
const { objectId } = require('./medicine.controller');

const qty = z.object({ box: z.number().min(0).optional(), strip: z.number().min(0).optional(), unit: z.number().min(0).optional() });

const createSchema = z.object({
  supplier: objectId,
  supplierInvoiceNo: z.string().trim().max(60).optional(),
  purchaseDate: z.string().optional(),
  items: z.array(z.object({
    medicine: objectId,
    batchNumber: z.string().trim().min(1).max(50),
    expiryDate: z.string().refine((v) => parseExpiry(v), 'Invalid expiry date (use YYYY-MM-DD or YYYY-MM)'),
    quantity: qty,
    pricePerBox: z.number().min(0),
    discountPercent: z.number().min(0).max(100).optional(),
  })).min(1, 'Add at least one medicine').max(200),
  discount: z.number().min(0).optional(),
  paidAmount: z.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer']).optional(),
  notes: z.string().trim().max(300).optional(),
});

const returnSchema = z.object({
  items: z.array(z.object({ purchaseItem: objectId, quantity: qty })).min(1),
  reason: z.string().trim().min(3, 'Return reason is required').max(200),
});

const create = asyncHandler(async (req, res) => {
  const purchase = await createPurchase(req.body, req.user);
  await audit(req, 'purchase.create', 'Purchase', purchase._id, { purchaseNo: purchase.purchaseNo, total: purchase.total, due: purchase.dueAmount });
  res.status(201).json({ success: true, data: purchase });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ purchaseNo: rx }, { supplierInvoiceNo: rx }, { supplierName: rx }];
  }
  if (req.query.from || req.query.to) {
    filter.purchaseDate = {};
    if (req.query.from) filter.purchaseDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.purchaseDate.$lt = new Date(req.query.to);
  }
  const [data, total] = await Promise.all([
    Purchase.find(filter).select('-items').sort({ purchaseDate: -1 }).skip(skip).limit(limit),
    Purchase.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

const getOne = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('supplier', 'name phone');
  if (!purchase) throw ApiError.notFound('Purchase not found');
  const returns = await PurchaseReturn.find({ purchase: purchase._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: purchase, returns });
});

const doReturn = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  const result = await createPurchaseReturn(purchase, req.body, req.user);
  await audit(req, 'purchase.return', 'Purchase', purchase._id, { purchaseNo: purchase.purchaseNo, returnNo: result.purchaseReturn.returnNo, value: result.purchaseReturn.totalValue, reason: req.body.reason });
  res.status(201).json({ success: true, data: result.purchaseReturn, purchase: result.purchase });
});

const listReturns = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.supplier) filter.supplier = req.query.supplier;
  const [data, total] = await Promise.all([PurchaseReturn.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), PurchaseReturn.countDocuments(filter)]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

module.exports = { create, list, getOne, doReturn, listReturns, createSchema, returnSchema };
