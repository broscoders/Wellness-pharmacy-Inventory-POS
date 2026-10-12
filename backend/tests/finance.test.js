// Finance (margins, expenses, payroll), medicine location/MRP and pricing checks on a THROWAWAY database.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
const DB = 'wellness_fin_test';
const app = require('../src/app');
const User = require('../src/models/User');

test('finance, payroll and medicine details', async (t) => {
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

  let med;
  await t.test('medicine keeps its shelf location, form, storage and MRP; selling above MRP is refused', async () => {
    const base1 = { name: 'Located Med', stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 400, salePrice: { box: 500, strip: 55, unit: 6 }, rack: 'A', row: '3', side: 'Left', dosageForm: 'Tablet', storage: 'fridge', mrp: 520 };
    const r = await call('POST', '/medicines', base1, owner);
    assert.strictEqual(r.status, 201);
    med = r.data;
    const got = (await call('GET', `/medicines/${med._id}`, null, owner)).data;
    assert.deepStrictEqual([got.rack, got.row, got.side, got.dosageForm, got.storage, got.mrp], ['A', '3', 'Left', 'Tablet', 'fridge', 520]);
    assert.strictEqual((await call('POST', '/medicines', { ...base1, name: 'Too Dear', salePrice: { box: 600 } }, owner)).status, 400);
    assert.strictEqual((await call('PATCH', `/medicines/${med._id}`, { salePrice: { box: 530 } }, owner)).status, 400);
    assert.strictEqual((await call('PATCH', `/medicines/${med._id}`, { mrp: 480 }, owner)).status, 400); // lowering MRP under the current price is refused too
    assert.strictEqual((await call('PATCH', `/medicines/${med._id}`, { rack: 'B' }, owner)).status, 200);
    const search = await call('GET', '/medicines?search=B', null, owner);
    assert.ok(search.data.some((m) => m._id === med._id)); // searchable by rack
    const cat = (await call('GET', '/medicines/catalog', null, owner)).data.find((m) => m._id === med._id);
    assert.deepStrictEqual([cat.rack, cat.row, cat.side, cat.storage], ['B', '3', 'Left', 'fridge']);
  });

  await t.test('profit report: margins and expenses (rent + payroll) come out right', async () => {
    await call('POST', '/inventory/batches', { medicine: med._id, batchNumber: 'F1', expiryDate: day(300), quantity: { box: 10 } }, owner);
    // 10 strips: revenue 550, cost 10 * (400/10) = 400
    assert.strictEqual((await call('POST', '/sales', { items: [{ medicine: med._id, unitType: 'strip', quantity: 10 }], payments: [{ method: 'cash', amount: 550 }] }, owner)).status, 201);
    assert.strictEqual((await call('POST', '/expenses', { category: 'rent', amount: 50 }, owner)).status, 201);

    const emp = await call('POST', '/payroll/employees', { name: 'Ali Helper', designation: 'Helper', monthlySalary: 3000 }, owner);
    assert.strictEqual(emp.status, 201);
    const month = new Date().toISOString().slice(0, 7);
    const pay = (kind, amount) => call('POST', '/payroll/payments', { employee: emp.data._id, month, kind, amount }, owner);

    assert.strictEqual((await call('GET', '/payroll/sheet?month=' + month, null, cashier)).status, 403); // payroll is for the owner only
    const s1 = await pay('salary', 1000);
    assert.strictEqual(s1.status, 201);
    assert.strictEqual((await pay('advance', 500)).status, 201);
    let sheet = await call('GET', `/payroll/sheet?month=${month}`, null, owner);
    assert.strictEqual(sheet.data[0].remaining, 1500); // 3000 - 1000 paid - 500 advance
    assert.strictEqual((await pay('salary', 1600)).status, 400); // cannot pay more than what is left
    assert.strictEqual((await pay('bonus', 200)).status, 201);
    sheet = await call('GET', `/payroll/sheet?month=${month}`, null, owner);
    assert.strictEqual(sheet.data[0].remaining, 1500); // bonus is on top, not part of the salary balance
    assert.strictEqual(sheet.totals.paid, 1700);

    // the salary payment is in expenses too, so profit already counts it
    let fin = (await call('GET', '/finance/summary', null, owner)).data.current;
    assert.strictEqual(fin.netSales, 550);
    assert.strictEqual(fin.purchaseCostOfGoodsSold, 400);
    assert.strictEqual(fin.grossProfit, 150);
    assert.strictEqual(fin.grossMarginPercent, 27.3);
    assert.strictEqual(fin.expensesByCategory.salaries, 1700);
    assert.strictEqual(fin.expenses, 1750);
    assert.strictEqual(fin.estimatedNetProfit, -1600);
    assert.strictEqual(fin.netMarginPercent, -290.9);

    // voiding a payment removes it from payroll AND from expenses/profit
    assert.strictEqual((await call('POST', `/payroll/payments/${s1.data._id}/void`, { reason: 'Paid twice by mistake' }, owner)).status, 200);
    assert.strictEqual((await call('POST', `/payroll/payments/${s1.data._id}/void`, { reason: 'again' }, owner)).status, 404);
    fin = (await call('GET', '/finance/summary', null, owner)).data.current;
    assert.strictEqual(fin.expensesByCategory.salaries, 700);
    assert.strictEqual(fin.estimatedNetProfit, -600);
    sheet = await call('GET', `/payroll/sheet?month=${month}`, null, owner);
    assert.strictEqual(sheet.data[0].remaining, 2500);

    // the plain profit report shows the same figures
    const rep = (await call('GET', '/reports/profit', null, owner)).data;
    assert.strictEqual(rep.estimatedNetProfit, -600);
    assert.strictEqual(rep.grossMarginPercent, 27.3);
  });

  await t.test('finance summary: trend, previous period and balance snapshot', async () => {
    const r = await call('GET', '/finance/summary', null, owner);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.trend.length, 6);
    assert.strictEqual(r.data.trend.at(-1).month, new Date().toISOString().slice(0, 7));
    assert.strictEqual(r.data.trend.at(-1).netProfit, -600);
    assert.strictEqual(r.data.previous.netSales, 0);
    assert.strictEqual(r.data.balance.stockValueAtCost, 3600); // 9 boxes still on the shelf at 400
    assert.strictEqual((await call('GET', '/finance/summary', null, cashier)).status, 403);
  });

  await t.test('pricing issues catch loss-making, thin-margin and unpriced medicines', async () => {
    const mk = (name, body) => call('POST', '/medicines', { name, stripsPerBox: 10, unitsPerStrip: 10, ...body }, owner);
    await mk('Loss Maker', { purchasePrice: 400, salePrice: { box: 350 } });
    await mk('Thin Margin', { purchasePrice: 400, salePrice: { box: 410 } });
    await mk('No Price', { purchasePrice: 400 });
    await mk('Healthy', { purchasePrice: 400, salePrice: { box: 520 } });
    const r = await call('GET', '/finance/pricing-issues', null, owner);
    const by = Object.fromEntries(r.data.map((x) => [x.name, x.issue]));
    assert.strictEqual(by['Loss Maker'], 'below_cost');
    assert.strictEqual(by['Thin Margin'], 'low_margin');
    assert.strictEqual(by['No Price'], 'no_price');
    assert.strictEqual(by.Healthy, undefined);
    assert.strictEqual(r.data[0].issue, 'below_cost'); // worst first
  });
});
