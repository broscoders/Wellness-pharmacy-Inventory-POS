// POS catalog + idempotent checkout. Runs the real Express app against a THROWAWAY database
// (wellness_catalog_test) that is dropped at the end. It refuses to run against any other database.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
const DB = 'wellness_catalog_test';
const PERF_N = Number(process.env.PERF_N || 1000); // PERF_N=5000 npm test for the full-size check

const app = require('../src/app');
const User = require('../src/models/User');
const Medicine = require('../src/models/Medicine');
const Batch = require('../src/models/Batch');

test('POS catalog and idempotent checkout', async (t) => {
  const uri = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);
  process.env.MONGODB_URI = uri;
  require('../src/config/env').mongoUri = uri;
  await require('../src/config/db')();
  if (mongoose.connection.name !== DB) {
    await mongoose.disconnect();
    throw new Error(`Refusing to run: connected to "${mongoose.connection.name}", expected "${DB}"`);
  }
  await mongoose.connection.dropDatabase();
  await Promise.all([require('../src/models/Sale'), Medicine, Batch].map((m) => m.createIndexes())); // dropDatabase also dropped the indexes (unique clientId/invoiceNo); a real server builds them at start-up
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { server.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  const call = async (method, path, body, tk) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tk && { Authorization: `Bearer ${tk}` }) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  await User.create({ name: 'Owner', email: 'owner@t.com', password: 'Owner@12345', role: 'admin' });
  const token = (await call('POST', '/auth/login', { email: 'owner@t.com', password: 'Owner@12345' })).accessToken;
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  const mk = async (name, extra = {}) => (await call('POST', '/medicines', { name, stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePrice: { box: 500, strip: 55, unit: 6 }, ...extra }, token)).data;
  const stock = (med, n, d, unit) => call('POST', '/inventory/batches', { medicine: med._id, batchNumber: n, expiryDate: day(d), quantity: { unit } }, token);

  const a = await mk('Catalog Alpha', { barcode: '111111', genericName: 'Alphamol' });
  const b = await mk('Catalog Beta');
  const c = await mk('Catalog Gamma');
  await stock(a, 'A1', 30, 100); await stock(a, 'A2', 300, 50); await stock(a, 'AX', -5, 10); // AX already expired
  await stock(b, 'B1', 100, 40);

  await t.test('requires login', async () => {
    assert.strictEqual((await call('GET', '/medicines/catalog')).status, 401);
  });

  let first;
  await t.test('full catalog is compact and carries live batches', async () => {
    first = await call('GET', '/medicines/catalog', null, token);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.mode, 'full');
    assert.strictEqual(first.data.length, 3);
    const alpha = first.data.find((m) => m.name === 'Catalog Alpha');
    assert.strictEqual(alpha.barcode, '111111');
    assert.strictEqual(alpha.salePrice.strip, 55);
    // batches are [quantity, expiryMs]; the expired batch is still listed so the browser can show it as expired
    assert.strictEqual(alpha.batches.length, 3);
    assert.ok(alpha.batches.every((x) => Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'number'));
    const sellable = alpha.batches.filter(([, e]) => e > Date.now()).reduce((s, [q]) => s + q, 0);
    assert.strictEqual(sellable, 150);
    assert.deepStrictEqual(first.data.find((m) => m.name === 'Catalog Gamma').batches, []); // no stock
    assert.ok(first.serverTime && Array.isArray(first.categories));
  });

  await t.test('delta returns only what changed, and removed ids for deactivated medicines', async () => {
    const since = first.serverTime;
    await new Promise((r) => setTimeout(r, 15));
    const none = await call('GET', `/medicines/catalog?since=${encodeURIComponent(since)}`, null, token);
    assert.strictEqual(none.mode, 'delta');
    assert.strictEqual(none.data.length, 0);

    // a sale changes the stock of Alpha only
    const sale = await call('POST', '/sales', { items: [{ medicine: a._id, unitType: 'unit', quantity: 5 }], payments: [{ method: 'cash', amount: 30 }] }, token);
    assert.strictEqual(sale.status, 201);
    const d1 = await call('GET', `/medicines/catalog?since=${encodeURIComponent(since)}`, null, token);
    assert.deepStrictEqual(d1.data.map((m) => m.name), ['Catalog Alpha']);
    const left = d1.data[0].batches.filter(([, e]) => e > Date.now()).reduce((s, [q]) => s + q, 0);
    assert.strictEqual(left, 145);

    // deactivating a medicine shows up as removed, a price edit shows up as a changed medicine
    await call('DELETE', `/medicines/${b._id}`, null, token);
    await call('PATCH', `/medicines/${c._id}`, { salePrice: { box: 900 } }, token);
    const d2 = await call('GET', `/medicines/catalog?since=${encodeURIComponent(since)}`, null, token);
    assert.deepStrictEqual(d2.removed, [String(b._id)]);
    assert.ok(d2.data.some((m) => m.name === 'Catalog Gamma' && m.salePrice.box === 900));
    assert.ok(!d2.data.some((m) => m.name === 'Catalog Beta'));
    assert.strictEqual((await call('GET', '/medicines/catalog?since=garbage', null, token)).status, 400);
  });

  await t.test('a retried bill (same clientId) is saved once and stock moves once', async () => {
    const body = { clientId: 'bill-retry-0001', items: [{ medicine: a._id, unitType: 'unit', quantity: 10 }], payments: [{ method: 'cash', amount: 60 }] };
    const r1 = await call('POST', '/sales', body, token);
    const r2 = await call('POST', '/sales', body, token);
    assert.strictEqual(r1.status, 201);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.duplicate, true);
    assert.strictEqual(r2.data.invoiceNo, r1.data.invoiceNo);
    const med = (await call('GET', `/medicines/${a._id}`, null, token)).data;
    assert.strictEqual(med.stock.sellable, 135);
  });

  await t.test('two identical requests at the same moment still make one bill', async () => {
    const body = { clientId: 'bill-race-00001', items: [{ medicine: a._id, unitType: 'unit', quantity: 10 }], payments: [{ method: 'cash', amount: 60 }] };
    const [x, y] = await Promise.all([call('POST', '/sales', body, token), call('POST', '/sales', body, token)]);
    assert.ok([x.status, y.status].every((s) => s === 200 || s === 201), `statuses ${x.status}/${y.status}`);
    assert.strictEqual(x.data.invoiceNo, y.data.invoiceNo);
    const Sale = require('../src/models/Sale');
    const StockMovement = require('../src/models/StockMovement');
    assert.strictEqual(await Sale.countDocuments({ clientId: 'bill-race-00001' }), 1, 'exactly one bill saved');
    assert.strictEqual(await StockMovement.countDocuments({ refId: x.data._id }), 1, 'exactly one stock history row');
    // Exact stock after truly simultaneous writes needs MongoDB's atomic $inc. FerretDB (used only to run these tests
    // where no MongoDB is installed) loses concurrent $inc updates, so this one check runs on real MongoDB / Atlas only.
    const info = await mongoose.connection.db.admin().command({ buildInfo: 1 }).catch(() => ({}));
    if (info.ferretdbVersion) { console.log('      (stock-after-race check skipped: FerretDB is not atomic under concurrent $inc)'); return; }
    const med = (await call('GET', `/medicines/${a._id}`, null, token)).data;
    assert.strictEqual(med.stock.sellable, 125);
  });

  await t.test('speed: a large catalog loads in one request', async () => {
    const docs = Array.from({ length: PERF_N }, (_, i) => ({ name: `Speed Medicine ${String(i).padStart(4, '0')}`, genericName: `Generic ${i % 300}`, manufacturer: `Maker ${i % 40}`, barcode: `99${String(i).padStart(8, '0')}`, stripsPerBox: 10, unitsPerStrip: 10, salePrice: { box: 500, strip: 55, unit: 6 } }));
    const inserted = await Medicine.insertMany(docs);
    await Batch.insertMany(inserted.flatMap((m, i) => [
      { medicine: m._id, batchNumber: 'S1', expiryDate: new Date(Date.now() + (60 + (i % 400)) * 86400000), quantity: 100 + (i % 50) },
      { medicine: m._id, batchNumber: 'S2', expiryDate: new Date(Date.now() + 500 * 86400000), quantity: 200 },
    ]));
    const t0 = Date.now();
    const res = await fetch(`${base}/medicines/catalog`, { headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' } });
    const text = await res.text();
    const ms = Date.now() - t0;
    const json = JSON.parse(text);
    console.log(`      catalog: ${json.data.length} medicines, ${(text.length / 1024).toFixed(0)} KB (uncompressed), ${ms} ms on this machine`);
    assert.ok(json.data.length >= PERF_N);
    assert.ok(ms < 5000, `catalog took ${ms} ms`);
  });
});
