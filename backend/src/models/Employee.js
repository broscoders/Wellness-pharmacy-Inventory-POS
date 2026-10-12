const mongoose = require('mongoose');

// Shop staff for payroll. Separate from login users: a helper or delivery boy can be paid without having a login.
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    designation: { type: String, trim: true, maxlength: 60 }, // Pharmacist, Cashier, Helper, Delivery...
    phone: { type: String, trim: true, maxlength: 30 },
    monthlySalary: { type: Number, required: true, min: 0 },
    joinDate: Date,
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Employee || mongoose.model('Employee', schema);
