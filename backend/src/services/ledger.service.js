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
