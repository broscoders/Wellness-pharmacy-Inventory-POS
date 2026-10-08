const Medicine = require('../models/Medicine');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const ApiError = require('../utils/ApiError');
const { toBase, unitsPerBox, unitPrice } = require('../utils/units');
const { round2 } = require('../utils/money');
const { nextNumber } = require('../utils/counter');
const { allocateFEFO, applyMovement } = require('./stock.service');
const { postCustomerLedger } = require('./ledger.service');

const hasPrice = (p = {}) => (p.box || 0) + (p.strip || 0) + (p.unit || 0) > 0;
const baseQtyOfType = (med, t) => (t === 'box' ? unitsPerBox(med) : t === 'strip' ? med.unitsPerStrip || 1 : 1);

// Undo already-applied stock movements if checkout fails half-way (no multi-document transaction needed).
async function rollbackMovements(done, userId, reason) {
  for (const m of done.reverse()) {
    try {
      await applyMovement({ batchId: m.batchId, delta: m.qty, type: 'adjustment', reason, userId });
    } catch (e) {
      console.error('ROLLBACK FAILED for batch', String(m.batchId), e.message);
    }
  }
}

async function checkout(input, user) {
  const { items, type = 'retail', customer: customerId, discount = 0, payments, notes, prescriptionConfirmed } = input;

  let customer = null;
  if (customerId) {
    customer = await Customer.findById(customerId);
    if (!customer || !customer.isActive) throw ApiError.badRequest('Customer not found or inactive');
  }

  const applied = []; // stock movements done so far (for rollback)
  const saleItems = [];
  let subtotal = 0;

  try {
    for (let i = 0; i < items.length; i += 1) {
      const line = items[i];
      const med = await Medicine.findById(line.medicine);
      if (!med || !med.isActive) throw ApiError.badRequest(`Medicine not found or inactive (line ${i + 1})`);
      if (med.requiresPrescription && !prescriptionConfirmed) {
        throw ApiError.badRequest(`"${med.name}" needs a prescription. Confirm the prescription to continue.`);
      }

      const baseQty = toBase(med, { [line.unitType]: line.quantity });
      if (baseQty <= 0) throw ApiError.badRequest(`Invalid quantity for ${med.name}`);

      // Price list: wholesale falls back to retail when no wholesale price is set.
      const list = type === 'wholesale' && hasPrice(med.wholesalePrice) ? med.wholesalePrice : med.salePrice;
      const perBase = unitPrice(list, med, line.unitType);
      if (!perBase || perBase <= 0) throw ApiError.badRequest(`Sale price is not set for "${med.name}"`);

      // FEFO: earliest non-expired batches first. Expired batches are never allocated.
      const plan = await allocateFEFO(med._id, baseQty);
      for (const { batch, quantity } of plan) {
        await applyMovement({ batchId: batch._id, delta: -quantity, type: 'sale', reason: 'POS sale', userId: user._id });
        applied.push({ batchId: batch._id, qty: quantity });

        const lineTotal = round2(perBase * quantity);
        const costPerBase = (batch.purchasePricePerBox || med.purchasePrice || 0) / unitsPerBox(med);
        subtotal += lineTotal;
        saleItems.push({
          line: i,
          medicine: med._id,
          name: med.name,
          batch: batch._id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          unitType: line.unitType,
          cartQty: line.quantity,
          baseQty: quantity,
          pricePerBase: perBase,
          lineTotal,
          costTotal: round2(costPerBase * quantity),
        });
      }
    }

    subtotal = round2(subtotal);
    if (discount > subtotal) throw ApiError.badRequest('Discount cannot be more than the bill amount');
    const total = round2(subtotal - discount);

    // Spread the invoice discount over items so returns refund the price actually paid.
    for (const it of saleItems) {
      it.netTotal = subtotal > 0 ? round2(it.lineTotal - (discount * it.lineTotal) / subtotal) : 0;
    }

    // Payments
    const creditAmount = round2(payments.filter((p) => p.method === 'credit').reduce((s, p) => s + p.amount, 0));
    const received = round2(payments.filter((p) => p.method !== 'credit').reduce((s, p) => s + p.amount, 0));
    if (creditAmount > 0) {
      if (!customer) throw ApiError.badRequest('Select a customer for credit (udhaar) sales');
      if (customer.creditLimit > 0 && customer.balance + creditAmount > customer.creditLimit) {
        throw ApiError.badRequest(`Credit limit exceeded. Limit: ${customer.creditLimit}, current balance: ${customer.balance}`);
      }
    }
    if (creditAmount > total) throw ApiError.badRequest('Credit amount cannot be more than the bill total');
    const due = round2(total - creditAmount);
    if (received < due) throw ApiError.badRequest(`Payment is short by ${round2(due - received)}`);
    const change = round2(received - due);
    const cashPaid = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
    if (change > 0 && cashPaid < change) throw ApiError.badRequest('Only cash overpayment can be returned as change');

    const invoiceNo = await nextNumber('invoice', 'INV');
    const sale = await Sale.create({
      invoiceNo,
      type,
      customer: customer?._id,
      customerName: customer?.name,
      items: saleItems,
      subtotal,
      discount,
      total,
      payments,
      paidAmount: due,
      creditAmount,
      changeGiven: change,
      notes,
      createdBy: user._id,
      createdByName: user.name,
    });

    if (creditAmount > 0) {
      await postCustomerLedger({
        customerId: customer._id, amount: creditAmount, type: 'sale_credit', sale: sale._id, invoiceNo, user, note: 'Credit sale',
      });
    }
    return sale;
  } catch (err) {
    if (applied.length) await rollbackMovements(applied, user._id, 'Rollback: sale failed');
    throw err;
  }
}

