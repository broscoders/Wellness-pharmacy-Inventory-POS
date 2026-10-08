const { z } = require('zod');
const Expense = require('../models/Expense');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { nextNumber } = require('../utils/counter');
const { getPagination, pageMeta } = require('../utils/pagination');
const { round2 } = require('../utils/money');

const createSchema = z.object({
  category: z.enum(Expense.CATEGORIES),
  amount: z.number().positive(),
  date: z.string().optional(),
  description: z.string().trim().max(200).optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer']).optional(),
});
const voidSchema = z.object({ reason: z.string().trim().min(3, 'A reason is required').max(200) });

const create = asyncHandler(async (req, res) => {
  const e = await Expense.create({ ...req.body, date: req.body.date ? new Date(req.body.date) : new Date(), expenseNo: await nextNumber('expense', 'EXP'), createdBy: req.user._id, createdByName: req.user.name });
  await audit(req, 'expense.create', 'Expense', e._id, { category: e.category, amount: e.amount });
  res.status(201).json({ success: true, data: e });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.voided !== 'true') filter.isVoided = false;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lt = new Date(req.query.to);
  }
  const [data, total, all] = await Promise.all([
    Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
    Expense.countDocuments(filter),
    Expense.find({ ...filter, isVoided: false }).select('amount category'),
  ]);
  const byCategory = {};
  all.forEach((x) => { byCategory[x.category] = round2((byCategory[x.category] || 0) + x.amount); });
  res.json({ success: true, data, meta: pageMeta(total, page, limit), totals: { total: round2(all.reduce((s, x) => s + x.amount, 0)), byCategory } });
});

const voidExpense = asyncHandler(async (req, res) => {
  const res1 = await Expense.updateOne({ _id: req.params.id, isVoided: false }, { $set: { isVoided: true, voidReason: req.body.reason, voidedBy: req.user._id } });
  if (res1.matchedCount !== 1) throw ApiError.notFound('Expense not found or already voided');
  await audit(req, 'expense.void', 'Expense', req.params.id, { reason: req.body.reason });
  res.json({ success: true, message: 'Expense voided' });
});

module.exports = { create, list, voidExpense, createSchema, voidSchema };
