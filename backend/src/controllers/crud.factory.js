const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { getPagination, pageMeta, escapeRegex } = require('../utils/pagination');

// Generic list/create/get/update/archive handlers used by simple master-data resources.
module.exports = function crudFactory(Model, { entity, searchFields = ['name'], populate } = {}) {
  const list = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    if (req.query.active === 'true') filter.isActive = true;
    if (req.query.active === 'false') filter.isActive = false;
    if (req.query.type && Model.schema.path('type')) filter.type = req.query.type;

    let q = Model.find(filter).sort({ name: 1 }).skip(skip).limit(limit);
    if (populate) q = q.populate(populate);
    const [data, total] = await Promise.all([q, Model.countDocuments(filter)]);
    res.json({ success: true, data, meta: pageMeta(total, page, limit) });
  });

  const getOne = asyncHandler(async (req, res) => {
    let q = Model.findById(req.params.id);
    if (populate) q = q.populate(populate);
    const doc = await q;
    if (!doc) throw ApiError.notFound(`${entity} not found`);
    res.json({ success: true, data: doc });
  });

  const create = asyncHandler(async (req, res) => {
    const doc = await Model.create(req.body);
    await audit(req, `${entity.toLowerCase()}.create`, entity, doc._id);
    res.status(201).json({ success: true, data: doc });
  });

  const update = asyncHandler(async (req, res) => {
    // balance is ledger-controlled: never editable through the plain update endpoint
    delete req.body.balance;
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) throw ApiError.notFound(`${entity} not found`);
    await audit(req, `${entity.toLowerCase()}.update`, entity, doc._id, req.body);
    res.json({ success: true, data: doc });
  });

  // Soft delete: master data referenced by transactions must never be hard-deleted.
  const archive = asyncHandler(async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!doc) throw ApiError.notFound(`${entity} not found`);
    await audit(req, `${entity.toLowerCase()}.archive`, entity, doc._id);
    res.json({ success: true, data: doc, message: `${entity} deactivated` });
  });

  return { list, getOne, create, update, archive };
};
