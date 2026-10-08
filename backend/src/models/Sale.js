const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  line: Number, // cart line index (a cart line can be split over several batches by FEFO)
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  name: String,
  batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  batchNumber: String,
  expiryDate: Date,
  unitType: { type: String, enum: ['box', 'strip', 'unit'] }, // how the cashier sold it
  cartQty: Number, // quantity typed by the cashier for the whole cart line, in unitType (for receipts)
  baseQty: { type: Number, required: true }, // quantity in base units (tablets)
  returnedBase: { type: Number, default: 0 },
  pricePerBase: Number,
  lineTotal: Number, // before invoice discount
  netTotal: Number, // after proportional share of invoice discount
  costTotal: Number, // purchase cost of the units sold (for profit)
});

const paymentSchema = new mongoose.Schema(
  { method: { type: String, enum: ['cash', 'card', 'bank_transfer', 'credit'], required: true }, amount: { type: Number, required: true, min: 0 } },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, unique: true, index: true },
    type: { type: String, enum: ['retail', 'wholesale'], default: 'retail' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerName: String,
    items: [itemSchema],
    subtotal: Number,
    discount: { type: Number, default: 0 },
    total: Number,
    payments: [paymentSchema],
    paidAmount: Number, // money received (cash/card/bank) kept after change
    creditAmount: { type: Number, default: 0 }, // udhaar added to customer ledger
    changeGiven: { type: Number, default: 0 },
    status: { type: String, enum: ['completed', 'partially_returned', 'returned', 'cancelled'], default: 'completed', index: true },
    notes: String,
    prescription: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
    cancelReason: String,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    createdByName: String,
  },
  { timestamps: true }
);

saleSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
