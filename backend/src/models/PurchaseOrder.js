const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  name: String,
  unitsPerBox: Number, // snapshot, so progress stays right even if the pack structure is edited later
  orderedBoxes: { type: Number, required: true, min: 1 },
  receivedBase: { type: Number, default: 0 }, // filled in as purchases are received against this order
  costPerBox: { type: Number, default: 0 }, // expected cost, only for the estimate
});

const schema = new mongoose.Schema(
  {
    poNo: { type: String, unique: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierName: String,
    // draft -> sent (given to the supplier) -> partial -> received. cancelled can happen before everything arrives.
    status: { type: String, enum: ['draft', 'sent', 'partial', 'received', 'cancelled'], default: 'draft', index: true },
    items: [itemSchema],
    expectedDate: Date,
    notes: String,
    estTotal: Number,
    sentAt: Date,
    cancelReason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', schema);
