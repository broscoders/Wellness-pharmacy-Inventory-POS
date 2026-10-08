const { z } = require('zod');
const Supplier = require('../models/Supplier');
const SupplierLedger = require('../models/SupplierLedger');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta } = require('../utils/pagination');
const { postSupplierLedger } = require('../services/ledger.service');
const { round2 } = require('../utils/money');

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'bank_transfer']).default('cash'),
  note: z.string().trim().max(200).optional(),
});

// Pay a supplier (full or partial) against what we owe.
const pay = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw ApiError.notFound('Supplier not found');
  const amount = round2(req.body.amount);
  if (amount > round2(supplier.balance)) throw ApiError.badRequest(`Payment is more than the outstanding balance (${round2(supplier.balance)})`);
  const updated = await postSupplierLedger({ supplierId: supplier._id, amount: -amount, type: 'payment', method: req.body.method, note: req.body.note || 'Payment to supplier', user: req.user });
  await audit(req, 'supplier.payment', 'Supplier', supplier._id, { amount, method: req.body.method });
  res.status(201).json({ success: true, data: { balance: updated.balance } });
});

const ledger = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 30);
  const filter = { supplier: req.params.id };
  const [supplier, data, total] = await Promise.all([
    Supplier.findById(req.params.id),
    SupplierLedger.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SupplierLedger.countDocuments(filter),
  ]);
  if (!supplier) throw ApiError.notFound('Supplier not found');
  res.json({ success: true, supplier: { _id: supplier._id, name: supplier.name, phone: supplier.phone, balance: supplier.balance }, data, meta: pageMeta(total, page, limit) });
});

// Which supplier do we owe how much (payables).
const payables = asyncHandler(async (req, res) => {
  const data = await Supplier.find({ balance: { $gt: 0 } }).sort({ balance: -1 });
  res.json({ success: true, data, totalPayable: round2(data.reduce((s, x) => s + x.balance, 0)) });
});

module.exports = { pay, ledger, payables, paymentSchema };
