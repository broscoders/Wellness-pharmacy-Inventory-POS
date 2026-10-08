const mongoose = require('mongoose');

// amount > 0 : we owe the supplier more (purchase). amount < 0 : we owe less (payment / purchase return).
const schema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    type: { type: String, enum: ['purchase', 'payment', 'purchase_return', 'opening', 'adjustment'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    method: String,
    note: String,
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    refNo: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.models.SupplierLedger || mongoose.model('SupplierLedger', schema);
