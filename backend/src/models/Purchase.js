const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  name: String,
  batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  batchNumber: String,
  expiryDate: Date,
  baseQty: { type: Number, required: true },
  returnedBase: { type: Number, default: 0 },
  pricePerBox: Number, // cost price per box
  discountPercent: { type: Number, default: 0 },
  lineTotal: Number, // after line discount
});

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNo: { type: String, unique: true, index: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierName: String,
    supplierInvoiceNo: { type: String, trim: true },
    purchaseDate: { type: Date, default: Date.now, index: true },
    items: [itemSchema],
    subtotal: Number,
    discount: { type: Number, default: 0 }, // extra discount on the whole invoice
    total: Number,
    paidAmount: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer'], default: 'cash' },
    dueAmount: { type: Number, default: 0 }, // added to supplier payable
    status: { type: String, enum: ['received', 'partially_returned', 'returned'], default: 'received' },
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);
