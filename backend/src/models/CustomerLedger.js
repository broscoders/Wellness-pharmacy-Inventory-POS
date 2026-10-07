const mongoose = require('mongoose');

// amount > 0 : customer owes more (credit sale). amount < 0 : customer owes less (payment / return adjustment).
const schema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    type: { type: String, enum: ['sale_credit', 'payment', 'return_adjust', 'sale_cancel', 'opening', 'adjustment'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    method: String,
    note: String,
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    invoiceNo: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.models.CustomerLedger || mongoose.model('CustomerLedger', schema);
