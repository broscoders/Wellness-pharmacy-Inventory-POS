const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Setting = require('../models/Setting');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { expiryPlan, udhaarReminders, dailySummary } = require('../services/ops.service');

const { EJSON } = mongoose.mongo.BSON;
// 0 is a valid answer (e.g. minDays=0 means "everyone"), so only fall back to the default when it is not a number.
const intIn = (v, def, min, max) => { const n = parseInt(v, 10); return Math.min(Math.max(Number.isNaN(n) ? def : n, min), max); };

const expiry = asyncHandler(async (req, res) => res.json({ success: true, ...(await expiryPlan(intIn(req.query.days, 90, 7, 365))) }));
const udhaar = asyncHandler(async (req, res) => res.json({ success: true, ...(await udhaarReminders(intIn(req.query.minDays, 15, 0, 365))) }));
const markReminded = asyncHandler(async (req, res) => {
  const c = await Customer.findByIdAndUpdate(req.params.id, { $set: { lastReminderAt: new Date() } }, { returnDocument: 'after' });
  if (!c) throw ApiError.notFound('Customer not found');
  await audit(req, 'customer.reminder', 'Customer', c._id, { balance: c.balance });
  res.json({ success: true, data: { lastReminderAt: c.lastReminderAt } });
});
const daily = asyncHandler(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : undefined;
  res.json({ success: true, data: await dailySummary(date) });
});

// ---- Backup from inside the app. The browser downloads collection by collection (small pages, so it also works on
// Vercel's size limits) and saves ONE file that `npm run restore -- <file> --yes` can put back.
const listCollections = async () => (await mongoose.connection.db.listCollections().toArray()).filter((c) => !c.name.startsWith('system.') && c.type !== 'view').map((c) => c.name).sort();

const backupManifest = asyncHandler(async (req, res) => {
  const names = await listCollections();
  const counts = await Promise.all(names.map((n) => mongoose.connection.db.collection(n).estimatedDocumentCount()));
  const setting = await Setting.findOne({ key: 'main' }).lean();
  res.json({ success: true, database: mongoose.connection.name, collections: Object.fromEntries(names.map((n, i) => [n, counts[i]])), lastBackupAt: setting?.lastBackupAt || null });
});
const backupPage = asyncHandler(async (req, res) => {
  if (!(await listCollections()).includes(req.params.collection)) throw ApiError.notFound('Unknown collection');
  const limit = intIn(req.query.limit, 500, 1, 1000); const skip = intIn(req.query.skip, 0, 0, 10 ** 9);
  const docs = await mongoose.connection.db.collection(req.params.collection).find({}).sort({ _id: 1 }).skip(skip).limit(limit).toArray();
  res.set('Cache-Control', 'no-store').json({ success: true, docs: JSON.parse(EJSON.stringify(docs, { relaxed: false })), count: docs.length });
});
const backupDone = asyncHandler(async (req, res) => {
  await Setting.findOneAndUpdate({ key: 'main' }, { $set: { lastBackupAt: new Date() }, $setOnInsert: { key: 'main' } }, { upsert: true });
  await audit(req, 'backup.download', 'Setting', undefined, {});
  res.json({ success: true });
});

module.exports = { expiry, udhaar, markReminded, daily, backupManifest, backupPage, backupDone };
