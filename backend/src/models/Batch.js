const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true },
    expiryDate: { type: Date, required: true, index: true },
    quantity: { type: Number, required: true, min: 0, default: 0 }, // current stock in BASE units
    purchasePricePerBox: { type: Number, min: 0, default: 0 },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    receivedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// A batch number is unique per medicine
batchSchema.index({ medicine: 1, batchNumber: 1 }, { unique: true });

batchSchema.virtual('isExpired').get(function isExpired() {
  return this.expiryDate < new Date();
});

module.exports = mongoose.models.Batch || mongoose.model('Batch', batchSchema);
