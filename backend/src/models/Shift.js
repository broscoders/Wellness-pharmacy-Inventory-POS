const mongoose = require('mongoose');

// A cash-drawer shift: one cashier opens it with the cash in the drawer and closes it by counting the cash.
// The system works out what the drawer SHOULD hold; the difference is kept for the owner.
const movementSchema = new mongoose.Schema(
  { type: { type: String, enum: ['in', 'out'], required: true }, amount: { type: Number, required: true, min: 0.01 }, reason: { type: String, required: true, trim: true, maxlength: 150 }, at: { type: Date, default: Date.now } },
  { _id: true }
);

const schema = new mongoose.Schema(
  {
    shiftNo: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: String,
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    // Set only while open. The unique index means one user can never have two open shifts, even if two clicks race.
    openKey: { type: String, unique: true, sparse: true },
    openedAt: { type: Date, default: Date.now, index: true },
    openingCash: { type: Number, required: true, min: 0 },
    movements: [movementSchema],
    closedAt: Date,
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedByName: String,
    countedCash: Number,
    expectedCash: Number,
    difference: Number, // counted - expected: negative = cash missing, positive = extra cash
    notes: String,
    summary: mongoose.Schema.Types.Mixed, // snapshot of the figures at closing time
  },
  { timestamps: true }
);

module.exports = mongoose.models.Shift || mongoose.model('Shift', schema);
