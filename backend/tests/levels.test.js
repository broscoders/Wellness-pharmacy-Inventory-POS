// Minimum / maximum stock levels, reorder to the maximum, over-stock alerts and sales-based suggestions, on a THROWAWAY database.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
const DB = 'wellness_levels_test';
const app = require('../src/app');
const User = require('../src/models/User');
const Medicine = require('../src/models/Medicine');
const { suggestLevels } = require('../src/services/levels.service');

test('suggestLevels: a week for the minimum, a month for the maximum, whole strips', () => {
  const med = { stripsPerBox: 10, unitsPerStrip: 10 };
  assert.strictEqual(suggestLevels(med, 0), null);                       // never sold: no advice
  // 120 goli in 60 days = 2 a day -> min 14 -> 20 (2 strips), max 60 (6 strips)
  assert.deepStrictEqual(suggestLevels(med, 120), { perDay: 2, min: 20, max: 60 });
  // a very slow medicine still gets one strip, and a maximum above it
  const slow = suggestLevels(med, 3);
  assert.strictEqual(slow.min, 10); assert.ok(slow.max >= slow.min + 10);
  // single bottles: no strips, rounding is to whole units
  assert.deepStrictEqual(suggestLevels({ stripsPerBox: 1, unitsPerStrip: 1 }, 60), { perDay: 1, min: 7, max: 30 });
});

