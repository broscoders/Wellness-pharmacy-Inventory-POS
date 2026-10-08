const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    returnNo: { type: String, unique: true },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
    purchaseNo: String,
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', index: true },
    items: [{ purchaseItem: mongoose.Schema.Types.ObjectId, medicine: mongoose.Schema.Types.ObjectId, name: String, batch: mongoose.Schema.Types.ObjectId, batchNumber: String, baseQty: Number, value: Number }],
    totalValue: Number, // reduces what we owe the supplier
    reason: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.PurchaseReturn || mongoose.model('PurchaseReturn', schema);
