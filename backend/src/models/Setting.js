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
    maxDiscountPercent: { type: Number, default: 10, min: 0, max: 100 }, // biggest discount (as % of a bill) anyone without the owner's rights can give
    defaultCreditLimit: { type: Number, default: 5000, min: 0 }, // udhaar limit given to customers added by staff who cannot set limits (0 = no limit)
    lastBackupAt: Date, // set when the owner downloads a backup from the app; drives the reminder
    receiptFooter: { type: String, trim: true, maxlength: 200, default: 'Thank you! Medicines once sold can be returned only with this receipt.' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Setting || mongoose.model('Setting', schema);
