const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const Supplier = require('../models/Supplier');
const SupplierLedger = require('../models/SupplierLedger');
const Expense = require('../models/Expense');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const StockMovement = require('../models/StockMovement');
const asyncHandler = require('../utils/asyncHandler');
const { round2, rangeFromQuery, localDay } = require('../utils/money');
const { unitsPerBox, fromBase } = require('../utils/units');
const { getAlerts } = require('../services/inventory.service');
const { getPagination, pageMeta } = require('../utils/pagination');

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const meta = ({ start, end }) => ({ from: localDay(start), to: localDay(new Date(end.getTime() - 1)) });

// ---- Sales report: daily/weekly/monthly, retail vs wholesale, payment mix, staff-wise
const sales = asyncHandler(async (req, res) => {
  const range = rangeFromQuery(req.query);
  const filter = { createdAt: { $gte: range.start, $lt: range.end } };
  const [list, returns] = await Promise.all([
    Sale.find({ ...filter, status: { $ne: 'cancelled' } }).lean(),
    SaleReturn.find(filter).lean(),
  ]);

  const keyOf = (d) => {
    const day = localDay(d);
    if (req.query.groupBy === 'month') return day.slice(0, 7);
    if (req.query.groupBy === 'week') {
      const t = new Date(`${day}T00:00:00Z`);
      const dow = (t.getUTCDay() + 6) % 7; // Monday start
      t.setUTCDate(t.getUTCDate() - dow);
      return `Week of ${t.toISOString().slice(0, 10)}`;
    }
    return day;
  };

  const rows = new Map();
  const row = (k) => { if (!rows.has(k)) rows.set(k, { period: k, invoices: 0, gross: 0, returns: 0, net: 0, cost: 0, profit: 0 }); return rows.get(k); };
  const byType = { retail: { invoices: 0, total: 0 }, wholesale: { invoices: 0, total: 0 } };
  const byPayment = { cash: 0, card: 0, bank_transfer: 0, credit: 0 };
  const staff = new Map();

  for (const s of list) {
    const r = row(keyOf(s.createdAt));
    const cost = sum(s.items, (i) => i.costTotal);
    r.invoices += 1; r.gross += s.total; r.cost += cost; r.profit += s.total - cost;
    byType[s.type].invoices += 1; byType[s.type].total += s.total;
    s.payments.forEach((p) => { byPayment[p.method] += p.amount; });
    byPayment.cash -= s.changeGiven || 0; // change handed back is not income
    const st = staff.get(s.createdByName || 'Unknown') || { staff: s.createdByName || 'Unknown', invoices: 0, total: 0 };
    st.invoices += 1; st.total += s.total; staff.set(st.staff, st);
  }
  for (const rt of returns) {
    const r = row(keyOf(rt.createdAt));
    const cost = sum(rt.items, (i) => i.cost);
    r.returns += rt.refundAmount; r.profit -= rt.refundAmount - cost; r.cost -= cost;
  }
  const data = [...rows.values()].sort((a, b) => a.period.localeCompare(b.period)).map((r) => ({
    period: r.period, invoices: r.invoices, gross: round2(r.gross), returns: round2(r.returns), net: round2(r.gross - r.returns), cost: round2(r.cost), profit: round2(r.profit),
  }));
  const totals = data.reduce((t, r) => ({ invoices: t.invoices + r.invoices, gross: t.gross + r.gross, returns: t.returns + r.returns, net: t.net + r.net, cost: t.cost + r.cost, profit: t.profit + r.profit }), { invoices: 0, gross: 0, returns: 0, net: 0, cost: 0, profit: 0 });
  Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });
  const r2 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? round2(v) : v]));

  res.json({
    success: true, range: meta(range), data, totals,
    byType: { retail: r2(byType.retail), wholesale: r2(byType.wholesale) },
    byPayment: r2(byPayment),
    byStaff: [...staff.values()].map(r2).sort((a, b) => b.total - a.total),
  });
});

// ---- Inventory report: stock, value, low/out/expired/near-expiry
const inventory = asyncHandler(async (req, res) => {
  const [meds, batches, alerts] = await Promise.all([
    Medicine.find({ isActive: true }).populate('category', 'name').sort({ name: 1 }).lean(),
    Batch.find({ isActive: true, quantity: { $gt: 0 } }).lean(),
    getAlerts(),
  ]);
  const now = new Date();
  const per = new Map();
  for (const b of batches) {
    const m = meds.find((x) => String(x._id) === String(b.medicine));
    if (!m) continue;
    const s = per.get(String(m._id)) || { sellable: 0, expired: 0, value: 0, expiredValue: 0 };
    const value = ((b.purchasePricePerBox || m.purchasePrice || 0) / unitsPerBox(m)) * b.quantity;
    if (b.expiryDate < now) { s.expired += b.quantity; s.expiredValue += value; } else { s.sellable += b.quantity; s.value += value; }
    per.set(String(m._id), s);
  }
  const stock = meds.map((m) => {
    const s = per.get(String(m._id)) || { sellable: 0, expired: 0, value: 0, expiredValue: 0 };
    return { _id: m._id, name: m.name, category: m.category?.name || '', minStockLevel: m.minStockLevel, sellable: s.sellable, expired: s.expired, display: fromBase(m, s.sellable), value: round2(s.value), expiredValue: round2(s.expiredValue) };
  });
  res.json({
    success: true,
    data: { stock, lowStock: alerts.data.lowStock, outOfStock: alerts.data.outOfStock, expired: alerts.data.expired, nearExpiry: alerts.data.nearExpiry },
    totals: { stockValue: round2(sum(stock, (s) => s.value)), expiredValue: round2(sum(stock, (s) => s.expiredValue)), medicines: stock.length },
  });
});

