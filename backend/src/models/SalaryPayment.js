const mongoose = require('mongoose');

// Every rupee paid to staff. Each payment also creates an Expense (category "salaries"), so profit is always right.
// Payments are voided with a reason, never deleted.
const schema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    employeeName: String,
    month: { type: String, required: true, index: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ }, // the salary month it belongs to
    kind: { type: String, enum: ['salary', 'advance', 'bonus'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ['cash', 'card', 'bank_transfer'], default: 'cash' },
    note: { type: String, maxlength: 150 },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
    isVoided: { type: Boolean, default: false, index: true },
    voidReason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.SalaryPayment || mongoose.model('SalaryPayment', schema);