test('levels through the API', async (t) => {
  const uri = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);
  process.env.MONGODB_URI = uri;
  require('../src/config/env').mongoUri = uri;
  await require('../src/config/db')();
  if (mongoose.connection.name !== DB) { await mongoose.disconnect(); throw new Error(`Refusing to run: connected to "${mongoose.connection.name}"`); }
  await mongoose.connection.dropDatabase();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { server.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const call = async (method, path, body, tk) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tk && { Authorization: `Bearer ${tk}` }) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await User.create({ name: 'Owner', email: 'o@t.com', password: 'Owner@12345', role: 'admin' });
  await User.create({ name: 'Cash', email: 'c@t.com', password: 'Cashier@123', role: 'cashier' });
  const owner = (await call('POST', '/auth/login', { email: 'o@t.com', password: 'Owner@12345' })).accessToken;
  const cashier = (await call('POST', '/auth/login', { email: 'c@t.com', password: 'Cashier@123' })).accessToken;
  const mk = async (name, extra = {}) => (await call('POST', '/medicines', { name, stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePrice: { box: 500, strip: 55, unit: 6 }, ...extra }, owner));
  const stock = (m, unit) => call('POST', '/inventory/batches', { medicine: m._id, batchNumber: `B${Math.random().toString(16).slice(2, 6)}`, expiryDate: day(300), quantity: { unit } }, owner);

  await t.test('a maximum below the minimum is refused (create and update); 0 means not set', async () => {
    assert.strictEqual((await mk('Bad Levels', { minStockLevel: 100, maxStockLevel: 50 })).status, 400);
    const ok = await mk('Good Levels', { minStockLevel: 50, maxStockLevel: 200 });
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(ok.data.maxStockLevel, 200);
    assert.strictEqual((await call('PATCH', `/medicines/${ok.data._id}`, { maxStockLevel: 10 }, owner)).status, 400); // under the stored minimum of 50
    assert.strictEqual((await call('PATCH', `/medicines/${ok.data._id}`, { minStockLevel: 300 }, owner)).status, 400); // above the stored maximum
    assert.strictEqual((await call('PATCH', `/medicines/${ok.data._id}`, { minStockLevel: 80, maxStockLevel: 400 }, owner)).status, 200);
    assert.strictEqual((await mk('No Max', { minStockLevel: 500 })).status, 201);                                    // max not set: fine
  });

  await t.test('reorder tops up to the MAXIMUM when one is set, otherwise to twice the minimum', async () => {
    const withMax = (await mk('With Max', { minStockLevel: 100, maxStockLevel: 1000 })).data;   // 1000 goli = 10 boxes
    const noMax = (await mk('Without Max', { minStockLevel: 100 })).data;                        // twice 100 = 200 goli -> 1 box minimum
    await stock(withMax, 50); await stock(noMax, 50);                                            // both below their minimum
    const r = await call('GET', '/inventory/reorder', null, owner);
    const items = r.data.flatMap((g) => g.items);
    assert.strictEqual(items.find((i) => i.name === 'With Max').suggestedBoxes, 10);   // (1000 - 50) / 100 = 9.5 -> 10 boxes
    assert.strictEqual(items.find((i) => i.name === 'Without Max').suggestedBoxes, 2); // (200 - 50) / 100 = 1.5 -> 2 boxes
  });

  await t.test('stock above the maximum is flagged as over stock', async () => {
    const heavy = (await mk('Heavy Stock', { minStockLevel: 20, maxStockLevel: 100 })).data;
    await stock(heavy, 450);
    const a = await call('GET', '/inventory/alerts', null, owner);
    const row = a.data.overStock.find((x) => x.name === 'Heavy Stock');
    assert.ok(row);
    assert.strictEqual(row.excess, 350);
    assert.ok(a.counts.overStock >= 1);
    assert.ok(!a.data.lowStock.some((x) => x.name === 'Heavy Stock'));
  });

  await t.test('suggestions come from real sales; applying recomputes on the server', async () => {
    const seller = (await mk('Fast Mover', { minStockLevel: 1 })).data;
    await stock(seller, 5000);
    // 120 goli sold now = 2 a day over the 60-day window
    for (let i = 0; i < 4; i++) assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: seller._id, unitType: 'unit', quantity: 30 }], payments: [{ method: 'cash', amount: 180 }] }, owner)).status, 201);
    const one = await call('GET', `/medicines/${seller._id}/stock-advice`, null, owner);
    assert.deepStrictEqual(one.suggestion, { perDay: 2, min: 20, max: 60 });
    assert.strictEqual(one.sold, 120);
    const none = (await mk('Never Sold')).data;
    assert.strictEqual((await call('GET', `/medicines/${none._id}/stock-advice`, null, owner)).suggestion, null);

    const prev = await call('GET', '/medicines/levels', null, owner);
    assert.strictEqual(prev.status, 200);
    const row = prev.data.find((x) => x.name === 'Fast Mover');
    assert.deepStrictEqual([row.current.min, row.suggested.min, row.suggested.max, row.changed], [1, 20, 60, true]);
    assert.ok(!prev.data.some((x) => x.name === 'Never Sold'));   // no sales, no advice

    assert.strictEqual((await call('GET', '/medicines/levels', null, cashier)).status, 403);
    assert.strictEqual((await call('POST', '/medicines/levels', { ids: [seller._id] }, cashier)).status, 403);
    const done = await call('POST', '/medicines/levels', { ids: [seller._id, none._id] }, owner);   // 'none' has no advice: ignored
    assert.strictEqual(done.applied, 1);
    const after = await Medicine.findById(seller._id).lean();
    assert.deepStrictEqual([after.minStockLevel, after.maxStockLevel], [20, 60]);
    assert.strictEqual((await Medicine.findById(none._id).lean()).maxStockLevel, 0);
    assert.strictEqual((await call('GET', '/medicines/levels', null, owner)).data.find((x) => x.name === 'Fast Mover').changed, false); // already applied
  });

  await t.test('importing from a file keeps the maximum and refuses a maximum below the minimum', async () => {
    const row = (name, min, max) => ({ name, stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePriceBox: 500, minStock: min, maxStock: max });
    const r = await call('POST', '/medicines/import', { rows: [row('Imported Fine', 100, 400), row('Imported Wrong', 100, 50)], dryRun: false }, owner);
    assert.strictEqual(r.status, 200);
    const fine = await Medicine.findOne({ name: 'Imported Fine' }).lean();
    assert.deepStrictEqual([fine.minStockLevel, fine.maxStockLevel], [100, 400]);
    assert.strictEqual(await Medicine.countDocuments({ name: 'Imported Wrong' }), 0);               // refused, not half-imported
    const wrong = JSON.stringify(r.rows);
    assert.match(wrong, /Maximum stock is lower than the minimum/);
  });
});

