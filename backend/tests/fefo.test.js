// Integration test for FEFO + atomic stock movement. Needs MONGODB_URI (uses a throwaway database name).
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'x'; process.env.JWT_REFRESH_SECRET ||= 'y';
const Medicine = require('../src/models/Medicine');
const Batch = require('../src/models/Batch');
const { allocateFEFO, applyMovement } = require('../src/services/stock.service');

const DAY = 86400000;

test('FEFO picks earliest expiry first, skips expired, and never oversells', async (t) => {
  const uri = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, '/wellness_fefo_test$1');
  await mongoose.connect(uri);
  // Safety guard: this test drops its database at the end, so it must NEVER run on a real one.
  if (mongoose.connection.name !== 'wellness_fefo_test') {
    await mongoose.disconnect();
    throw new Error(`Refusing to run: connected to "${mongoose.connection.name}", expected "wellness_fefo_test"`);
  }
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  const med = await Medicine.create({ name: 'FEFO Test', stripsPerBox: 10, unitsPerStrip: 10 });
  const mk = (n, days, q) => Batch.create({ medicine: med._id, batchNumber: n, expiryDate: new Date(Date.now() + days * DAY), quantity: q });
  await mk('EXPIRED', -5, 500);
  const late = await mk('LATE', 300, 100);
  const soon = await mk('SOON', 30, 40);

  const plan = await allocateFEFO(med._id, 60);
  assert.deepStrictEqual(plan.map((p) => [p.batch.batchNumber, p.quantity]), [['SOON', 40], ['LATE', 20]]);

  // 640 exists in total but only 140 is sellable (expired batch excluded)
  await assert.rejects(() => allocateFEFO(med._id, 200), /Insufficient non-expired stock/);

  // Concurrency check: two parallel removals of 30 from a 40-unit batch -> exactly one may succeed.
  // The FerretDB emulator used for offline development does not give MongoDB's single-document
  // atomicity guarantee, so this check only runs against a real MongoDB / Atlas server.
  const info = await mongoose.connection.db.admin().command({ buildInfo: 1 });
  if (info.ferretdbVersion) {
    t.diagnostic('FerretDB detected: concurrency assertion skipped (run against real MongoDB/Atlas)');
    return;
  }
  const results = await Promise.allSettled([
    applyMovement({ batchId: soon._id, delta: -30, type: 'sale' }),
    applyMovement({ batchId: soon._id, delta: -30, type: 'sale' }),
  ]);
  assert.strictEqual(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.strictEqual((await Batch.findById(soon._id)).quantity, 10);
  assert.strictEqual((await Batch.findById(late._id)).quantity, 100);
});
