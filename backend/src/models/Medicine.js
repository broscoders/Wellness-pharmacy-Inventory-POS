const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema(
  { box: { type: Number, min: 0, default: 0 }, strip: { type: Number, min: 0, default: 0 }, unit: { type: Number, min: 0, default: 0 } },
  { _id: false }
);

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150, index: true },
    genericName: { type: String, trim: true, maxlength: 150, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    manufacturer: { type: String, trim: true, maxlength: 120 },
    barcode: { type: String, trim: true, unique: true, sparse: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },

    // Pack structure. Example: 1 box = 10 strips, 1 strip = 10 tablets
    packType: { type: String, default: 'Box' },
    stripsPerBox: { type: Number, min: 1, default: 1 },
    unitsPerStrip: { type: Number, min: 1, default: 1 },

    purchasePrice: { type: Number, min: 0, default: 0 }, // default cost per BOX
    salePrice: { type: priceSchema, default: () => ({}) }, // retail price per box/strip/unit
    wholesalePrice: { type: priceSchema, default: () => ({}) },

    minStockLevel: { type: Number, min: 0, default: 0 }, // in base units
    requiresPrescription: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Medicine || mongoose.model('Medicine', medicineSchema);
