const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Expense = require('../models/Expense');
const CustomerLedger = require('../models/CustomerLedger');
const SupplierLedger = require('../models/SupplierLedger');
const { round2 } = require('../utils/money');

const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const pay = (sale, method) => sum(sale.payments || [], (p) => (p.method === method ? p.amount : 0));
// cash really kept from a bill = cash handed over minus the change given back
const cashKept = (sale) => round2(pay(sale, 'cash') - (sale.changeGiven || 0));

/**
 * What should be in this cashier's drawer, built from everything this user did between opening and `until`:
 *   opening cash + cash sales + udhaar payments received in cash + cash put in
 *   - cash refunds on returns - refunds of earlier-shift invoices cancelled now - supplier payments in cash
 *   - cash expenses - cash taken out
 */
async function shiftSummary(shift, until = new Date()) {
  const range = { $gte: shift.openedAt, $lt: until };
  const uid = shift.user;
  const [sales, returns, cancelledEarlier, expenses, custPays, suppPays] = await Promise.all([
    Sale.find({ createdBy: uid, createdAt: range, status: { $ne: 'cancelled' } }).select('payments changeGiven total').lean(),
    SaleReturn.find({ createdBy: uid, createdAt: range }).select('cashRefund').lean(),
    Sale.find({ cancelledBy: uid, cancelledAt: range, createdAt: { $lt: shift.openedAt } }).select('payments changeGiven').lean(),
    Expense.find({ createdBy: uid, createdAt: range, paymentMethod: 'cash', isVoided: false }).select('amount').lean(),
    CustomerLedger.find({ user: uid, createdAt: range, type: 'payment', method: 'cash' }).select('amount').lean(),
    SupplierLedger.find({ user: uid, createdAt: range, type: 'payment', method: 'cash' }).select('amount').lean(),
  ]);

  const cashSales = round2(sum(sales, cashKept));
  const customerPayments = round2(sum(custPays, (l) => -l.amount));
  const cashIn = round2(sum((shift.movements || []).filter((m) => m.type === 'in'), (m) => m.amount));
  const cashRefunds = round2(sum(returns, (r) => r.cashRefund || 0));
  const cancelledRefunds = round2(sum(cancelledEarlier, cashKept));
  const supplierPayments = round2(sum(suppPays, (l) => -l.amount));
  const expenseCash = round2(sum(expenses, (e) => e.amount));
  const cashOut = round2(sum((shift.movements || []).filter((m) => m.type === 'out'), (m) => m.amount));

  const expected = round2(shift.openingCash + cashSales + customerPayments + cashIn - cashRefunds - cancelledRefunds - supplierPayments - expenseCash - cashOut);
  return {
    openingCash: shift.openingCash,
    salesCount: sales.length,
    salesTotal: round2(sum(sales, (s) => s.total)),
    cashSales,
    cardSales: round2(sum(sales, (s) => pay(s, 'card'))),
    bankSales: round2(sum(sales, (s) => pay(s, 'bank_transfer'))),
    creditSales: round2(sum(sales, (s) => pay(s, 'credit'))),
    customerPayments, cashIn, cashRefunds, cancelledRefunds, supplierPayments, expenses: expenseCash, cashOut,
    expectedCash: expected,
  };
}

module.exports = { shiftSummary };
