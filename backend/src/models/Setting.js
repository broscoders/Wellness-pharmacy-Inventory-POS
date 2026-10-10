const mongoose = require('mongoose');

// One document for the whole pharmacy (shop identity shown on receipts and reports).
const schema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    shopName: { type: String, trim: true, maxlength: 80, default: 'Wellness Pharmacy' },
    tagline: { type: String, trim: true, maxlength: 100, default: '' },
    address: { type: String, trim: true, maxlength: 200, default: '' },
    phone: { type: String, trim: true, maxlength: 60, default: '' },
    email: { type: String, trim: true, maxlength: 80, default: '' },
    licenseNo: { type: String, trim: true, maxlength: 60, default: '' }, // drug sale license
    ntn: { type: String, trim: true, maxlength: 40, default: '' },
    receiptFooter: { type: String, trim: true, maxlength: 200, default: 'Thank you! Medicines once sold can be returned only with this receipt.' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Setting || mongoose.model('Setting', schema);
