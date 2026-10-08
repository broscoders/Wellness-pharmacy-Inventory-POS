const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    rxNo: { type: String, unique: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerName: { type: String, trim: true }, // also filled for walk-in patients without a customer record
    prescriptionDate: { type: Date, default: Date.now, index: true },
    doctorName: { type: String, trim: true, maxlength: 120, index: true },
    reference: { type: String, trim: true, maxlength: 80 }, // doctor's own prescription / registration reference
    items: [
      {
        medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
        name: { type: String, trim: true, required: true },
        dosage: { type: String, trim: true },
        instructions: { type: String, trim: true },
      },
    ],
    notes: { type: String, trim: true, maxlength: 500 },
    hasFile: { type: Boolean, default: false },
    fileName: String,
    sales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sale' }], // invoices that used this prescription
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Prescription || mongoose.model('Prescription', schema);
