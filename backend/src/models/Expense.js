const mongoose = require('mongoose');

const CATEGORIES = ['rent', 'electricity', 'salaries', 'internet', 'delivery', 'maintenance', 'other'];

const schema = new mongoose.Schema(
  {
    expenseNo: { type: String, unique: true },
    category: { type: String, enum: CATEGORIES, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, default: Date.now, index: true },
    description: { type: String, trim: true, maxlength: 200 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer'], default: 'cash' },
    // Expenses are never deleted: they are voided with a reason so the books stay traceable.
    isVoided: { type: Boolean, default: false, index: true },
    voidReason: String,
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Expense || mongoose.model('Expense', schema);
module.exports.CATEGORIES = CATEGORIES;