/**
 * Sales return. input.items = [{ saleItem, quantity, unitType }]
 * Stock goes back to the original batch, refund = price actually paid (after discount share).
 * Money: first reduces the customer's udhaar (if sold on credit and refundTo='credit'), rest is cash refund.
 */
async function processReturn(sale, input, user) {
  if (sale.status === 'cancelled') throw ApiError.badRequest('Cancelled invoices cannot be returned');
  const retItems = [];
  let refundAmount = 0;
  let costTotal = 0;

  // Validate everything first (no writes), so a bad line cannot leave a half-processed return.
  const wanted = new Map();
  for (const r of input.items) {
    const item = sale.items.id(r.saleItem);
    if (!item) throw ApiError.badRequest('Item does not belong to this invoice');
    const med = await Medicine.findById(item.medicine);
    const q = toBase(med, { [r.unitType]: r.quantity });
    if (q <= 0) throw ApiError.badRequest('Return quantity must be greater than zero');
    const total = (wanted.get(String(item._id)) || 0) + q;
    if (total + item.returnedBase > item.baseQty) {
      throw ApiError.badRequest(`Cannot return more than sold for ${item.name} (batch ${item.batchNumber})`);
    }
    wanted.set(String(item._id), total);
  }

  for (const r of input.items) {
    const item = sale.items.id(r.saleItem);
    if (!item) throw ApiError.badRequest('Item does not belong to this invoice');
    const med = await Medicine.findById(item.medicine);
    const baseQty = toBase(med, { [r.unitType]: r.quantity });
    if (baseQty <= 0) throw ApiError.badRequest('Return quantity must be greater than zero');
    if (baseQty + item.returnedBase > item.baseQty) {
      throw ApiError.badRequest(`Cannot return more than sold for ${item.name} (batch ${item.batchNumber})`);
    }

    // Reserve the quantity on the sale first (guards double returns): compare-and-set on the exact
    // array element, so it only applies if nobody changed returnedBase in the meantime.
    const idx = sale.items.findIndex((i) => String(i._id) === String(item._id));
    const path = `items.${idx}.returnedBase`;
    const res = await Sale.updateOne({ _id: sale._id, [path]: item.returnedBase }, { $set: { [path]: item.returnedBase + baseQty } });
    if (res.modifiedCount !== 1) throw ApiError.conflict('This item was just returned by someone else. Reload and try again.');
    item.returnedBase += baseQty;

    const refund = round2((item.netTotal / item.baseQty) * baseQty);
    const cost = round2((item.costTotal / item.baseQty) * baseQty);
    refundAmount += refund;
    costTotal += cost;
    retItems.push({ saleItem: item._id, medicine: item.medicine, name: item.name, batch: item.batch, batchNumber: item.batchNumber, baseQty, refund, cost });

    await applyMovement({
      batchId: item.batch, delta: baseQty, type: 'sale_return', reason: input.reason, refModel: 'Sale', refId: sale._id, userId: user._id,
    });
  }
  refundAmount = round2(refundAmount);

  let creditAdjusted = 0;
  if (sale.customer && sale.creditAmount > 0 && input.refundTo !== 'cash') {
    const cust = await Customer.findById(sale.customer);
    creditAdjusted = round2(Math.min(refundAmount, Math.max(cust.balance, 0)));
    if (creditAdjusted > 0) {
      await postCustomerLedger({
        customerId: sale.customer, amount: -creditAdjusted, type: 'return_adjust', sale: sale._id, invoiceNo: sale.invoiceNo, user, note: 'Sales return adjusted against udhaar',
      });
    }
  }
  const cashRefund = round2(refundAmount - creditAdjusted);

  const returnNo = await nextNumber('return', 'RET');
  const doc = await SaleReturn.create({
    returnNo,
    sale: sale._id,
    invoiceNo: sale.invoiceNo,
    customer: sale.customer,
    items: retItems,
    refundAmount,
    cashRefund,
    creditAdjusted,
    reason: input.reason,
    createdBy: user._id,
    createdByName: user.name,
  });

  const fresh = await Sale.findById(sale._id);
  const fully = fresh.items.every((i) => i.returnedBase >= i.baseQty);
  fresh.status = fully ? 'returned' : 'partially_returned';
  await fresh.save();
  return { saleReturn: doc, sale: fresh };
}

// Cancel a whole invoice (admin). Restores all stock and removes the udhaar it created.
async function cancelSale(sale, reason, user) {
  if (sale.status === 'cancelled') throw ApiError.badRequest('Invoice is already cancelled');
  if (sale.items.some((i) => i.returnedBase > 0)) throw ApiError.badRequest('Invoice has returns. Cancellation is not allowed.');

  // flip status first so a double click cannot cancel (and restock) twice
  const res = await Sale.updateOne(
    { _id: sale._id, status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled', cancelReason: reason, cancelledBy: user._id, cancelledAt: new Date() } }
  );
  if (res.modifiedCount !== 1) throw ApiError.conflict('Invoice was already cancelled');

  for (const it of sale.items) {
    await applyMovement({
      batchId: it.batch, delta: it.baseQty, type: 'sale_return', reason: `Invoice ${sale.invoiceNo} cancelled: ${reason}`, refModel: 'Sale', refId: sale._id, userId: user._id,
    });
  }
  if (sale.customer && sale.creditAmount > 0) {
    await postCustomerLedger({
      customerId: sale.customer, amount: -sale.creditAmount, type: 'sale_cancel', sale: sale._id, invoiceNo: sale.invoiceNo, user, note: 'Invoice cancelled',
    });
  }
  return Sale.findById(sale._id);
}

module.exports = { checkout, processReturn, cancelSale, baseQtyOfType };
