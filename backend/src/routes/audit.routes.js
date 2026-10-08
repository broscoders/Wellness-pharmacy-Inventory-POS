const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { getPagination, pageMeta } = require('../utils/pagination');
const { protect, requirePermission } = require('../middleware/auth');

router.get('/', protect, requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 30);
  const filter = {};
  if (req.query.action) filter.action = new RegExp(`^${String(req.query.action).replace(/[^a-z._]/gi, '')}`);
  if (req.query.user) filter.user = req.query.user;
  const [data, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), AuditLog.countDocuments(filter)]);
  res.json({ success: true, data, meta: pageMeta(total, page, limit) });
}));

module.exports = router;
