// Barcodes, expiry return plan, udhaar reminders, daily summary and in-app backup, on a THROWAWAY database.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
const DB = 'wellness_ops2_test';
const app = require('../src/app');
const User = require('../src/models/User');
const { ean13CheckDigit, isValidEan13, internalEan13 } = require('../src/utils/ean');

test('EAN-13 helpers', () => {
  assert.strictEqual(ean13CheckDigit('400638133393'), 1); // 4006381333931 is a real, valid EAN-13
  assert.ok(isValidEan13('4006381333931'));
  assert.ok(!isValidEan13('4006381333932'));
  const code = internalEan13(1);
  assert.strictEqual(code.length, 13);
  assert.ok(code.startsWith('20') && isValidEan13(code));
  assert.notStrictEqual(internalEan13(1), internalEan13(2));
});

test('barcodes, expiry plan, udhaar reminders, daily summary, backup', async (t) => {
  const uri = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);
  process.env.MONGODB_URI = uri;
  require('../src/config/env').mongoUri = uri;
  await require('../src/config/db')();
  if (mongoose.connection.name !== DB) { await mongoose.disconnect(); throw new Error(`Refusing to run: connected to "${mongoose.connection.name}"`); }
  await mongoose.connection.dropDatabase();
  await Promise.all([require('../src/models/Medicine'), require('../src/models/Sale')].map((m) => m.createIndexes()));
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
  const mk = async (name, extra = {}) => (await call('POST', '/medicines', { name, stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePrice: { box: 500, strip: 55, unit: 6 }, ...extra }, owner)).data;
  const stock = (m, n, d, unit) => call('POST', '/inventory/batches', { medicine: m._id, batchNumber: n, expiryDate: day(d), quantity: { unit } }, owner);

  await t.test('assign-barcodes gives unique valid EAN-13 codes only to medicines without one', async () => {
    const withCode = await mk('Has Code', { barcode: '8961234567890' });
    const a = await mk('No Code A'); const b = await mk('No Code B');
    assert.strictEqual((await call('POST', '/medicines/assign-barcodes', {}, cashier)).status, 403);
    const r = await call('POST', '/medicines/assign-barcodes', {}, owner);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.assigned, 2);
    const get = async (m) => (await call('GET', `/medicines/${m._id}`, null, owner)).data.barcode;
    const [ca, cb, cw] = [await get(a), await get(b), await get(withCode)];
    assert.ok(isValidEan13(ca) && isValidEan13(cb) && ca !== cb);
    assert.ok(ca.startsWith('20'));
    assert.strictEqual(cw, '8961234567890'); // untouched
    assert.strictEqual((await call('POST', '/medicines/assign-barcodes', {}, owner)).assigned, 0); // nothing left
    // a barcode assigned this way is found by the scanner lookup
    assert.strictEqual((await call('GET', `/medicines/barcode/${ca}`, null, owner)).data.name, 'No Code A');
  });

  await t.test('expiry plan groups by supplier and flags batches that will not sell in time', async () => {
    const sup = (await call('POST', '/suppliers', { name: 'Return Supplier', phone: '0300111' }, owner)).data;
    const slow = await mk('Slow Seller', { supplier: sup._id });
    const fast = await mk('Fast Seller', { supplier: sup._id });
    await stock(slow, 'SL-OLD', -10, 50);   // already expired
    await stock(slow, 'SL-1', 30, 1000);    // far too much for 30 days at 1 unit/day
    await stock(fast, 'FA-1', 30, 40);      // 30 are sold below, 10 left: at 1 unit/day that sells out in 10 days
    await stock(fast, 'FA-FAR', 400, 500);  // not near expiry: must not appear
    // sell 30 units of each today -> about 1 unit per day over the last 30 days
    for (const m of [slow, fast]) assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: m._id, unitType: 'unit', quantity: 30 }], payments: [{ method: 'cash', amount: 180 }] }, owner)).status, 201);

    const r = await call('GET', '/ops/expiry-plan?days=90', null, owner);
    assert.strictEqual(r.status, 200);
    const g = r.groups.find((x) => x.supplier?.name === 'Return Supplier');
    assert.ok(g);
    assert.strictEqual(g.supplier.phone, '0300111');
    const line = (name, batch) => g.lines.find((l) => l.name === name && l.batchNumber === batch);
    assert.strictEqual(line('Slow Seller', 'SL-OLD').status, 'expired');
    assert.strictEqual(line('Slow Seller', 'SL-1').unlikelyToSell, true);
    assert.strictEqual(line('Fast Seller', 'FA-1').unlikelyToSell, false);
    assert.strictEqual(line('Fast Seller', 'FA-FAR'), undefined);
    assert.strictEqual(g.expiredValue, 200);               // 50 expired units at Rs 4 each (box 400 / 100 units)
    assert.ok(r.totals.atRiskValue > 0 && r.totals.expiredValue > 0);
    assert.strictEqual((await call('GET', '/ops/expiry-plan', null, cashier)).status, 403); // it shows costs: not for the counter
    assert.strictEqual((await call('GET', '/ops/expiry-plan', null, owner)).status, 200);
  });

  await t.test('udhaar reminders list only overdue balances and remember when we asked', async () => {
    const cust = (await call('POST', '/customers', { name: 'Late Payer', phone: '03001234567' }, owner)).data;
    const med = (await call('GET', '/medicines?search=Fast', null, owner)).data[0];
    assert.strictEqual((await call('POST', '/sales', { customer: cust._id, items: [{ medicine: med._id, unitType: 'strip', quantity: 4 }], payments: [{ method: 'credit', amount: 220 }] }, owner)).status, 201);
    let r = await call('GET', '/ops/udhaar-reminders?minDays=15', null, owner);
    assert.ok(!r.data.some((x) => x.name === 'Late Payer')); // owes since today: not overdue yet
    r = await call('GET', '/ops/udhaar-reminders?minDays=0', null, owner);
    assert.strictEqual(r.data.find((x) => x.name === 'Late Payer').balance, 220);
    // make the debt 40 days old
    await mongoose.connection.db.collection('customerledgers').updateMany({ customer: new mongoose.Types.ObjectId(cust._id) }, { $set: { createdAt: new Date(Date.now() - 40 * 86400000) } });
    r = await call('GET', '/ops/udhaar-reminders?minDays=15', null, owner);
    const row = r.data.find((x) => x.name === 'Late Payer');
    assert.ok(row.daysSince >= 40);
    assert.strictEqual(row.phone, '03001234567');
    assert.strictEqual(row.lastReminderAt, null);
    assert.strictEqual((await call('GET', '/ops/udhaar-reminders', null, cashier)).status, 403); // reminders are the owner's call
    assert.strictEqual((await call('POST', `/ops/udhaar-reminders/${cust._id}/sent`, null, owner)).status, 200);
    row.lastReminderAt = (await call('GET', '/ops/udhaar-reminders?minDays=15', null, owner)).data.find((x) => x.name === 'Late Payer').lastReminderAt;
    assert.ok(row.lastReminderAt);
    // paying part of it resets the clock
    assert.strictEqual((await call('POST', `/customers/${cust._id}/payments`, { amount: 20, method: 'cash' }, owner)).status, 201);
    r = await call('GET', '/ops/udhaar-reminders?minDays=15', null, owner);
    assert.ok(!r.data.some((x) => x.name === 'Late Payer'));
  });

  await t.test('daily summary adds up the day', async () => {
    const r = await call('GET', '/ops/daily-summary', null, owner);
    assert.strictEqual(r.status, 200);
    const d = r.data;
    assert.strictEqual(d.sales.bills, 3);                    // two cash sales + one credit sale made above
    assert.strictEqual(d.sales.cash, 360);
    assert.strictEqual(d.sales.credit, 220);
    assert.strictEqual(d.sales.total, 580);
    assert.strictEqual(d.udhaar.given, 0);                   // that udhaar entry was back-dated 40 days by the previous test, so it is not today's
    assert.strictEqual(d.udhaar.received, 20);
    assert.strictEqual(d.udhaar.totalOwed, 200);
    assert.ok(d.topSellers.length >= 1 && d.topSellers[0].revenue > 0);
    assert.strictEqual(d.staff[0].name, 'Owner');
    assert.ok(d.stockAlerts && 'expired' in d.stockAlerts);
    assert.strictEqual((await call('GET', '/ops/daily-summary', null, cashier)).status, 403);
    assert.strictEqual((await call('GET', '/ops/daily-summary?date=2020-01-01', null, owner)).data.sales.bills, 0); // another day is empty
  });

  await t.test('backup: owner only, collection by collection, remembers the date', async () => {
    assert.strictEqual((await call('GET', '/ops/backup/manifest', null, cashier)).status, 403);
    const m = await call('GET', '/ops/backup/manifest', null, owner);
    assert.strictEqual(m.database, DB);
    assert.ok(m.collections.medicines >= 5 && m.collections.sales >= 3);
    assert.strictEqual(m.lastBackupAt, null);
    const p = await call('GET', '/ops/backup/medicines?skip=0&limit=2', null, owner);
    assert.strictEqual(p.count, 2);
    assert.ok(p.docs[0]._id.$oid, 'ids are in extended JSON so a restore keeps the exact types');
    const rest = await call('GET', '/ops/backup/medicines?skip=2&limit=1000', null, owner);
    assert.strictEqual(2 + rest.count, m.collections.medicines); // paging covers everything exactly once
    assert.strictEqual((await call('GET', '/ops/backup/nonsense', null, owner)).status, 404);
    assert.strictEqual((await call('POST', '/ops/backup/done', null, owner)).status, 200);
    assert.ok((await call('GET', '/ops/backup/manifest', null, owner)).lastBackupAt);
    assert.ok((await call('GET', '/settings', null, owner)).data.lastBackupAt); // the app can warn when it is old
  });
});
