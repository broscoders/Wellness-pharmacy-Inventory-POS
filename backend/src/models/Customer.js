const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, index: true },
    phone: { type: String, trim: true, index: true },
    address: { type: String, trim: true },
    type: { type: String, enum: ['retail', 'wholesale'], default: 'retail' },
    notes: { type: String, trim: true },
    // Running udhaar balance the customer owes us. Updated by credit sales/payments (Phase 5).
    balance: { type: Number, default: 0 },
    creditLimit: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
