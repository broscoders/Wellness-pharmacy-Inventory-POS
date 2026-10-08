const { z } = require('zod');
const Prescription = require('../models/Prescription');
const PrescriptionFile = require('../models/PrescriptionFile');
const Customer = require('../models/Customer');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { nextNumber } = require('../utils/counter');
const { getPagination, pageMeta, escapeRegex } = require('../utils/pagination');
const { objectId } = require('./medicine.controller');

const baseSchema = z.object({
  customer: objectId.optional().nullable(),
  customerName: z.string().trim().max(120).optional(),
  prescriptionDate: z.string().optional(),
  doctorName: z.string().trim().min(2, 'Doctor name is required').max(120),
  reference: z.string().trim().max(80).optional(),
  items: z.array(z.object({
    medicine: objectId.optional().nullable(),
    name: z.string().trim().min(1).max(150),
    dosage: z.string().trim().max(100).optional(),
    instructions: z.string().trim().max(200).optional(),
  })).max(50).optional(),
  notes: z.string().trim().max(500).optional(),
});
const createSchema = baseSchema;
const updateSchema = baseSchema.partial();

const ALLOWED_FILES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE = 2 * 1024 * 1024;

async function resolveCustomer(body) {
  if (!body.customer) { delete body.customer; return; }
  const c = await Customer.findById(body.customer);
  if (!c) throw ApiError.badRequest('Customer not found');
  if (!body.customerName) body.customerName = c.name;
}

const clean = (b) => {
  const x = { ...b };
  (x.items || []).forEach((i) => { if (!i.medicine) delete i.medicine; });
  return x;
};

const create = asyncHandler(async (req, res) => {
  const body = clean(req.body);
  await resolveCustomer(body);
  const rx = await Prescription.create({ ...body, rxNo: await nextNumber('prescription', 'RX'), createdBy: req.user._id, createdByName: req.user.name });
  await audit(req, 'prescription.create', 'Prescription', rx._id, { rxNo: rx.rxNo, doctor: rx.doctorName });
  res.status(201).json({ success: true, data: rx });
});

const update = asyncHandler(async (req, res) => {
  const body = clean(req.body);
  await resolveCustomer(body);
  const rx = await Prescription.findByIdAndUpdate(req.params.id, body, { returnDocument: 'after', runValidators: true });
  if (!rx) throw ApiError.notFound('Prescription not found');
  await audit(req, 'prescription.update', 'Prescription', rx._id, { fields: Object.keys(body) });
  res.json({ success: true, data: rx });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ rxNo: rx }, { doctorName: rx }, { customerName: rx }, { reference: rx }];
  }
  if (req.query.from || req.query.to) {
    filter.prescriptionDate = {};
    if (req.query.from) filter.prescriptionDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.prescriptionDate.$lt = new Date(req.query.to);
  }
  const [data, total] = await Promise.all([
    Prescription.find(filter).sort({ prescriptionDate: -1, createdAt: -1 }).skip(skip).limit(limit),
    Prescription.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
});

const getOne = asyncHandler(async (req, res) => {
  const rx = await Prescription.findById(req.params.id).populate('sales', 'invoiceNo total createdAt status');
  if (!rx) throw ApiError.notFound('Prescription not found');
  res.json({ success: true, data: rx });
});

// Upload: PUT raw bytes with Content-Type image/jpeg|png|webp or application/pdf, header x-file-name optional.
const uploadFile = asyncHandler(async (req, res) => {
  const rx = await Prescription.findById(req.params.id);
  if (!rx) throw ApiError.notFound('Prescription not found');
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw ApiError.badRequest('Send the file as the request body (JPG, PNG, WEBP or PDF, max 2 MB)');
  const mimeType = String(req.headers['content-type'] || '').split(';')[0];
  if (!ALLOWED_FILES.includes(mimeType)) throw ApiError.badRequest('Only JPG, PNG, WEBP or PDF files are allowed');
  const name = decodeURIComponent(String(req.headers['x-file-name'] || 'prescription')).slice(0, 100);
  await PrescriptionFile.findOneAndUpdate({ prescription: rx._id }, { prescription: rx._id, name, mimeType, data: req.body }, { upsert: true });
  rx.hasFile = true;
  rx.fileName = name;
  await rx.save();
  await audit(req, 'prescription.file', 'Prescription', rx._id, { name, bytes: req.body.length });
  res.json({ success: true, data: rx });
});

const downloadFile = asyncHandler(async (req, res) => {
  const f = await PrescriptionFile.findOne({ prescription: req.params.id });
  if (!f) throw ApiError.notFound('No file attached');
  res.set({ 'Content-Type': f.mimeType, 'Content-Disposition': `inline; filename="${encodeURIComponent(f.name || 'prescription')}"`, 'Cache-Control': 'private, max-age=0', 'X-Content-Type-Options': 'nosniff' });
  res.send(f.data);
});

module.exports = { create, update, list, getOne, uploadFile, downloadFile, createSchema, updateSchema, MAX_FILE, ALLOWED_FILES };
