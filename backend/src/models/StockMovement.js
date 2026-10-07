const mongoose = require('mongoose');

// Immutable stock history: every change to a batch quantity is recorded here.
const movementSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    type: {
      type: String,
      enum: ['opening', 'purchase', 'sale', 'sale_return', 'purchase_return', 'adjustment', 'expired_writeoff'],
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true }, // signed, base units (+in / -out)
    balanceAfter: { type: Number, required: true },
    reason: { type: String, trim: true },
    refModel: String,
    refId: mongoose.Schema.Types.ObjectId,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.models.StockMovement || mongoose.model('StockMovement', movementSchema);
