const Medicine = require('../models/Medicine');
const Supplier = require('../models/Supplier');
const Batch = require('../models/Batch');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const ApiError = require('../utils/ApiError');
const { toBase, unitsPerBox, parseExpiry } = require('../utils/units');
const { round2 } = require('../utils/money');
const { nextNumber } = require('../utils/counter');
const { applyMovement } = require('./stock.service');
const { postSupplierLedger } = require('./ledger.service');

async function rollback(done, userId) {
  for (const m of done.reverse()) {
    try {
      await applyMovement({ batchId: m.batchId, delta: -m.qty, type: 'adjustment', reason: 'Rollback: purchase failed', userId });
    } catch (e) {
      console.error('PURCHASE ROLLBACK FAILED for batch', String(m.batchId), e.message);
    }
  }
}

/**
 * Record a purchase: stock goes up (new or existing batch), supplier payable goes up by the unpaid part.
 * input.items = [{ medicine, batchNumber, expiryDate, quantity:{box,strip,unit}, pricePerBox, discountPercent }]
 */
async function createPurchase(input, user) {
  const supplier = await Supplier.findById(input.supplier);
  if (!supplier || !supplier.isActive) throw ApiError.badRequest('Supplier not found or inactive');

  const done = []; // stock added so far (for rollback)
  const items = [];
  let subtotal = 0;

  try {
    for (const line of input.items) {
      const med = await Medicine.findById(line.medicine);
      if (!med || !med.isActive) throw ApiError.badRequest('Medicine not found or inactive');
      const baseQty = toBase(med, line.quantity);
      if (baseQty <= 0) throw ApiError.badRequest(`Quantity must be greater than zero for ${med.name}`);
      const expiry = parseExpiry(line.expiryDate);
      const batchNumber = line.batchNumber.trim().toUpperCase();

      let batch = await Batch.findOne({ medicine: med._id, batchNumber });
      if (batch) {
        // Same batch number again: expiry must match, cost becomes the weighted average.
        if (Math.abs(batch.expiryDate - expiry) > 24 * 3600 * 1000) {
          throw ApiError.badRequest(`Batch ${batchNumber} of ${med.name} already exists with a different expiry date`);
        }
        const oldValue = batch.purchasePricePerBox * batch.quantity;
        const newValue = line.pricePerBox * baseQty;
        batch.purchasePricePerBox = round2((oldValue + newValue) / (batch.quantity + baseQty)) ;
        // weighted by units, expressed per box (units cancel out because both are per-box prices)
        batch.isActive = true;
        await batch.save();
      } else {
        batch = await Batch.create({
          medicine: med._id, batchNumber, expiryDate: expiry, quantity: 0, purchasePricePerBox: line.pricePerBox, supplier: supplier._id,
        });
      }

      await applyMovement({
        batchId: batch._id, delta: baseQty, type: 'purchase', reason: `Purchase from ${supplier.name}`, refModel: 'Purchase', userId: user._id,
      });
      done.push({ batchId: batch._id, qty: baseQty });

      const gross = (line.pricePerBox * baseQty) / unitsPerBox(med);
      const lineTotal = round2(gross * (1 - (line.discountPercent || 0) / 100));
      subtotal += lineTotal;
      items.push({
        medicine: med._id, name: med.name, batch: batch._id, batchNumber, expiryDate: expiry, baseQty,
        pricePerBox: line.pricePerBox, discountPercent: line.discountPercent || 0, lineTotal,
      });

      // keep the medicine's default cost price in sync with the latest purchase
      if (med.purchasePrice !== line.pricePerBox) {
        await Medicine.updateOne({ _id: med._id }, { $set: { purchasePrice: line.pricePerBox } });
      }
    }

    subtotal = round2(subtotal);
    const discount = input.discount || 0;
    if (discount > subtotal) throw ApiError.badRequest('Discount cannot be more than the purchase amount');
    const total = round2(subtotal - discount);
    const paidAmount = round2(input.paidAmount || 0);
    if (paidAmount > total) throw ApiError.badRequest('Paid amount cannot be more than the total');
    const dueAmount = round2(total - paidAmount);

    const purchaseNo = await nextNumber('purchase', 'PUR');
    const purchase = await Purchase.create({
      purchaseNo, supplier: supplier._id, supplierName: supplier.name, supplierInvoiceNo: input.supplierInvoiceNo,
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
      items, subtotal, discount, total, paidAmount, paymentMethod: input.paymentMethod || 'cash', dueAmount,
      notes: input.notes, createdBy: user._id, createdByName: user.name,
    });

    // Ledger: purchase adds the full total to what we owe; the payment (if any) takes its part back.
    await postSupplierLedger({ supplierId: supplier._id, amount: total, type: 'purchase', purchase: purchase._id, refNo: purchaseNo, user, note: input.supplierInvoiceNo ? `Supplier invoice ${input.supplierInvoiceNo}` : 'Purchase' });
    if (paidAmount > 0) {
      await postSupplierLedger({ supplierId: supplier._id, amount: -paidAmount, type: 'payment', method: input.paymentMethod || 'cash', purchase: purchase._id, refNo: purchaseNo, user, note: 'Paid at purchase' });
    }
    return purchase;
  } catch (err) {
    if (done.length) await rollback(done, user._id);
    throw err;
  }
}

