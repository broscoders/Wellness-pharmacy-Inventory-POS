const mongoose = require('mongoose');

// Records sensitive actions: stock adjustment, discount, return, cancellation, price change, user changes...
const auditSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    userName: String,
    action: { type: String, required: true, index: true },
    entity: { type: String, index: true },
    entityId: { type: String },
    details: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
