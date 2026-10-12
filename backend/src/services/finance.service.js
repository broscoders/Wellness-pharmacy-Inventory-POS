const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Purchase = require('../models/Purchase');
const Expense = require('../models/Expense');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const { round2, rangeFromQuery, localDay } = require('../utils/money');
const { unitsPerBox } = require('../utils/units');

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0); // one decimal, 0 when there is nothing to divide by

/**
 * Profit and loss for [start, end):
 *   net sales = sales - returns
 *   gross profit = net sales - purchase cost of the exact batches sold
 *   net profit = gross profit - ALL expenses (rent, bills, salaries and the rest)
 * Margins are a share of net sales.
 */
async function profitFor(start, end) {
  const range = (field) => ({ [field]: { $gte: start, $lt: end } });
  const [list, returns, purchases, expenses] = await Promise.all([
    Sale.find({ ...range('createdAt'), status: { $ne: 'cancelled' } }).select('total items.costTotal').lean(),
    SaleReturn.find(range('createdAt')).select('refundAmount items.cost').lean(),
    Purchase.find(range('purchaseDate')).select('total').lean(),
    Expense.find({ ...range('date'), isVoided: false }).select('amount category').lean(),
  ]);
  const sales = sum(list, (s) => s.total);
  const returned = sum(returns, (r) => r.refundAmount);
  const cogs = sum(list, (s) => sum(s.items, (i) => i.costTotal)) - sum(returns, (r) => sum(r.items, (i) => i.cost));
  const netSales = sales - returned;
  const gross = netSales - cogs;
  const exp = sum(expenses, (e) => e.amount);
  const byCategory = {};
  expenses.forEach((e) => { byCategory[e.category] = round2((byCategory[e.category] || 0) + e.amount); });
  const net = gross - exp;
  return {
    sales: round2(sales), salesReturns: round2(returned), netSales: round2(netSales),
    purchaseCostOfGoodsSold: round2(cogs), grossProfit: round2(gross), grossMarginPercent: pct(gross, netSales),
    expenses: round2(exp), expensesByCategory: byCategory, expenseRatioPercent: pct(exp, netSales),
    estimatedNetProfit: round2(net), netMarginPercent: pct(net, netSales),
    invoices: list.length, purchasesMade: round2(sum(purchases, (p) => p.total)),
  };
}

// The same-length period right before [start, end), for "compared with the last period".
const previousRange = (start, end) => ({ start: new Date(start.getTime() - (end.getTime() - start.getTime())), end: start });

// Last `n` calendar months (oldest first), each as a full profit-and-loss.
async function monthlyTrend(n = 6) {
  const today = localDay(new Date());
  let y = +today.slice(0, 4); let m = +today.slice(5, 7);
  const months = [];
  for (let i = 0; i < n; i += 1) { months.unshift({ y, m }); m -= 1; if (m === 0) { m = 12; y -= 1; } }
  return Promise.all(months.map(async ({ y: yy, m: mm }) => {
    const from = `${yy}-${String(mm).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const r = rangeFromQuery({ from, to: `${yy}-${String(mm).padStart(2, '0')}-${String(last).padStart(2, '0')}` });
    const p = await profitFor(r.start, r.end);
    return { month: from.slice(0, 7), netSales: p.netSales, grossProfit: p.grossProfit, expenses: p.expenses, netProfit: p.estimatedNetProfit, netMarginPercent: p.netMarginPercent };
  }));
}

// What the business owns and owes right now.
async function balanceSnapshot() {
  const [batches, meds, customers, suppliers] = await Promise.all([
    Batch.find({ isActive: true, quantity: { $gt: 0 }, expiryDate: { $gte: new Date() } }).select('medicine quantity purchasePricePerBox').lean(),
    Medicine.find().select('stripsPerBox unitsPerStrip purchasePrice').lean(),
    Customer.find({ balance: { $gt: 0 } }).select('balance').lean(),
    Supplier.find({ balance: { $gt: 0 } }).select('balance').lean(),
  ]);
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const stockAtCost = sum(batches, (b) => { const m = byId.get(String(b.medicine)); return m ? ((b.purchasePricePerBox || m.purchasePrice || 0) / unitsPerBox(m)) * b.quantity : 0; });
  const receivables = sum(customers, (c) => c.balance); const payables = sum(suppliers, (s) => s.balance);
  return { stockValueAtCost: round2(stockAtCost), customerReceivables: round2(receivables), supplierPayables: round2(payables), netPosition: round2(stockAtCost + receivables - payables) };
}

// Prices that lose money or break the rules: the cheapest way to protect profit.
async function pricingIssues() {
  const meds = await Medicine.find({ isActive: true }).select('name genericName purchasePrice salePrice stripsPerBox unitsPerStrip mrp').lean();
  const out = [];
  for (const m of meds) {
    const cost = m.purchasePrice || 0;
    const upb = unitsPerBox(m);
    const costOf = { box: cost, strip: cost / (m.stripsPerBox || 1), unit: cost / upb };
    const sp = m.salePrice || {};
    const entries = ['box', 'strip', 'unit'].filter((k) => sp[k] > 0 && cost > 0).map((k) => ({ k, price: sp[k], margin: pct(sp[k] - costOf[k], sp[k]) }));
    const worst = entries.length ? entries.reduce((a, b) => (b.margin < a.margin ? b : a)) : null;
    const base = { _id: m._id, name: m.name, purchasePrice: cost, salePriceBox: sp.box || 0, mrp: m.mrp || 0 };
    if (!sp.box && !sp.strip && !sp.unit) out.push({ ...base, issue: 'no_price', detail: 'No sale price set: it cannot be sold' });
    else if (worst && worst.margin < 0) out.push({ ...base, issue: 'below_cost', margin: worst.margin, detail: `Sold below cost per ${worst.k}` });
    else if (worst && worst.margin < 5) out.push({ ...base, issue: 'low_margin', margin: worst.margin, detail: `Margin is only ${worst.margin}% per ${worst.k}` });
    if (m.mrp > 0 && sp.box > m.mrp) out.push({ ...base, issue: 'above_mrp', detail: `Box price ${sp.box} is above the MRP ${m.mrp}` });
  }
  const order = { below_cost: 0, above_mrp: 1, no_price: 2, low_margin: 3 };
  return out.sort((a, b) => order[a.issue] - order[b.issue] || (a.margin ?? 0) - (b.margin ?? 0));
}

module.exports = { profitFor, previousRange, monthlyTrend, balanceSnapshot, pricingIssues, pct };
