const { z } = require('zod');
const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Prescription = require('../models/Prescription');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta, escapeRegex } = require('../utils/pagination');
const { checkout, processReturn, cancelSale } = require('../services/sale.service');
const { objectId } = require('./medicine.controller');

const unitType = z.enum(['box', 'strip', 'unit']);

const createSchema = z.object({
  type: z.enum(['retail', 'wholesale']).optional(),
  customer: objectId.optional().nullable(),
  items: z.array(z.object({ medicine: objectId, unitType, quantity: z.number().int().min(1).max(100000) })).min(1, 'Add at least one medicine').max(100),
  discount: z.number().min(0).optional(),
  payments: z.array(z.object({ method: z.enum(['cash', 'card', 'bank_transfer', 'credit']), amount: z.number().positive() })).min(1, 'Add a payment'),
  notes: z.string().trim().max(300).optional(),
  prescriptionConfirmed: z.boolean().optional(),
  prescription: objectId.optional().nullable(),
  clientId: z.string().trim().min(8).max(64).optional(), // idempotency key, one per bill on screen
});

const returnSchema = z.object({
  items: z.array(z.object({ saleItem: objectId, unitType, quantity: z.number().int().min(1) })).min(1),
  reason: z.string().trim().min(3, 'Return reason is required').max(200),
  refundTo: z.enum(['cash', 'credit']).optional(), // 'credit' = reduce customer's udhaar first
});

const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Cancellation reason is required').max(200) });

const create = asyncHandler(async (req, res) => {
  if (req.body.customer === null) delete req.body.customer;
  if (req.body.discount > 0 && !req.user.permissions().includes('sales:discount')) {
    throw ApiError.forbidden('You are not allowed to give discounts');
  }
  let rx = null;
  if (req.body.prescription) {
    rx = await Prescription.findById(req.body.prescription);
    if (!rx) throw ApiError.badRequest('Prescription not found');
    req.body.prescriptionConfirmed = true; // a recorded prescription counts as confirmed
  } else {
    delete req.body.prescription;
  }
  // Idempotent: if the network dropped after the bill was saved and the screen retries, hand back the same bill.
  const { clientId } = req.body;
  if (clientId) {
    const existing = await Sale.findOne({ clientId });
    if (existing) return res.status(200).json({ success: true, data: existing, duplicate: true });
  }
  let sale;
  try {
    sale = await checkout(req.body, req.user);
  } catch (err) {
    // Two identical requests raced: the loser's stock was already put back, answer with the winner's bill.
    if (err.code === 11000 && clientId) {
      const winner = await Sale.findOne({ clientId });
      if (winner) return res.status(200).json({ success: true, data: winner, duplicate: true });
    }
    throw err;
  }
  if (rx) {
    await Sale.updateOne({ _id: sale._id }, { $set: { prescription: rx._id } });
    await Prescription.updateOne({ _id: rx._id }, { $addToSet: { sales: sale._id } });
    sale.prescription = rx._id;
  }
  if (sale.discount > 0) await audit(req, 'sale.discount', 'Sale', sale._id, { invoiceNo: sale.invoiceNo, discount: sale.discount, subtotal: sale.subtotal });
  res.status(201).json({ success: true, data: sale });
});

// Cashiers see only their own bills; the owner and the pharmacist (who handle returns for any invoice) see everyone's.
const seesAll = (req) => req.user.permissions().includes('sales:view_all');
const assertMine = (req, sale) => { if (!seesAll(req) && String(sale.createdBy) !== String(req.user._id)) throw ApiError.forbidden('You can only open your own bills'); };

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (!seesAll(req)) filter.createdBy = req.user._id;
  if (req.query.search) filter.invoiceNo = new RegExp(escapeRegex(req.query.search), 'i');
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.staff && seesAll(req)) filter.createdBy = req.query.staff;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lt = new Date(req.query.to);
  }
  const [data, total] = await Promise.all([
    Sale.find(filter).select('-items').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Sale.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

const getOne = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('customer', 'name phone');
  if (!sale) throw ApiError.notFound('Invoice not found');
  assertMine(req, sale);
  const returns = await SaleReturn.find({ sale: sale._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: sale, returns });
});

const byInvoice = asyncHandler(async (req, res) => {
  const sale = await Sale.findOne({ invoiceNo: String(req.params.invoiceNo).toUpperCase() }).populate('customer', 'name phone');
  if (!sale) throw ApiError.notFound('Invoice not found');
  assertMine(req, sale);
  const returns = await SaleReturn.find({ sale: sale._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: sale, returns });
});

const doReturn = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) throw ApiError.notFound('Invoice not found');
  const result = await processReturn(sale, req.body, req.user);
  await audit(req, 'sale.return', 'Sale', sale._id, { invoiceNo: sale.invoiceNo, returnNo: result.saleReturn.returnNo, refund: result.saleReturn.refundAmount, reason: req.body.reason });
  res.status(201).json({ success: true, data: result.saleReturn, sale: result.sale });
});

const cancel = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) throw ApiError.notFound('Invoice not found');
  const updated = await cancelSale(sale, req.body.reason, req.user);
  await audit(req, 'sale.cancel', 'Sale', sale._id, { invoiceNo: sale.invoiceNo, total: sale.total, reason: req.body.reason });
  res.json({ success: true, data: updated });
});

const listReturns = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (!seesAll(req)) filter.createdBy = req.user._id;
  if (req.query.sale) filter.sale = req.query.sale;
  const [data, total] = await Promise.all([SaleReturn.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), SaleReturn.countDocuments(filter)]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

module.exports = { create, list, getOne, byInvoice, doReturn, cancel, listReturns, createSchema, returnSchema, cancelSchema };
