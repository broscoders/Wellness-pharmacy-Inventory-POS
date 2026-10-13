// Role-based access: what each role can see and do, checked through the real API on a THROWAWAY database.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
const DB = 'wellness_rbac_test';
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const { COST_KEYS } = require('../src/middleware/redact');

// every key anywhere in the answer that would reveal a purchase price, cost or profit
const costKeysIn = (v, path = '') => (Array.isArray(v) ? v.flatMap((x, i) => costKeysIn(x, `${path}[${i}]`)) : v && typeof v === 'object'
  ? Object.entries(v).flatMap(([k, val]) => (COST_KEYS.has(k) ? [`${path}.${k}`] : costKeysIn(val, `${path}.${k}`))) : []);

test('roles: what each can see and do', async (t) => {
  const uri = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);
  process.env.MONGODB_URI = uri;
  require('../src/config/env').mongoUri = uri;
  await require('../src/config/db')();
  if (mongoose.connection.name !== DB) { await mongoose.disconnect(); throw new Error(`Refusing to run: connected to "${mongoose.connection.name}"`); }
  await mongoose.connection.dropDatabase();
  await Promise.all([require('../src/models/Shift'), require('../src/models/Sale'), Batch].map((m) => m.createIndexes()));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { server.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const call = async (method, path, body, tk) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(tk && { Authorization: `Bearer ${tk}` }) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const mkUser = async (name, role) => { await User.create({ name, email: `${role}${name}@t.com`, password: 'Passw0rd!x', role }); return (await call('POST', '/auth/login', { email: `${role}${name}@t.com`, password: 'Passw0rd!x' })).accessToken; };
  const owner = await mkUser('Owner', 'admin');
  const cashier = await mkUser('A', 'cashier');
  const cashier2 = await mkUser('B', 'cashier');
  const pharmacist = await mkUser('P', 'pharmacist');
  const inventory = await mkUser('I', 'inventory');

  const med = (await call('POST', '/medicines', { name: 'Role Med', stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePrice: { box: 500, strip: 55, unit: 6 }, barcode: '111' }, owner)).data;
  await call('POST', '/inventory/batches', { medicine: med._id, batchNumber: 'R1', expiryDate: day(300), quantity: { box: 10 }, purchasePricePerBox: 400 }, owner);
  const sell = (tk, extra = {}) => call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 2 }], payments: [{ method: 'cash', amount: 110 }], ...extra }, tk);

  await t.test('the owner and purchasing staff see costs; counter staff never do, anywhere', async () => {
    const own = await call('GET', `/medicines/${med._id}`, null, owner);
    assert.strictEqual(own.data.purchasePrice, 400);
    assert.strictEqual((await call('GET', `/medicines/${med._id}`, null, inventory)).data.purchasePrice, 400);

    const ownerSale = await sell(owner);
    assert.ok(costKeysIn(ownerSale).length > 0, 'sanity: the owner does receive cost fields');

    const answers = {
      'GET /medicines': await call('GET', '/medicines', null, cashier),
      'GET /medicines/:id': await call('GET', `/medicines/${med._id}`, null, cashier),
      'GET /medicines/barcode': await call('GET', '/medicines/barcode/111', null, cashier),
      'GET /medicines/catalog': await call('GET', '/medicines/catalog', null, cashier),
      'POST /sales': await sell(cashier),
      'GET /sales': await call('GET', '/sales', null, cashier),
      'GET /dashboard': await call('GET', '/dashboard', null, cashier),
      'pharmacist GET /medicines/:id': await call('GET', `/medicines/${med._id}`, null, pharmacist),
      'pharmacist GET /sales/:id': await call('GET', `/sales/${ownerSale.data._id}`, null, pharmacist),
      'pharmacist GET /inventory/batches': await call('GET', `/inventory/batches?medicine=${med._id}`, null, pharmacist),
    };
    for (const [name, r] of Object.entries(answers)) { assert.ok(r.status < 300, `${name} -> ${r.status}`); assert.deepStrictEqual(costKeysIn(r), [], `${name} leaks ${costKeysIn(r)}`); }
    const sale = await call('GET', `/sales/${answers['POST /sales'].data._id}`, null, cashier);
    assert.deepStrictEqual(costKeysIn(sale), []);
    assert.ok(sale.data.items[0].lineTotal > 0); // the receipt still has what it needs
  });

  await t.test('counter staff are locked out of owner and back-office areas', async () => {
    const closed = ['/finance/summary', '/reports/profit', '/purchases', '/purchase-orders', '/suppliers', '/expenses', '/payroll/sheet?month=2026-10', '/users', '/audit', '/ops/daily-summary', '/ops/backup/manifest', '/ops/expiry-plan', '/inventory/alerts', '/shifts?user=x&status=closed&limit=1'];
    for (const p of closed.slice(0, -1)) assert.strictEqual((await call('GET', p, null, cashier)).status, 403, `cashier GET ${p}`);
    for (const p of ['/finance/summary', '/payroll/sheet?month=2026-10', '/users', '/audit', '/ops/daily-summary', '/ops/backup/manifest', '/expenses']) assert.strictEqual((await call('GET', p, null, pharmacist)).status, 403, `pharmacist GET ${p}`);
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 1 }], payments: [{ method: 'cash', amount: 55 }] }, inventory)).status, 403); // purchasing staff cannot bill
    assert.strictEqual((await call('POST', '/purchases', { supplier: '000000000000000000000000', items: [] }, cashier)).status, 403);
    // taking money from a customer is the cashier's job; paying a supplier is not
    const sup = (await call('POST', '/suppliers', { name: 'Pay Test Supplier' }, owner)).data;
    assert.strictEqual((await call('POST', `/suppliers/${sup._id}/payments`, { amount: 100, method: 'cash' }, cashier)).status, 403);
    assert.strictEqual((await call('POST', `/suppliers/${sup._id}/payments`, { amount: 100, method: 'cash' }, pharmacist)).status, 403);
    const cu = (await call('POST', '/customers', { name: 'Pays Back' }, owner)).data;
    // (this customer owes nothing, so the answer is a 400 about the amount, not a 403 about permission)
    assert.notStrictEqual((await call('POST', `/customers/${cu._id}/payments`, { amount: 100, method: 'cash' }, cashier)).status, 403);
  });

  await t.test('people who cannot see the cost cannot overwrite it either', async () => {
    assert.strictEqual((await call('PATCH', `/medicines/${med._id}`, { purchasePrice: 1, rack: 'Z' }, pharmacist)).status, 200);
    assert.strictEqual((await call('GET', `/medicines/${med._id}`, null, owner)).data.purchasePrice, 400); // untouched
    assert.strictEqual((await call('GET', `/medicines/${med._id}`, null, owner)).data.rack, 'Z');        // the allowed part went through
    const b = await call('POST', '/inventory/batches', { medicine: med._id, batchNumber: 'P1', expiryDate: day(200), quantity: { box: 1 }, purchasePricePerBox: 1 }, pharmacist);
    assert.strictEqual(b.status, 201);
    assert.strictEqual((await Batch.findOne({ batchNumber: 'P1' })).purchasePricePerBox, 400); // took the medicine's real cost, not 1
    const made = await call('POST', '/medicines', { name: 'Pharma Made', stripsPerBox: 1, unitsPerStrip: 1, purchasePrice: 5, salePrice: { box: 10 } }, pharmacist);
    assert.strictEqual(made.status, 201);
    assert.strictEqual((await call('GET', `/medicines/${made.data._id}`, null, owner)).data.purchasePrice, 0);
    const issues = (await call('GET', '/finance/pricing-issues', null, owner)).data;
    assert.ok(issues.some((x) => x.name === 'Pharma Made' && x.issue === 'no_cost'), 'the owner is told a cost is missing');
  });

  await t.test('a cashier sees only their own bills; owner and pharmacist see all', async () => {
    const a = (await sell(cashier)).data; const b = (await sell(cashier2)).data;
    const mine = await call('GET', '/sales?limit=100', null, cashier);
    assert.ok(mine.data.length > 0 && mine.data.every((s) => s.createdByName === 'A'));
    assert.ok(!mine.data.some((s) => s._id === b._id));
    assert.strictEqual((await call('GET', `/sales/${b._id}`, null, cashier)).status, 403);
    assert.strictEqual((await call('GET', `/sales/invoice/${b.invoiceNo}`, null, cashier)).status, 403);
    assert.strictEqual((await call('GET', `/sales/${a._id}`, null, cashier)).status, 200);
    const spy = await call('GET', `/sales?staff=${b.createdBy}&limit=100`, null, cashier);
    assert.ok(spy.data.every((s) => s.createdByName === 'A'), 'the staff filter cannot be used to look at someone else');
    // returns made by someone else are not listed to a cashier either
    const ret = await call('POST', `/sales/${b._id}/return`, { items: [{ saleItem: b.items[0]._id, unitType: 'strip', quantity: 1 }], reason: 'test', refundTo: 'cash' }, pharmacist);
    assert.strictEqual(ret.status, 201);
    assert.strictEqual((await call('GET', '/sales/returns', null, cashier)).data.length, 0);
    assert.ok((await call('GET', '/sales/returns', null, owner)).data.length >= 1);
    for (const tk of [owner, pharmacist]) {
      assert.strictEqual((await call('GET', `/sales/invoice/${b.invoiceNo}`, null, tk)).status, 200);
      assert.ok(new Set((await call('GET', '/sales?limit=100', null, tk)).data.map((s) => s.createdByName)).size >= 2);
    }
  });

  await t.test('discounts above the shop limit need the owner; the owner can change the limit', async () => {
    const bill = (disc) => ({ discount: disc, payments: [{ method: 'cash', amount: 1000 }] });
    // 10 strips = Rs 550. Default limit 10% = Rs 55.
    const ten = (disc) => call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 10 }], ...bill(disc) }, cashier);
    assert.strictEqual((await ten(55)).status, 201);
    const over = await ten(60);
    assert.strictEqual(over.status, 400);
    assert.match(over.message, /limit is 10%/);
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 10 }], ...bill(275) }, owner)).status, 201); // owner: 50% is fine
    assert.strictEqual((await call('PUT', '/settings', { shopName: 'Test Shop', maxDiscountPercent: 20 }, cashier)).status, 403);
    assert.strictEqual((await call('PUT', '/settings', { shopName: 'Test Shop', maxDiscountPercent: 20 }, owner)).status, 200);
    assert.strictEqual((await ten(100)).status, 201); // 100/550 = 18%: allowed now
    assert.strictEqual((await ten(120)).status, 400);
  });

  await t.test('cashiers may add customers but not set credit limits or archive them', async () => {
    const c = await call('POST', '/customers', { name: 'Walk In Friend', phone: '0300', creditLimit: 1000000 }, cashier);
    assert.strictEqual(c.status, 201);
    assert.strictEqual(c.data.creditLimit, 5000, 'a customer added by a cashier starts with the shop default limit, never "no limit" (0)');
    assert.strictEqual((await call('PATCH', `/customers/${c.data._id}`, { phone: '0311' }, cashier)).status, 200);
    assert.strictEqual((await call('PATCH', `/customers/${c.data._id}`, { creditLimit: 500000 }, cashier)).status, 403);
    assert.strictEqual((await call('PATCH', `/customers/${c.data._id}`, { isActive: false }, cashier)).status, 403);
    assert.strictEqual((await call('DELETE', `/customers/${c.data._id}`, null, cashier)).status, 403);
    assert.strictEqual((await call('PATCH', `/customers/${c.data._id}`, { creditLimit: 5000 }, owner)).data.creditLimit, 5000);
  });

  await t.test('dashboard: owner gets the business, counter staff get only their own day', async () => {
    const mine = await call('GET', '/dashboard', null, cashier);
    assert.strictEqual(mine.mode, 'counter');
    assert.ok(mine.data.today.bills >= 1 && mine.data.recentSales.every((s) => s.createdByName === 'A'));
    const text = JSON.stringify(mine).toLowerCase();
    for (const word of ['profit', 'payable', 'purchase', 'stockvalue', 'receivable']) assert.ok(!text.includes(word), `counter dashboard mentions "${word}"`);
    assert.strictEqual(mine.data.alerts, null); // cashier has no stock-alert rights
    assert.ok((await call('GET', '/dashboard', null, pharmacist)).data.alerts, 'the pharmacist is told about stock that needs attention');
    const full = await call('GET', '/dashboard', null, owner);
    assert.strictEqual(full.mode, undefined);
    assert.ok(JSON.stringify(full).toLowerCase().includes('profit'));
  });

  await t.test('blind closing: the cashier cannot see what the drawer should hold, only the result', async () => {
    const open = await call('POST', '/shifts', { openingCash: 1000 }, cashier);
    assert.strictEqual(open.status, 201);
    await sell(cashier);
    const live = (await call('GET', '/shifts/current', null, cashier)).data.live;
    assert.deepStrictEqual(Object.keys(live).sort(), ['openingCash', 'salesCount', 'salesTotal']);
    assert.ok(!('expectedCash' in live) && !('cashSales' in live));
    // the owner sees the full workings of the same shift
    const ownerView = (await call('GET', `/shifts/${open.data._id}`, null, owner)).data.live;
    assert.ok(ownerView.expectedCash > 1000 && ownerView.cashSales > 0);
    const wrong = await call('POST', `/shifts/${open.data._id}/close`, { countedCash: 1000 }, cashier);
    assert.strictEqual(wrong.status, 400);
    assert.match(wrong.message, /does not match/);
    const done = await call('POST', `/shifts/${open.data._id}/close`, { countedCash: 1000, notes: 'Counted before the last sale' }, cashier);
    assert.strictEqual(done.status, 200);
    assert.strictEqual(done.data.difference, -ownerView.cashSales); // the cashier now learns the result
    assert.strictEqual((await call('GET', '/shifts?status=closed', null, owner)).data.length >= 1, true);
  });

  await t.test('a password set by the owner is temporary: the person must choose their own first', async () => {
    const made = await call('POST', '/users', { name: 'New Hire', email: 'hire@t.com', password: 'Temp1234!x', role: 'cashier' }, owner);
    assert.strictEqual(made.status, 201);
    assert.strictEqual(made.data.mustChangePassword, true);
    const login = await call('POST', '/auth/login', { email: 'hire@t.com', password: 'Temp1234!x' });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.user.mustChangePassword, true);
    const tk = login.accessToken;
    for (const p of ['/medicines', '/sales', '/customers', '/dashboard', '/shifts/current']) assert.strictEqual((await call('GET', p, null, tk)).status, 403, `${p} must be refused before the password is changed`);
    assert.strictEqual((await call('GET', '/auth/me', null, tk)).status, 200); // but the person can still see who they are
    assert.strictEqual((await call('POST', '/auth/change-password', { currentPassword: 'Temp1234!x', newPassword: 'Temp1234!x' }, tk)).status, 400); // must really be new
    const changed = await call('POST', '/auth/change-password', { currentPassword: 'Temp1234!x', newPassword: 'MyOwn5ecret!' }, tk);
    assert.strictEqual(changed.status, 200);
    assert.strictEqual(changed.user.mustChangePassword, false);
    assert.strictEqual((await call('GET', '/medicines', null, changed.accessToken)).status, 200);
    // an owner reset makes it temporary again; the owner changing their own does not
    const users = (await call('GET', '/users', null, owner)).data;
    const hire = users.find((u) => u.email === 'hire@t.com');
    assert.strictEqual((await call('PATCH', `/users/${hire.id}`, { password: 'Reset1234!x' }, owner)).data.mustChangePassword, true);
    const me = users.find((u) => u.email === 'adminowner@t.com');
    assert.strictEqual((await call('PATCH', `/users/${me.id}`, { password: 'Passw0rd!y' }, owner)).data.mustChangePassword, false);
  });
});

