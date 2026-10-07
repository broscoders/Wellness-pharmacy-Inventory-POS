const AuditLog = require('../models/AuditLog');

// Fire-and-forget: audit failures must never break the main request.
async function audit(req, action, entity, entityId, details) {
  try {
    await AuditLog.create({
      user: req.user?._id,
      userName: req.user?.name,
      action,
      entity,
      entityId: entityId ? String(entityId) : undefined,
      details,
      ip: req.ip,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = audit;
