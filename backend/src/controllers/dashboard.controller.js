const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Purchase = require('../models/Purchase');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Batch = require('../models/Batch');
const asyncHandler = require('../utils/asyncHandler');
const { round2, dayRange } = require('../utils/money');
const { unitsPerBox } = require('../utils/units');
const { getAlerts } = require('../services/inventory.service');

const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

const summary = asyncHandler(async (req, res) => {
  const { start, end } = dayRange();
  const range = { $gte: start, $lt: end };

  const [sales, returns, purchases, customers, suppliers, batches, alerts, recentSales, recentPurchases] = await Promise.all([
    Sale.find({ createdAt: range, status: { $ne: 'cancelled' } }),
    SaleReturn.find({ createdAt: range }),
    Purchase.find({ purchaseDate: range }),
    Customer.find({ balance: { $gt: 0 } }).select('balance'),
    Supplier.find({ balance: { $gt: 0 } }).select('balance'),
    Batch.find({ isActive: true, quantity: { $gt: 0 } }).populate('medicine', 'stripsPerBox unitsPerStrip purchasePrice').lean(),
    getAlerts(),
    Sale.find().select('-items').sort({ createdAt: -1 }).limit(8),
    Purchase.find().select('-items').sort({ purchaseDate: -1 }).limit(8),
  ]);

  // Today's sales = billed today minus value returned today.
  const billed = sum(sales, (s) => s.total);
  const returnedValue = sum(returns, (r) => r.refundAmount);
  const salesNet = round2(billed - returnedValue);

  // Gross profit = what customers paid for goods - what the goods cost us (returns reverse both).
  const revenue = sum(sales, (s) => sum(s.items, (i) => i.netTotal));
  const cost = sum(sales, (s) => sum(s.items, (i) => i.costTotal));
  const retCost = sum(returns, (r) => sum(r.items, (i) => i.cost));
  const profit = round2(revenue - returnedValue - (cost - retCost));

  const now = new Date();
  let totalUnits = 0;
  let stockValue = 0;
  for (const b of batches) {
    if (!b.medicine) continue;
    totalUnits += b.quantity;
    if (b.expiryDate >= now) stockValue += ((b.purchasePricePerBox || b.medicine.purchasePrice || 0) / unitsPerBox(b.medicine)) * b.quantity;
  }

  const recent = [
    ...recentSales.map((s) => ({ kind: 'sale', id: s._id, ref: s.invoiceNo, party: s.customerName || 'Walk-in', amount: s.total, status: s.status, at: s.createdAt })),
    ...recentPurchases.map((p) => ({ kind: 'purchase', id: p._id, ref: p.purchaseNo, party: p.supplierName, amount: p.total, status: p.status, at: p.purchaseDate })),
  ].sort((a, b) => b.at - a.at).slice(0, 10);

  const data = {
      todaySales: salesNet,
      todaySalesCount: sales.length,
      todayPurchases: round2(sum(purchases, (p) => p.total)),
      todayProfit: profit,
      totalStockUnits: totalUnits,
      stockValue: Math.round(stockValue),
      lowStock: alerts.counts.lowStock,
      outOfStock: alerts.counts.outOfStock,
      nearExpiry: alerts.counts.nearExpiry30 + alerts.counts.nearExpiry60 + alerts.counts.nearExpiry90,
      nearExpiry30: alerts.counts.nearExpiry30,
      expired: alerts.counts.expired,
      customerOutstanding: round2(sum(customers, (c) => c.balance)),
      supplierPayables: round2(sum(suppliers, (s) => s.balance)),
      recentTransactions: recent,
  };

  // Profit, stock value and payables are owner-only figures.
  if (req.user.role !== 'admin') {
    delete data.todayProfit;
    delete data.stockValue;
    delete data.supplierPayables;
    delete data.todayPurchases;
  }
  res.json({ success: true, data });
});

module.exports = { summary };
