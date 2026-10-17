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

    // Where it sits in the shop, so anyone can find it quickly: "Rack A, Row 3, Left side"
    rack: { type: String, trim: true, maxlength: 40 },
    row: { type: String, trim: true, maxlength: 40 },
    side: { type: String, trim: true, maxlength: 40 },
    dosageForm: { type: String, trim: true, maxlength: 40 }, // Tablet, Capsule, Syrup, Injection, Cream, Drops...
    storage: { type: String, enum: ['room', 'cool', 'fridge'], default: 'room' }, // fridge items must never be left out
    mrp: { type: Number, min: 0, default: 0 }, // printed maximum retail price per BOX; selling above it is not allowed

    minStockLevel: { type: Number, min: 0, default: 0 }, // in base units: below this the medicine is "low" and is put on the reorder list
    maxStockLevel: { type: Number, min: 0, default: 0 }, // in base units: reorders top up to this level; stock above it is "over stock". 0 = not set (twice the minimum is used)
    requiresPrescription: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Medicine || mongoose.model('Medicine', medicineSchema);
