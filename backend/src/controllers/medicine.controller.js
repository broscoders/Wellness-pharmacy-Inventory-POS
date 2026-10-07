const { z } = require('zod');
const Medicine = require('../models/Medicine');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta, escapeRegex } = require('../utils/pagination');
const { stockByMedicine, decorateMedicine } = require('../services/inventory.service');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const price = z.object({ box: z.number().min(0).optional(), strip: z.number().min(0).optional(), unit: z.number().min(0).optional() });

const baseSchema = z.object({
  name: z.string().trim().min(2).max(150),
  genericName: z.string().trim().max(150).optional(),
  category: objectId.optional().nullable(),
  manufacturer: z.string().trim().max(120).optional(),
  barcode: z.string().trim().max(60).optional(),
  supplier: objectId.optional().nullable(),
  packType: z.string().trim().max(30).optional(),
  stripsPerBox: z.number().int().min(1).max(1000).optional(),
  unitsPerStrip: z.number().int().min(1).max(1000).optional(),
  purchasePrice: z.number().min(0).optional(),
  salePrice: price.optional(),
  wholesalePrice: price.optional(),
  minStockLevel: z.number().int().min(0).optional(),
  requiresPrescription: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const createSchema = baseSchema;
const updateSchema = baseSchema.partial();

// Empty barcode must be removed, otherwise the unique+sparse index treats '' as a real value.
const clean = (body) => {
  const b = { ...body };
  if (b.barcode === '') delete b.barcode;
  if (b.category === null) delete b.category;
  if (b.supplier === null) delete b.supplier;
  return b;
};

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ name: rx }, { genericName: rx }, { barcode: rx }, { manufacturer: rx }];
  }
  if (req.query.category) filter.category = req.query.category;
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;

  const [meds, total] = await Promise.all([
    Medicine.find(filter).populate('category', 'name').populate('supplier', 'name').sort({ name: 1 }).skip(skip).limit(limit),
    Medicine.countDocuments(filter),
  ]);
  const stockMap = await stockByMedicine(meds.map((m) => m._id));
  res.json({ success: true, data: meds.map((m) => decorateMedicine(m, stockMap)), meta: pageMeta(total, page, limit) });
});

const getOne = asyncHandler(async (req, res) => {
  const med = await Medicine.findById(req.params.id).populate('category', 'name').populate('supplier', 'name');
  if (!med) throw ApiError.notFound('Medicine not found');
  const stockMap = await stockByMedicine([med._id]);
  res.json({ success: true, data: decorateMedicine(med, stockMap) });
});

const byBarcode = asyncHandler(async (req, res) => {
  const med = await Medicine.findOne({ barcode: req.params.code, isActive: true });
  if (!med) throw ApiError.notFound('No medicine found for this barcode');
  const stockMap = await stockByMedicine([med._id]);
  res.json({ success: true, data: decorateMedicine(med, stockMap) });
});

const create = asyncHandler(async (req, res) => {
  const med = await Medicine.create(clean(req.body));
  await audit(req, 'medicine.create', 'Medicine', med._id, { name: med.name });
  res.status(201).json({ success: true, data: med });
});

const update = asyncHandler(async (req, res) => {
  const before = await Medicine.findById(req.params.id);
  if (!before) throw ApiError.notFound('Medicine not found');
  const body = clean(req.body);

  // Changing pack structure after stock exists would silently change what stock means.
  const packChanged =
    (body.stripsPerBox && body.stripsPerBox !== before.stripsPerBox) ||
    (body.unitsPerStrip && body.unitsPerStrip !== before.unitsPerStrip);
  if (packChanged) {
    const Batch = require('../models/Batch');
    const hasStock = await Batch.exists({ medicine: before._id, quantity: { $gt: 0 } });
    if (hasStock) throw ApiError.badRequest('Pack structure cannot be changed while this medicine has stock');
  }

  const priceChange = {};
  ['purchasePrice', 'salePrice', 'wholesalePrice'].forEach((k) => {
    if (body[k] !== undefined) priceChange[k] = { from: before[k], to: body[k] };
  });

  Object.assign(before, body);
  await before.save();
  await audit(req, 'medicine.update', 'Medicine', before._id, { fields: Object.keys(body) });
  if (Object.keys(priceChange).length) await audit(req, 'medicine.price_change', 'Medicine', before._id, priceChange);
  res.json({ success: true, data: before });
});

const archive = asyncHandler(async (req, res) => {
  const med = await Medicine.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!med) throw ApiError.notFound('Medicine not found');
  await audit(req, 'medicine.archive', 'Medicine', med._id);
  res.json({ success: true, data: med, message: 'Medicine deactivated' });
});

module.exports = { list, getOne, byBarcode, create, update, archive, createSchema, updateSchema, objectId };
