// Cash closing (shifts) and purchase orders, through the real API on a THROWAWAY database (wellness_ops_test).
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
const DB = 'wellness_ops_test';
const app = require('../src/app');
const User = require('../src/models/User');

test('cash closing and purchase orders', async (t) => {
  const uri = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);
  process.env.MONGODB_URI = uri;
  require('../src/config/env').mongoUri = uri;
  await require('../src/config/db')();
  if (mongoose.connection.name !== DB) { await mongoose.disconnect(); throw new Error(`Refusing to run: connected to "${mongoose.connection.name}"`); }
  await mongoose.connection.dropDatabase();
  await Promise.all([require('../src/models/Shift'), require('../src/models/Sale'), require('../src/models/PurchaseOrder')].map((m) => m.createIndexes()));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { server.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  const call = async (method, path, body, tk) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tk && { Authorization: `Bearer ${tk}` }) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await User.create({ name: 'Owner', email: 'o@t.com', password: 'Owner@12345', role: 'admin' });
  await User.create({ name: 'Cash One', email: 'c1@t.com', password: 'Cashier@123', role: 'cashier' });
  await User.create({ name: 'Cash Two', email: 'c2@t.com', password: 'Cashier@123', role: 'cashier' });
  await User.create({ name: 'Stock', email: 'i@t.com', password: 'Inventory@123', role: 'inventory' });
  const login = async (email, password) => (await call('POST', '/auth/login', { email, password })).accessToken;
  const owner = await login('o@t.com', 'Owner@12345');
  const c1 = await login('c1@t.com', 'Cashier@123');
  const c2 = await login('c2@t.com', 'Cashier@123');
  const inv = await login('i@t.com', 'Inventory@123');

  const med = (await call('POST', '/medicines', { name: 'Shift Med', stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePrice: { box: 500, strip: 55, unit: 6 }, minStockLevel: 50 }, owner)).data;
  await call('POST', '/inventory/batches', { medicine: med._id, batchNumber: 'S1', expiryDate: day(200), quantity: { box: 5 } }, owner);

  await t.test('cash closing: expected cash is built from what the cashier did', async () => {
    assert.strictEqual((await call('GET', '/shifts/current', null, c1)).data, null);
    assert.strictEqual((await call('POST', '/shifts', { openingCash: 1000 }, inv)).status, 403); // inventory role has no cash drawer
    const open = await call('POST', '/shifts', { openingCash: 1000 }, c1);
    assert.strictEqual(open.status, 201);
    assert.strictEqual((await call('POST', '/shifts', { openingCash: 5 }, c1)).status, 409); // second open shift refused
    const sid = open.data._id;

    // sale 1: Rs 550 bill (10 strips), customer gives 600 cash, change 50 -> keeps 550
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 10 }], payments: [{ method: 'cash', amount: 600 }] }, c1)).status, 201);
    // sale 2: Rs 110 by card -> not cash
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 2 }], payments: [{ method: 'card', amount: 110 }] }, c1)).status, 201);
    // a sale by ANOTHER cashier must not count in this drawer
    await call('POST', '/shifts', { openingCash: 0 }, c2);
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 1 }], payments: [{ method: 'cash', amount: 55 }] }, c2)).status, 201);
    // cash taken out for tea, and an expense paid from the drawer is NOT here (c1 has no expense permission); owner expense does not count either
    assert.strictEqual((await call('POST', `/shifts/${sid}/movement`, { type: 'out', amount: 100, reason: 'Office tea' }, c1)).status, 200);
    assert.strictEqual((await call('POST', `/shifts/${sid}/movement`, { type: 'out', amount: 100, reason: 'Not my shift' }, c2)).status, 403); // someone else's shift

    // blind closing: the cashier's own view has no cash workings; the owner sees them
    const blind = (await call('GET', '/shifts/current', null, c1)).data.live;
    assert.ok(!('expectedCash' in blind) && !('cashSales' in blind));
    const live = (await call('GET', `/shifts/${sid}`, null, owner)).data.live;
    assert.strictEqual(live.cashSales, 550);
    assert.strictEqual(live.cardSales, 110);
    assert.strictEqual(live.salesCount, 2);
    assert.strictEqual(live.cashOut, 100);
    assert.strictEqual(live.expectedCash, 1000 + 550 - 100);

    // counting short needs an explanation
    assert.strictEqual((await call('POST', `/shifts/${sid}/close`, { countedCash: 1400 }, c1)).status, 400);
    const closed = await call('POST', `/shifts/${sid}/close`, { countedCash: 1400, notes: 'Gave a customer 50 extra by mistake' }, c1);
    assert.strictEqual(closed.status, 200);
    assert.strictEqual(closed.data.status, 'closed');
    assert.strictEqual(closed.data.expectedCash, 1450);
    assert.strictEqual(closed.data.difference, -50);
    assert.strictEqual((await call('POST', `/shifts/${sid}/close`, { countedCash: 1450 }, c1)).status, 409); // cannot close twice
    // a new shift can be opened after closing
    assert.strictEqual((await call('POST', '/shifts', { openingCash: 1400 }, c1)).status, 201);
  });

  await t.test('cash closing: returns and udhaar payments move the drawer; visibility rules', async () => {
    const cur = (await call('GET', '/shifts/current', null, c1)).data;
    const cust = (await call('POST', '/customers', { name: 'Udhaar Man', phone: '0300' }, owner)).data;
    const sale = (await call('POST', '/sales', { customer: cust._id, items: [{ medicine: med._id, unitType: 'strip', quantity: 4 }], payments: [{ method: 'credit', amount: 220 }] }, c1)).data;
    assert.ok(sale);
    assert.strictEqual((await call('POST', `/customers/${cust._id}/payments`, { amount: 100, method: 'cash' }, c1)).status, 201);
    const ret = await call('POST', `/sales/${sale._id}/return`, { items: [{ saleItem: sale.items[0]._id, unitType: 'strip', quantity: 1 }], reason: 'wrong strip', refundTo: 'cash' }, owner);
    assert.strictEqual(ret.status, 201); // owner's return, not this cashier's drawer
    const live = (await call('GET', `/shifts/${cur._id}`, null, owner)).data.live;
    assert.strictEqual(live.customerPayments, 100);
    assert.strictEqual(live.creditSales, 220);
    assert.strictEqual(live.expectedCash, 1400 + 100);
    // visibility: c2 cannot read c1's shift, owner can, lists are scoped
    assert.strictEqual((await call('GET', `/shifts/${cur._id}`, null, c2)).status, 403);
    assert.strictEqual((await call('GET', `/shifts/${cur._id}`, null, owner)).status, 200);
    const mine = await call('GET', '/shifts', null, c2);
    assert.ok(mine.data.every((s) => s.userName === 'Cash Two'));
    assert.ok((await call('GET', '/shifts', null, owner)).data.length >= 3);
  });

  let supplier; let po;
  await t.test('purchase order: made from the reorder list, edited, sent', async () => {
    supplier = (await call('POST', '/suppliers', { name: 'PO Supplier' }, owner)).data;
    await call('PATCH', `/medicines/${med._id}`, { supplier: supplier._id, minStockLevel: 5000 }, owner);
    const made = await call('POST', '/purchase-orders/from-reorder', { supplier: supplier._id }, inv);
    assert.strictEqual(made.status, 201);
    po = made.data;
    assert.strictEqual(po.status, 'draft');
    assert.strictEqual(po.items.length, 1);
    assert.ok(po.items[0].orderedBoxes >= 1);
    assert.strictEqual((await call('POST', '/purchase-orders/from-reorder', { supplier: supplier._id }, c1)).status, 403);
    const edit = await call('PATCH', `/purchase-orders/${po._id}`, { items: [{ medicine: med._id, boxes: 3, costPerBox: 410 }], notes: 'Urgent' }, inv);
    assert.strictEqual(edit.data.items[0].orderedBoxes, 3);
    assert.strictEqual(edit.data.estTotal, 1230);
    assert.strictEqual((await call('PATCH', `/purchase-orders/${po._id}`, { items: [{ medicine: med._id, boxes: 1 }, { medicine: med._id, boxes: 2 }] }, inv)).status, 400); // same medicine twice
    assert.strictEqual((await call('POST', `/purchase-orders/${po._id}/status`, { status: 'sent' }, inv)).data.status, 'sent');
    assert.strictEqual((await call('PATCH', `/purchase-orders/${po._id}`, { notes: 'x' }, inv)).status, 400); // sent orders are locked
  });

  await t.test('purchase order: receiving stock moves it to partial, then received; wrong supplier refused', async () => {
    const other = (await call('POST', '/suppliers', { name: 'Other Supplier' }, owner)).data;
    const line = (boxes) => ({ medicine: med._id, batchNumber: `B${boxes}${Date.now() % 1000}`, expiryDate: day(300), quantity: { box: boxes }, pricePerBox: 410 });
    const wrong = await call('POST', '/purchases', { supplier: other._id, purchaseOrder: po._id, items: [line(1)] }, inv);
    assert.strictEqual(wrong.status, 400);
    const p1 = await call('POST', '/purchases', { supplier: supplier._id, purchaseOrder: po._id, items: [line(2)] }, inv);
    assert.strictEqual(p1.status, 201);
    let cur = (await call('GET', `/purchase-orders/${po._id}`, null, inv)).data;
    assert.strictEqual(cur.status, 'partial');
    assert.strictEqual(cur.items[0].receivedBase, 200);
    assert.strictEqual((await call('GET', '/purchase-orders?status=open', null, inv)).data.length, 1);
    const p2 = await call('POST', '/purchases', { supplier: supplier._id, purchaseOrder: po._id, items: [line(1)] }, inv);
    assert.strictEqual(p2.status, 201);
    cur = (await call('GET', `/purchase-orders/${po._id}`, null, inv)).data;
    assert.strictEqual(cur.status, 'received');
    assert.strictEqual((await call('GET', '/purchase-orders?status=open', null, inv)).data.length, 0);
    // a finished order cannot receive more, and cannot be cancelled
    assert.strictEqual((await call('POST', '/purchases', { supplier: supplier._id, purchaseOrder: po._id, items: [line(1)] }, inv)).status, 400);
    assert.strictEqual((await call('POST', `/purchase-orders/${po._id}/status`, { status: 'cancelled', reason: 'oops' }, inv)).status, 400);
  });

  await t.test('purchase order: cancel needs a reason', async () => {
    const o = (await call('POST', '/purchase-orders', { supplier: supplier._id, items: [{ medicine: med._id, boxes: 2 }] }, inv)).data;
    assert.strictEqual((await call('POST', `/purchase-orders/${o._id}/status`, { status: 'cancelled' }, inv)).status, 400);
    const c = await call('POST', `/purchase-orders/${o._id}/status`, { status: 'cancelled', reason: 'Supplier out of stock' }, inv);
    assert.strictEqual(c.data.status, 'cancelled');
  });
});
