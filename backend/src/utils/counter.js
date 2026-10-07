const Counter = require('../models/Counter');

async function nextNumber(key, prefix, pad = 6) {
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return `${prefix}-${String(c.seq).padStart(pad, '0')}`;
}

module.exports = { nextNumber };
