const mongoose = require('mongoose');

// Prescription photo/PDF. Stored in MongoDB because serverless hosting (Vercel) has no permanent disk.
const schema = new mongoose.Schema(
  {
    prescription: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', required: true, unique: true },
    name: String,
    mimeType: { type: String, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.PrescriptionFile || mongoose.model('PrescriptionFile', schema);
