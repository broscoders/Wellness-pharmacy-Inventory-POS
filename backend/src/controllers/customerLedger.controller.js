const { z } = require('zod');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta } = require('../utils/pagination');
const { postCustomerLedger } = require('../services/ledger.service');
const { round2 } = require('../utils/money');

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'bank_transfer']).default('cash'),
  note: z.string().trim().max(200).optional(),
});

// Receive money from a customer against their udhaar.
const receivePayment = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found');
  const amount = round2(req.body.amount);
  if (amount > round2(customer.balance)) {
    throw ApiError.badRequest(`Payment is more than the outstanding balance (${round2(customer.balance)})`);
  }
  const updated = await postCustomerLedger({
    customerId: customer._id, amount: -amount, type: 'payment', method: req.body.method, note: req.body.note || 'Payment received', user: req.user,
  });
  await audit(req, 'customer.payment', 'Customer', customer._id, { amount, method: req.body.method });
  res.status(201).json({ success: true, data: { balance: updated.balance } });
});

const ledger = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 30);
  const filter = { customer: req.params.id };
  const [customer, data, total] = await Promise.all([
    Customer.findById(req.params.id),
    CustomerLedger.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    CustomerLedger.countDocuments(filter),
  ]);
  if (!customer) throw ApiError.notFound('Customer not found');
  res.json({ success: true, customer: { _id: customer._id, name: customer.name, phone: customer.phone, balance: customer.balance }, data, meta: pageMeta(total, page, limit) });
});

// All customers who owe money (receivables).
const receivables = asyncHandler(async (req, res) => {
  const data = await Customer.find({ balance: { $gt: 0 } }).sort({ balance: -1 });
  res.json({ success: true, data, totalOutstanding: round2(data.reduce((s, c) => s + c.balance, 0)) });
});

module.exports = { receivePayment, ledger, receivables, paymentSchema };
