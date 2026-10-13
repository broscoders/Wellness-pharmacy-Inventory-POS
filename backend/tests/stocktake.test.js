// Stock take (physical count) on a THROWAWAY database.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
const DB = 'wellness_take_test';
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const StockMovement = require('../src/models/StockMovement');

test('stock take', async (t) => {
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
  for (const [name, role] of [['Owner', 'admin'], ['Cash', 'cashier'], ['Stock', 'inventory'], ['Pharma', 'pharmacist']]) await User.create({ name, email: `${role}@t.com`, password: 'Passw0rd!x', role });
  const login = async (role) => (await call('POST', '/auth/login', { email: `${role}@t.com`, password: 'Passw0rd!x' })).accessToken;
  const owner = await login('admin'); const cashier = await login('cashier'); const pharmacist = await login('inventory'); // purchasing/stock staff do the counting
  const pharmacistNoRights = await login('pharmacist');

  const mk = async (name, rack, row) => (await call('POST', '/medicines', { name, stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePrice: { box: 500, strip: 55, unit: 6 }, rack, row }, owner)).data;
  const a = await mk('Count Alpha', 'A', '1'); const b = await mk('Count Beta', 'A', '2'); const c = await mk('Count Gamma', 'B', '1'); const d = await mk('Count Delta');
  const stock = async (m, n, days, unit) => (await call('POST', '/inventory/batches', { medicine: m._id, batchNumber: n, expiryDate: day(days), quantity: { unit } }, owner)).data;
  const [ba, bb, bc, bd] = [await stock(a, 'A1', 200, 100), await stock(b, 'B1', 200, 50), await stock(c, 'C1', 200, 30), await stock(d, 'D1', 200, 10)];
  const sheet = async (q, tk = pharmacist) => (await call('GET', `/inventory/stock-take${q}`, null, tk));

  await t.test('the counting sheet is by rack, and it never shows the system quantity', async () => {
    const r = await sheet('?rack=A');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.map((x) => x.medicine.name), ['Count Alpha', 'Count Beta']);
    assert.ok(r.data.every((x) => !('quantity' in x) && !('system' in x) && !JSON.stringify(x).includes('"quantity"')), 'blind counting: no quantities on the sheet');
    assert.deepStrictEqual((await sheet('?rack=b')).data.map((x) => x.medicine.name), ['Count Gamma']); // rack match ignores case
    assert.deepStrictEqual((await sheet('?rack=__none__')).data.map((x) => x.medicine.name), ['Count Delta']); // medicines with no rack set
    assert.strictEqual((await sheet('?rack=A', cashier)).status, 403);
    assert.strictEqual((await sheet('?rack=A', pharmacistNoRights)).status, 403); // changing stock is for the owner and stock staff
  });

  await t.test('review shows differences without changing anything', async () => {
    const r = await call('POST', '/inventory/stock-take', { note: 'Rack A count', lines: [{ batch: ba._id, counted: 95 }, { batch: bb._id, counted: 50 }] }, pharmacist);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.applied, false);
    assert.deepStrictEqual(r.data.map((x) => [x.system, x.counted, x.difference]), [[100, 95, -5], [50, 50, 0]]);
    assert.deepStrictEqual([r.totals.matched, r.totals.short, r.totals.over], [1, 1, 0]);
    assert.strictEqual((await Batch.findById(ba._id)).quantity, 100); // untouched
    const owned = await call('POST', '/inventory/stock-take', { note: 'Rack A count', lines: [{ batch: ba._id, counted: 95 }] }, owner);
    assert.strictEqual(owned.data[0].costValue, -20); // 5 units x Rs 4
    assert.strictEqual(owned.totals.costValue, -20);
  });

  await t.test('applying writes adjustments with the reason, and refuses when stock moved during the count', async () => {
    const lines = [{ batch: ba._id, counted: 95, expected: 100 }, { batch: bb._id, counted: 55, expected: 50 }, { batch: bc._id, counted: 30, expected: 30 }];
    assert.strictEqual((await call('POST', '/inventory/stock-take', { note: 'x', lines, apply: true }, pharmacist)).status, 400); // note too short
    assert.strictEqual((await call('POST', '/inventory/stock-take', { note: 'Monthly count', lines: [{ batch: ba._id, counted: 95 }], apply: true }, pharmacist)).status, 409); // no "expected" = not reviewed
    // someone sells 10 units of Alpha while the pharmacist is still counting
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: a._id, unitType: 'unit', quantity: 10 }], payments: [{ method: 'cash', amount: 60 }] }, owner)).status, 201);
    const stale = await call('POST', '/inventory/stock-take', { note: 'Monthly count', lines, apply: true }, pharmacist);
    assert.strictEqual(stale.status, 409);
    assert.match(stale.message, /Stock changed while you were counting/);
    assert.strictEqual((await Batch.findById(bb._id)).quantity, 50, 'nothing was applied');

    // review again against the new numbers, then apply
    const fresh = await call('POST', '/inventory/stock-take', { note: 'Monthly count', lines: [{ batch: ba._id, counted: 85 }, { batch: bb._id, counted: 55 }, { batch: bc._id, counted: 30 }] }, pharmacist);
    assert.deepStrictEqual(fresh.data.map((x) => x.system), [90, 50, 30]);
    const ok = await call('POST', '/inventory/stock-take', { note: 'Monthly count', apply: true, lines: fresh.data.map((x) => ({ batch: x.batch, counted: x.counted, expected: x.system })) }, pharmacist);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.adjusted, 2);
    assert.deepStrictEqual([(await Batch.findById(ba._id)).quantity, (await Batch.findById(bb._id)).quantity, (await Batch.findById(bc._id)).quantity], [85, 55, 30]);
    const moves = await StockMovement.find({ type: 'adjustment' }).sort({ createdAt: 1 });
    assert.strictEqual(moves.length, 2);
    assert.ok(moves.every((m) => m.reason === 'Stock take: Monthly count'));
    assert.deepStrictEqual(moves.map((m) => m.quantity).sort((x, y) => x - y), [-5, 5]);
    // counting the same thing again changes nothing
    const again = await call('POST', '/inventory/stock-take', { note: 'Recount', apply: true, lines: [{ batch: ba._id, counted: 85, expected: 85 }] }, pharmacist);
    assert.strictEqual(again.adjusted, 0);
    assert.strictEqual((await call('POST', '/inventory/stock-take', { note: 'dup', lines: [{ batch: ba._id, counted: 1 }, { batch: ba._id, counted: 2 }] }, pharmacist)).status, 400);
  });
});