/**
 * Return goods to the supplier. input.items = [{ purchaseItem, quantity:{box,strip,unit} }]
 * Stock leaves the batch (fails if that much is no longer in stock); payable to supplier goes down.
 */
async function createPurchaseReturn(purchase, input, user) {
  const lines = [];
  const wanted = new Map();
  for (const r of input.items) {
    const item = purchase.items.id(r.purchaseItem);
    if (!item) throw ApiError.badRequest('Item does not belong to this purchase');
    const med = await Medicine.findById(item.medicine);
    const q = toBase(med, r.quantity);
    if (q <= 0) throw ApiError.badRequest('Return quantity must be greater than zero');
    const total = (wanted.get(String(item._id)) || 0) + q;
    if (total + item.returnedBase > item.baseQty) throw ApiError.badRequest(`Cannot return more than purchased for ${item.name} (batch ${item.batchNumber})`);
    wanted.set(String(item._id), total);
    lines.push({ item, q });
  }

  const removed = [];
  const retItems = [];
  let totalValue = 0;
  try {
    for (const { item, q } of lines) {
      await applyMovement({ batchId: item.batch, delta: -q, type: 'purchase_return', reason: input.reason, refModel: 'Purchase', refId: purchase._id, userId: user._id });
      removed.push({ batchId: item.batch, qty: q });

      const idx = purchase.items.findIndex((i) => String(i._id) === String(item._id));
      const path = `items.${idx}.returnedBase`;
      const res = await Purchase.updateOne({ _id: purchase._id, [path]: item.returnedBase }, { $set: { [path]: item.returnedBase + q } });
      if (res.modifiedCount !== 1) throw ApiError.conflict('This item was just returned by someone else. Reload and try again.');
      item.returnedBase += q;

      // value of returned goods = line price minus this line's share of the invoice discount
      const share = purchase.subtotal > 0 ? 1 - (purchase.discount || 0) / purchase.subtotal : 1;
      const value = round2((item.lineTotal / item.baseQty) * q * share);
      totalValue += value;
      retItems.push({ purchaseItem: item._id, medicine: item.medicine, name: item.name, batch: item.batch, batchNumber: item.batchNumber, baseQty: q, value });
    }
  } catch (err) {
    for (const m of removed.reverse()) {
      await applyMovement({ batchId: m.batchId, delta: m.qty, type: 'adjustment', reason: 'Rollback: purchase return failed', userId: user._id }).catch(() => {});
    }
    throw err;
  }
  totalValue = round2(totalValue);

  const returnNo = await nextNumber('purchase_return', 'PRET');
  const doc = await PurchaseReturn.create({
    returnNo, purchase: purchase._id, purchaseNo: purchase.purchaseNo, supplier: purchase.supplier, items: retItems, totalValue,
    reason: input.reason, createdBy: user._id, createdByName: user.name,
  });
  await postSupplierLedger({ supplierId: purchase.supplier, amount: -totalValue, type: 'purchase_return', purchase: purchase._id, refNo: returnNo, user, note: input.reason });

  const fresh = await Purchase.findById(purchase._id);
  fresh.status = fresh.items.every((i) => i.returnedBase >= i.baseQty) ? 'returned' : 'partially_returned';
  await fresh.save();
  return { purchaseReturn: doc, purchase: fresh };
}

module.exports = { createPurchase, createPurchaseReturn };