const movements = asyncHandler(async (req, res) => {
  const range = rangeFromQuery(req.query);
  const { page, limit, skip } = getPagination(req.query, 50, 200);
  const filter = { createdAt: { $gte: range.start, $lt: range.end } };
  if (req.query.medicine) filter.medicine = req.query.medicine;
  if (req.query.type) filter.type = req.query.type;
  const [data, total] = await Promise.all([
    StockMovement.find(filter).populate('medicine', 'name').populate('batch', 'batchNumber').populate('user', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    StockMovement.countDocuments(filter),
  ]);
  res.json({ success: true, range: meta(range), data, meta: pageMeta(total, page, limit) });
});

// ---- Supplier report
const suppliers = asyncHandler(async (req, res) => {
  const range = rangeFromQuery(req.query);
  const f = (field) => ({ [field]: { $gte: range.start, $lt: range.end } });
  const [sups, purchases, payments, returns] = await Promise.all([
    Supplier.find().sort({ name: 1 }).lean(),
    Purchase.find(f('purchaseDate')).select('supplier total').lean(),
    SupplierLedger.find({ ...f('createdAt'), type: 'payment' }).select('supplier amount').lean(),
    PurchaseReturn.find(f('createdAt')).select('supplier totalValue').lean(),
  ]);
  const data = sups.map((s) => {
    const id = String(s._id);
    return {
      _id: s._id, name: s.name, phone: s.phone,
      purchases: round2(sum(purchases.filter((p) => String(p.supplier) === id), (p) => p.total)),
      payments: round2(-sum(payments.filter((p) => String(p.supplier) === id), (p) => p.amount)),
      returns: round2(sum(returns.filter((p) => String(p.supplier) === id), (p) => p.totalValue)),
      outstanding: round2(s.balance),
    };
  }).filter((r) => r.purchases || r.payments || r.returns || r.outstanding);
  res.json({ success: true, range: meta(range), data, totals: { purchases: round2(sum(data, (r) => r.purchases)), payments: round2(sum(data, (r) => r.payments)), returns: round2(sum(data, (r) => r.returns)), outstanding: round2(sum(data, (r) => r.outstanding)) } });
});

// ---- Customer report (purchases, udhaar, payments, receivables)
const customers = asyncHandler(async (req, res) => {
  const range = rangeFromQuery(req.query);
  const f = { createdAt: { $gte: range.start, $lt: range.end } };
  const [custs, list, payments] = await Promise.all([
    Customer.find().sort({ name: 1 }).lean(),
    Sale.find({ ...f, status: { $ne: 'cancelled' }, customer: { $exists: true } }).select('customer total creditAmount').lean(),
    CustomerLedger.find({ ...f, type: 'payment' }).select('customer amount').lean(),
  ]);
  const data = custs.map((c) => {
    const id = String(c._id);
    const mine = list.filter((s) => String(s.customer) === id);
    return {
      _id: c._id, name: c.name, phone: c.phone, invoices: mine.length,
      purchases: round2(sum(mine, (s) => s.total)), credit: round2(sum(mine, (s) => s.creditAmount)),
      payments: round2(-sum(payments.filter((p) => String(p.customer) === id), (p) => p.amount)), outstanding: round2(c.balance),
    };
  }).filter((r) => r.invoices || r.payments || r.outstanding);
  res.json({ success: true, range: meta(range), data, totals: { purchases: round2(sum(data, (r) => r.purchases)), credit: round2(sum(data, (r) => r.credit)), payments: round2(sum(data, (r) => r.payments)), outstanding: round2(sum(data, (r) => r.outstanding)) } });
});

// ---- Profit & financial report
const profit = asyncHandler(async (req, res) => {
  const range = rangeFromQuery(req.query);
  const f = (field) => ({ [field]: { $gte: range.start, $lt: range.end } });
  const [list, returns, purchases, expenses] = await Promise.all([
    Sale.find({ ...f('createdAt'), status: { $ne: 'cancelled' } }).lean(),
    SaleReturn.find(f('createdAt')).lean(),
    Purchase.find(f('purchaseDate')).select('total').lean(),
    Expense.find({ ...f('date'), isVoided: false }).lean(),
  ]);
  const sales = sum(list, (s) => s.total);
  const returned = sum(returns, (r) => r.refundAmount);
  const cogs = sum(list, (s) => sum(s.items, (i) => i.costTotal)) - sum(returns, (r) => sum(r.items, (i) => i.cost));
  const gross = sales - returned - cogs;
  const exp = sum(expenses, (e) => e.amount);
  const byCategory = {};
  expenses.forEach((e) => { byCategory[e.category] = round2((byCategory[e.category] || 0) + e.amount); });
  res.json({
    success: true, range: meta(range),
    data: {
      sales: round2(sales), salesReturns: round2(returned), netSales: round2(sales - returned),
      purchaseCostOfGoodsSold: round2(cogs), grossProfit: round2(gross),
      expenses: round2(exp), expensesByCategory: byCategory, estimatedNetProfit: round2(gross - exp),
      purchasesMade: round2(sum(purchases, (p) => p.total)),
    },
    note: 'Cost of goods sold uses the purchase cost of the exact batches sold. Purchases made is shown for information only.',
  });
});

module.exports = { sales, inventory, movements, suppliers, customers, profit };
