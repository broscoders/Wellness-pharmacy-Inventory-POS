const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const Shift = require('../models/Shift');
const Setting = require('../models/Setting');
const { round2, rangeFromQuery, localDay } = require('../utils/money');
const { unitsPerBox, fromBase } = require('../utils/units');
const { getAlerts } = require('./inventory.service');
const { productStats } = require('./analytics.service');
const { profitFor, balanceSnapshot } = require('./finance.service');

const DAY = 86400000;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

/**
 * Stock that is expired or will expire soon, grouped by the supplier to send it back to.
 * For each batch we also estimate whether it will really sell out in time: batches that expire earlier sell first
 * (FEFO), and the selling speed is what this medicine sold per day over the last 30 days.
 */
async function expiryPlan(days = 90) {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * DAY);
  const [batches, recent] = await Promise.all([
    Batch.find({ isActive: true, quantity: { $gt: 0 }, expiryDate: { $lt: horizon } }).sort({ expiryDate: 1 }).lean(),
    Sale.find({ createdAt: { $gte: new Date(now.getTime() - 30 * DAY) }, status: { $ne: 'cancelled' } }).select('items.medicine items.baseQty items.returnedBase').lean(),
  ]);
  const ids = [...new Set(batches.map((b) => String(b.medicine)))];
  const [meds, allBatches] = await Promise.all([
    Medicine.find({ _id: { $in: ids } }).populate('supplier', 'name phone').select('name stripsPerBox unitsPerStrip purchasePrice supplier').lean(),
    Batch.find({ medicine: { $in: ids }, isActive: true, quantity: { $gt: 0 }, expiryDate: { $gte: now } }).select('medicine quantity expiryDate').sort({ expiryDate: 1 }).lean(),
  ]);
  const byMed = new Map(meds.map((m) => [String(m._id), m]));
  const sold = new Map();
  for (const s of recent) for (const i of s.items) sold.set(String(i.medicine), (sold.get(String(i.medicine)) || 0) + Math.max((i.baseQty || 0) - (i.returnedBase || 0), 0));

  const groups = new Map();
  for (const b of batches) {
    const m = byMed.get(String(b.medicine)); if (!m) continue;
    const upb = unitsPerBox(m);
    const costValue = ((b.purchasePricePerBox || m.purchasePrice || 0) / upb) * b.quantity;
    const daysLeft = Math.ceil((b.expiryDate - now) / DAY);
    const expired = b.expiryDate < now;
    const perDay = (sold.get(String(m._id)) || 0) / 30;
    // units that will be sold BEFORE this batch (earlier expiry, same medicine) plus this batch itself
    const ahead = allBatches.filter((x) => String(x.medicine) === String(m._id) && x.expiryDate < b.expiryDate).reduce((s, x) => s + x.quantity, 0);
    const daysToSellOut = perDay > 0 ? Math.ceil((ahead + b.quantity) / perDay) : null;
    const unlikely = !expired && (daysToSellOut === null || daysToSellOut > daysLeft);
    const key = m.supplier ? String(m.supplier._id) : 'none';
    if (!groups.has(key)) groups.set(key, { supplier: m.supplier ? { _id: m.supplier._id, name: m.supplier.name, phone: m.supplier.phone || '' } : null, lines: [], expiredValue: 0, atRiskValue: 0, expiringValue: 0 });
    const g = groups.get(key);
    g.lines.push({ medicine: m._id, name: m.name, batchNumber: b.batchNumber, expiryDate: b.expiryDate, daysLeft, status: expired ? 'expired' : 'expiring', quantity: b.quantity, display: fromBase(m, b.quantity), costValue: round2(costValue), perDay: round2(perDay), daysToSellOut, unlikelyToSell: unlikely });
    if (expired) g.expiredValue += costValue; else { g.expiringValue += costValue; if (unlikely) g.atRiskValue += costValue; }
  }
  const out = [...groups.values()].map((g) => ({ ...g, expiredValue: round2(g.expiredValue), atRiskValue: round2(g.atRiskValue), expiringValue: round2(g.expiringValue) }))
    .sort((a, b) => (b.expiredValue + b.atRiskValue) - (a.expiredValue + a.atRiskValue));
  return { days, groups: out, totals: { expiredValue: round2(sum(out, (g) => g.expiredValue)), atRiskValue: round2(sum(out, (g) => g.atRiskValue)), expiringValue: round2(sum(out, (g) => g.expiringValue)), batches: sum(out, (g) => g.lines.length) } };
}

