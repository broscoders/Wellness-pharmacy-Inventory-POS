const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const { round2 } = require('../utils/money');

// Atomically change a customer's udhaar balance and write a ledger row.
async function postCustomerLedger({ customerId, amount, type, method, note, sale, invoiceNo, user }) {
  const customer = await Customer.findByIdAndUpdate(customerId, { $inc: { balance: round2(amount) } }, { returnDocument: 'after' });
  await CustomerLedger.create({
    customer: customerId,
    type,
    amount: round2(amount),
    balanceAfter: round2(customer.balance),
    method,
    note,
    sale,
    invoiceNo,
    user: user?._id,
    userName: user?.name,
  });
  return customer;
}

module.exports = { postCustomerLedger };

const Supplier = require('../models/Supplier');
const SupplierLedger = require('../models/SupplierLedger');

// Atomically change what we owe a supplier and write a ledger row.
async function postSupplierLedger({ supplierId, amount, type, method, note, purchase, refNo, user }) {
  const supplier = await Supplier.findByIdAndUpdate(supplierId, { $inc: { balance: round2(amount) } }, { returnDocument: 'after' });
  await SupplierLedger.create({
    supplier: supplierId, type, amount: round2(amount), balanceAfter: round2(supplier.balance), method, note, purchase, refNo, user: user?._id, userName: user?.name,
  });
  return supplier;
}

module.exports.postSupplierLedger = postSupplierLedger;
