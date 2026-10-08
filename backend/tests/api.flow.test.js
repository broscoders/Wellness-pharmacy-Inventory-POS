// End-to-end API flow test. Runs the real Express app against a THROWAWAY database
// (wellness_api_test) which is dropped at the end. It refuses to run against any other database.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
const DB = 'wellness_api_test';

const app = require('../src/app');
const User = require('../src/models/User');

test('pharmacy API: auth, FEFO sales, returns, credit, purchases, reports', async (t) => {
  const uri = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);
  process.env.MONGODB_URI = uri;
  require('../src/config/env').mongoUri = uri;
  await require('../src/config/db')();
  if (mongoose.connection.name !== DB) {
    await mongoose.disconnect();
    throw new Error(`Refusing to run: connected to "${mongoose.connection.name}", expected "${DB}"`);
  }
  await mongoose.connection.dropDatabase();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { server.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  let token = '';
  const call = async (method, path, body, tk = token) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tk && { Authorization: `Bearer ${tk}` }) }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  };
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  await User.create({ name: 'Owner', email: 'owner@t.com', password: 'Owner@12345', role: 'admin' });
  await User.create({ name: 'Cash', email: 'cash@t.com', password: 'Cashier@123', role: 'cashier' });

  await t.test('auth and permissions', async () => {
    assert.strictEqual((await call('POST', '/auth/login', { email: 'owner@t.com', password: 'bad' }, '')).status, 401);
    assert.strictEqual((await call('GET', '/customers', null, '')).status, 401);
    token = (await call('POST', '/auth/login', { email: 'owner@t.com', password: 'Owner@12345' }, '')).accessToken;
    assert.ok(token);
    const cash = (await call('POST', '/auth/login', { email: 'cash@t.com', password: 'Cashier@123' }, '')).accessToken;
    assert.strictEqual((await call('GET', '/users', null, cash)).status, 403);
    assert.strictEqual((await call('GET', '/reports/sales', null, cash)).status, 403);
    assert.strictEqual((await call('POST', '/medicines', { name: 'X' }, cash)).status, 403);
  });

  let med; let batches = {};
  await t.test('medicine + batches, expired stock is not sellable', async () => {
    med = (await call('POST', '/medicines', { name: 'Flow Med', stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePrice: { box: 500, strip: 55, unit: 6 }, wholesalePrice: { box: 450 } })).data;
    const mk = async (n, d, unit) => (await call('POST', '/inventory/batches', { medicine: med._id, batchNumber: n, expiryDate: day(d), quantity: { unit } })).data;
    batches.A = await mk('A', 20, 100); batches.B = await mk('B', 200, 200); batches.X = await mk('X', -3, 50);
    const m = (await call('GET', `/medicines/${med._id}`)).data;
    assert.strictEqual(m.stock.sellable, 300); assert.strictEqual(m.stock.expired, 50);
  });

  const stock = async () => (await call('GET', `/medicines/${med._id}`)).data.stock.sellable;

  let sale1;
  await t.test('FEFO sale splits across batches, change is returned, oversell is rejected', async () => {
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 1 }], payments: [{ method: 'cash', amount: 10 }] })).status, 400); // short payment
    const r = await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'box', quantity: 2 }], payments: [{ method: 'cash', amount: 1100 }] });
    assert.strictEqual(r.status, 201);
    sale1 = r.data;
    assert.strictEqual(sale1.total, 1000); assert.strictEqual(sale1.changeGiven, 100);
    assert.deepStrictEqual(sale1.items.map((i) => [i.batchNumber, i.baseQty]), [['A', 100], ['B', 100]]); // earliest expiry first
    assert.strictEqual(await stock(), 100);
    const over = await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 1 }, { medicine: med._id, unitType: 'box', quantity: 5 }], payments: [{ method: 'cash', amount: 99999 }] });
    assert.strictEqual(over.status, 400);
    assert.strictEqual(await stock(), 100, 'failed multi-line sale must roll back the first line');
  });

  await t.test('return restores stock to the same batch; over-return rejected', async () => {
    const item = sale1.items[0];
    const r = await call('POST', `/sales/${sale1._id}/return`, { items: [{ saleItem: item._id, unitType: 'strip', quantity: 2 }], reason: 'test return' });
    assert.strictEqual(r.status, 201); assert.strictEqual(r.data.refundAmount, 100); // 2 strips = 20 units at the box rate of 5 each
    assert.strictEqual(await stock(), 120);
    const again = await call('POST', `/sales/${sale1._id}/return`, { items: [{ saleItem: item._id, unitType: 'unit', quantity: 90 }], reason: 'too many' });
    assert.strictEqual(again.status, 400);
  });

  await t.test('credit sale, customer ledger, payments', async () => {
    const c = (await call('POST', '/customers', { name: 'Udhaar Cust', creditLimit: 500 })).data;
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 1 }], payments: [{ method: 'credit', amount: 55 }] })).status, 400); // no customer
    const r = await call('POST', '/sales', { customer: c._id, items: [{ medicine: med._id, unitType: 'strip', quantity: 2 }], payments: [{ method: 'cash', amount: 20 }, { method: 'credit', amount: 90 }] });
    assert.strictEqual(r.status, 201); assert.strictEqual(r.data.creditAmount, 90);
    assert.strictEqual((await call('GET', `/customers/${c._id}`)).data.balance, 90);
    assert.strictEqual((await call('POST', `/customers/${c._id}/payments`, { amount: 999 })).status, 400);
    assert.strictEqual((await call('POST', `/customers/${c._id}/payments`, { amount: 40 })).data.balance, 50);
    const big = await call('POST', '/sales', { customer: c._id, items: [{ medicine: med._id, unitType: 'strip', quantity: 9 }], payments: [{ method: 'credit', amount: 495 }] });
    assert.strictEqual(big.status, 400); assert.match(big.message, /limit/i);
  });

  await t.test('cancel restores stock', async () => {
    const before = await stock();
    const r = await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 3 }], payments: [{ method: 'cash', amount: 165 }] });
    assert.strictEqual(await stock(), before - 30);
    assert.strictEqual((await call('POST', `/sales/${r.data._id}/cancel`, { reason: 'changed mind' })).status, 200);
    assert.strictEqual(await stock(), before);
    assert.strictEqual((await call('POST', `/sales/${r.data._id}/cancel`, { reason: 'again' })).status, 400);
  });

  await t.test('purchase, supplier ledger, purchase return', async () => {
    const sup = (await call('POST', '/suppliers', { name: 'Wholesaler' })).data;
    const before = await stock();
    const p = await call('POST', '/purchases', { supplier: sup._id, items: [{ medicine: med._id, batchNumber: 'P1', expiryDate: day(400), quantity: { box: 2 }, pricePerBox: 400 }], paidAmount: 300 });
    assert.strictEqual(p.status, 201); assert.strictEqual(p.data.total, 800); assert.strictEqual(p.data.dueAmount, 500);
    assert.strictEqual(await stock(), before + 200);
    assert.strictEqual((await call('GET', `/suppliers/${sup._id}`)).data.balance, 500);
    assert.strictEqual((await call('POST', `/suppliers/${sup._id}/payments`, { amount: 9999 })).status, 400);
    assert.strictEqual((await call('POST', `/suppliers/${sup._id}/payments`, { amount: 200 })).data.balance, 300);
    const ret = await call('POST', `/purchases/${p.data._id}/return`, { items: [{ purchaseItem: p.data.items[0]._id, quantity: { box: 1 } }], reason: 'damaged' });
    assert.strictEqual(ret.status, 201); assert.strictEqual(ret.data.totalValue, 400);
    // 800 bought - 300 paid - 200 paid - 400 returned = -100 (supplier is now holding 100 of our money)
    assert.strictEqual((await call('GET', `/suppliers/${sup._id}`)).data.balance, -100);
    assert.strictEqual(await stock(), before + 100);
  });

  await t.test('prescription-only medicine needs a prescription', async () => {
    const rxMed = (await call('POST', '/medicines', { name: 'Rx Med', stripsPerBox: 1, unitsPerStrip: 10, requiresPrescription: true, salePrice: { strip: 100 } })).data;
    await call('POST', '/inventory/batches', { medicine: rxMed._id, batchNumber: 'R1', expiryDate: day(300), quantity: { strip: 5 } });
    const body = { items: [{ medicine: rxMed._id, unitType: 'strip', quantity: 1 }], payments: [{ method: 'cash', amount: 100 }] };
    assert.strictEqual((await call('POST', '/sales', body)).status, 400);
    const rx = (await call('POST', '/prescriptions', { doctorName: 'Dr Test', items: [{ name: 'Rx Med' }] })).data;
    assert.strictEqual((await call('POST', '/sales', { ...body, prescription: rx._id })).status, 201);
  });

  await t.test('reports agree with the dashboard', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const dash = (await call('GET', '/dashboard')).data;
    const prof = (await call('GET', `/reports/profit?from=${day(-1)}&to=${day(1)}`)).data;
    const sales = await call('GET', `/reports/sales?from=${day(-1)}&to=${day(1)}`);
    assert.strictEqual(sales.status, 200);
    assert.ok(today);
    assert.strictEqual(Math.round(dash.todayProfit * 100), Math.round(prof.grossProfit * 100));
    assert.strictEqual(Math.round(dash.todaySales * 100), Math.round(prof.netSales * 100));
    const audit = await call('GET', '/audit?limit=5');
    assert.ok(audit.data.length > 0);
  });
});
