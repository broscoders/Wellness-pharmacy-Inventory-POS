const { z } = require('zod');
const Shift = require('../models/Shift');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { nextNumber } = require('../utils/counter');
const { getPagination, pageMeta } = require('../utils/pagination');
const { round2 } = require('../utils/money');
const { shiftSummary } = require('../services/shift.service');
const { objectId } = require('./medicine.controller');

const openSchema = z.object({ openingCash: z.number().min(0) });
const movementSchema = z.object({ type: z.enum(['in', 'out']), amount: z.number().positive(), reason: z.string().trim().min(3, 'A reason is required').max(150) });
const closeSchema = z.object({ countedCash: z.number().min(0), notes: z.string().trim().max(300).optional() });

const isManager = (req) => req.user.permissions().includes('shifts:manage');

// Cashiers only ever see their own shifts; the owner (shifts:manage) sees everyone's.
async function loadShift(req) {
  const shift = await Shift.findById(req.params.id);
  if (!shift) throw ApiError.notFound('Shift not found');
  if (!isManager(req) && String(shift.user) !== String(req.user._id)) throw ApiError.forbidden();
  return shift;
}

const current = asyncHandler(async (req, res) => {
  const shift = await Shift.findOne({ user: req.user._id, status: 'open' });
  if (!shift) return res.json({ success: true, data: null });
  res.json({ success: true, data: { ...shift.toObject(), live: await shiftSummary(shift) } });
});

const open = asyncHandler(async (req, res) => {
  if (await Shift.exists({ user: req.user._id, status: 'open' })) throw ApiError.conflict('You already have an open shift. Close it first.');
  let shift;
  try {
    shift = await Shift.create({ shiftNo: await nextNumber('shift', 'SH'), user: req.user._id, userName: req.user.name, openKey: String(req.user._id), openingCash: req.body.openingCash });
  } catch (e) {
    if (e.code === 11000) throw ApiError.conflict('You already have an open shift. Close it first.');
    throw e;
  }
  await audit(req, 'shift.open', 'Shift', shift._id, { openingCash: shift.openingCash });
  res.status(201).json({ success: true, data: { ...shift.toObject(), live: await shiftSummary(shift) } });
});

const addMovement = asyncHandler(async (req, res) => {
  const shift = await loadShift(req);
  if (shift.status !== 'open') throw ApiError.badRequest('This shift is already closed');
  if (String(shift.user) !== String(req.user._id)) throw ApiError.forbidden('Only the cashier of this shift can add cash in/out');
  shift.movements.push(req.body);
  await shift.save();
  await audit(req, `shift.cash_${req.body.type}`, 'Shift', shift._id, { amount: req.body.amount, reason: req.body.reason });
  res.json({ success: true, data: { ...shift.toObject(), live: await shiftSummary(shift) } });
});

const close = asyncHandler(async (req, res) => {
  const shift = await loadShift(req);
  const closedAt = new Date();
  const summary = await shiftSummary(shift, closedAt);
  const difference = round2(req.body.countedCash - summary.expectedCash);
  if (difference !== 0 && !(req.body.notes && req.body.notes.length >= 3)) throw ApiError.badRequest('The counted cash does not match. Write a short note explaining the difference.');
  // compare-and-set on status so a double click cannot close twice
  const r = await Shift.updateOne(
    { _id: shift._id, status: 'open' },
    { $set: { status: 'closed', closedAt, closedBy: req.user._id, closedByName: req.user.name, countedCash: req.body.countedCash, expectedCash: summary.expectedCash, difference, notes: req.body.notes, summary }, $unset: { openKey: 1 } }
  );
  if (r.modifiedCount !== 1) throw ApiError.conflict('This shift is already closed');
  await audit(req, 'shift.close', 'Shift', shift._id, { expected: summary.expectedCash, counted: req.body.countedCash, difference });
  res.json({ success: true, data: await Shift.findById(shift._id) });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (!isManager(req)) filter.user = req.user._id;
  else if (req.query.user) filter.user = req.query.user;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.openedAt = {};
    if (req.query.from) filter.openedAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.openedAt.$lt = new Date(req.query.to);
  }
  const [data, total] = await Promise.all([
    Shift.find(filter).select('-summary').sort({ openedAt: -1 }).skip(skip).limit(limit),
    Shift.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

const getOne = asyncHandler(async (req, res) => {
  const shift = await loadShift(req);
  const data = shift.toObject();
  if (shift.status === 'open') data.live = await shiftSummary(shift);
  res.json({ success: true, data });
});

module.exports = { current, open, addMovement, close, list, getOne, openSchema, movementSchema, closeSchema, objectId };
