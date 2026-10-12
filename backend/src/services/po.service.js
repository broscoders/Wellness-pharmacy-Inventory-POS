const Medicine = require('../models/Medicine');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const ApiError = require('../utils/ApiError');
const { round2 } = require('../utils/money');
const { unitsPerBox } = require('../utils/units');
const { nextNumber } = require('../utils/counter');
const { getAlerts, suggestedBoxes } = require('./inventory.service');

const OPEN = ['draft', 'sent', 'partial'];

async function buildItems(lines) {
  const ids = [...new Set(lines.map((l) => String(l.medicine)))];
  const meds = await Medicine.find({ _id: { $in: ids } }).lean();
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const seen = new Set();
  return lines.map((l) => {
    const m = byId.get(String(l.medicine));
    if (!m || !m.isActive) throw ApiError.badRequest('A medicine on this order was not found or is inactive');
    if (seen.has(String(m._id))) throw ApiError.badRequest(`${m.name} is on the order twice. Combine the quantities into one line.`);
    seen.add(String(m._id));
    return { medicine: m._id, name: m.name, unitsPerBox: unitsPerBox(m), orderedBoxes: l.boxes, costPerBox: l.costPerBox ?? m.purchasePrice ?? 0 };
  });
}
const estimate = (items) => round2(items.reduce((s, i) => s + i.orderedBoxes * (i.costPerBox || 0), 0));

async function createOrder({ supplier: supplierId, items, expectedDate, notes }, user) {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier || !supplier.isActive) throw ApiError.badRequest('Supplier not found or inactive');
  const built = await buildItems(items);
  return PurchaseOrder.create({
    poNo: await nextNumber('po', 'PO'), supplier: supplier._id, supplierName: supplier.name, items: built, estTotal: estimate(built),
    expectedDate: expectedDate ? new Date(expectedDate) : undefined, notes, createdBy: user._id, createdByName: user.name,
  });
}

// One click: a draft order for everything of this supplier that is low or out of stock (same quantities as the reorder list).
async function createFromReorder(supplierId, user) {
  const { data } = await getAlerts();
  const rows = [...data.outOfStock, ...data.lowStock];
  const meds = await Medicine.find({ _id: { $in: rows.map((r) => r._id) }, supplier: supplierId }).lean();
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const lines = rows.filter((r) => byId.has(String(r._id))).map((r) => ({ medicine: r._id, boxes: suggestedBoxes(byId.get(String(r._id)), r.available) }));
  if (!lines.length) throw ApiError.badRequest('Nothing to reorder from this supplier right now');
  return createOrder({ supplier: supplierId, items: lines, notes: 'Created from the reorder list' }, user);
}

// Called after a purchase is saved against an order: counts what arrived and moves the status on.
async function applyReceipt(orderId, purchaseItems) {
  const po = await PurchaseOrder.findById(orderId);
  if (!po) return null;
  for (const pi of purchaseItems) {
    const line = po.items.find((i) => String(i.medicine) === String(pi.medicine));
    if (line) line.receivedBase += pi.baseQty;
  }
  const done = po.items.every((i) => i.receivedBase >= i.orderedBoxes * i.unitsPerBox);
  po.status = done ? 'received' : 'partial';
  await po.save();
  return po;
}

// Checked BEFORE the purchase is saved, so a wrong order never leaves a half-linked purchase.
async function assertReceivable(orderId, supplierId) {
  const po = await PurchaseOrder.findById(orderId);
  if (!po) throw ApiError.badRequest('Purchase order not found');
  if (String(po.supplier) !== String(supplierId)) throw ApiError.badRequest('This purchase order belongs to a different supplier');
  if (!OPEN.includes(po.status)) throw ApiError.badRequest(`Purchase order ${po.poNo} is ${po.status} and cannot receive stock`);
  return po;
}

module.exports = { createOrder, createFromReorder, applyReceipt, assertReceivable, buildItems, estimate, OPEN };
