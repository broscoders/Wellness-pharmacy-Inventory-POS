const mongoose = require('mongoose');

// Atomic sequence generator (invoice numbers, return numbers...).
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });

module.exports = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