// Customers who owe money and have not paid for `minDays` days (counted from the last payment, else from when the udhaar began).
async function udhaarReminders(minDays = 15) {
  const customers = await Customer.find({ balance: { $gt: 0 }, isActive: true }).lean();
  const ids = customers.map((c) => c._id);
  // Plain reads and a little arithmetic here, instead of a $group, so it behaves the same on every MongoDB-compatible server.
  const rows = ids.length ? await CustomerLedger.find({ customer: { $in: ids }, type: { $in: ['payment', 'sale_credit', 'opening'] } }).select('customer type createdAt').lean() : [];
  const info = new Map();
  for (const r of rows) {
    const k = String(r.customer); const cur = info.get(k) || {};
    const at = new Date(r.createdAt);
    if (r.type === 'payment' && (!cur.lastPaymentAt || at > cur.lastPaymentAt)) cur.lastPaymentAt = at;
    if (r.type !== 'payment' && (!cur.firstCreditAt || at < cur.firstCreditAt)) cur.firstCreditAt = at;
    if (r.type === 'sale_credit' && (!cur.lastCreditAt || at > cur.lastCreditAt)) cur.lastCreditAt = at;
    info.set(k, cur);
  }
  const now = Date.now();
  const data = customers.map((c) => {
    const i = info.get(String(c._id)) || {};
    const since = i.lastPaymentAt || i.firstCreditAt || c.createdAt;
    return { _id: c._id, name: c.name, phone: c.phone || '', balance: round2(c.balance), creditLimit: c.creditLimit, lastPaymentAt: i.lastPaymentAt || null, lastCreditAt: i.lastCreditAt || null, daysSince: Math.floor((now - new Date(since).getTime()) / DAY), lastReminderAt: c.lastReminderAt || null };
  }).filter((r) => r.daysSince >= minDays).sort((a, b) => b.balance - a.balance);
  return { minDays, data, totals: { customers: data.length, amount: round2(sum(data, (r) => r.balance)), withoutPhone: data.filter((r) => !r.phone).length } };
}

// Everything the owner wants to know at the end of the day, in one answer.
async function dailySummary(date) {
  const { start, end } = rangeFromQuery({ from: date, to: date });
  const inDay = { $gte: start, $lt: end };
  const [profit, sales, returns, top, custLedger, shifts, alerts, balance, setting] = await Promise.all([
    profitFor(start, end),
    Sale.find({ createdAt: inDay, status: { $ne: 'cancelled' } }).select('total payments changeGiven createdByName').lean(),
    SaleReturn.countDocuments({ createdAt: inDay }),
    productStats(start, end),
    CustomerLedger.find({ createdAt: inDay, type: { $in: ['payment', 'sale_credit'] } }).select('type amount').lean(),
    Shift.find({ closedAt: inDay, status: 'closed' }).select('shiftNo userName difference expectedCash countedCash').lean(),
    getAlerts(),
    balanceSnapshot(),
    Setting.findOne({ key: 'main' }).lean(),
  ]);
  const pay = (m) => sum(sales, (s) => sum((s.payments || []).filter((p) => p.method === m), (p) => p.amount));
  const staff = new Map();
  for (const s of sales) { const r = staff.get(s.createdByName || 'Unknown') || { name: s.createdByName || 'Unknown', bills: 0, total: 0 }; r.bills += 1; r.total += s.total; staff.set(r.name, r); }
  return {
    date: localDay(start), shopName: setting?.shopName || 'Wellness Pharmacy',
    sales: { bills: sales.length, total: round2(sum(sales, (s) => s.total)), cash: round2(pay('cash') - sum(sales, (s) => s.changeGiven || 0)), card: round2(pay('card')), bank: round2(pay('bank_transfer')), credit: round2(pay('credit')), returns },
    profit: { netSales: profit.netSales, grossProfit: profit.grossProfit, grossMarginPercent: profit.grossMarginPercent, expenses: profit.expenses, netProfit: profit.estimatedNetProfit },
    udhaar: { given: round2(sum(custLedger.filter((l) => l.type === 'sale_credit'), (l) => l.amount)), received: round2(sum(custLedger.filter((l) => l.type === 'payment'), (l) => -l.amount)), totalOwed: balance.customerReceivables },
    topSellers: [...top].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((p) => ({ name: p.name, boxes: p.boxes, revenue: p.revenue })),
    staff: [...staff.values()].map((r) => ({ ...r, total: round2(r.total) })).sort((a, b) => b.total - a.total),
    cash: { shiftsClosed: shifts.length, difference: round2(sum(shifts, (s) => s.difference || 0)), shortOrExtra: shifts.filter((s) => s.difference).map((s) => ({ shiftNo: s.shiftNo, user: s.userName, difference: s.difference })) },
    stockAlerts: alerts.counts,
    payables: balance.supplierPayables,
    lastBackupAt: setting?.lastBackupAt || null,
  };
}

module.exports = { expiryPlan, udhaarReminders, dailySummary };
