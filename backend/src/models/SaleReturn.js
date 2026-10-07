const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    returnNo: { type: String, unique: true },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    invoiceNo: String,
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    items: [
      {
        saleItem: mongoose.Schema.Types.ObjectId,
        medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
        name: String,
        batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
        batchNumber: String,
        baseQty: Number,
        refund: Number,
        cost: Number,
      },
    ],
    refundAmount: Number, // total value of returned goods
    cashRefund: Number, // money handed back
    creditAdjusted: { type: Number, default: 0 }, // deducted from customer's udhaar
    reason: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.SaleReturn || mongoose.model('SaleReturn', schema);
