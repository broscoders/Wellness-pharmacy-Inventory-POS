/**
 * Demo ACTIVITY for the demo medicines: ~30 days of purchases, sales (retail + wholesale, cash/card/bank/udhaar),
 * returns, cancellations, customer and supplier payments, prescriptions, expenses and three demo staff accounts.
 * Everything goes through the same services the real app uses, then dates are moved back in time so that
 * daily / weekly / monthly reports and ledgers look like a shop that has been running for a month.
 * Every demo record is tagged ("DEMO") so `npm run seed:demo -- --remove` can take it out again.
 */
const crypto = require('crypto');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const StockMovement = require('../models/StockMovement');
const CustomerLedger = require('../models/CustomerLedger');
const SupplierLedger = require('../models/SupplierLedger');
const Prescription = require('../models/Prescription');
const PrescriptionFile = require('../models/PrescriptionFile');
const Expense = require('../models/Expense');
const { checkout, processReturn, cancelSale } = require('../services/sale.service');
const { createPurchase, createPurchaseReturn } = require('../services/purchase.service');
const { postCustomerLedger, postSupplierLedger } = require('../services/ledger.service');
const { stockByMedicine } = require('../services/inventory.service');
const { nextNumber } = require('../utils/counter');
const { round2, dayRange } = require('../utils/money');
const { unitsPerBox, unitPrice } = require('../utils/units');

const TAG = 'DEMO'; // notes on demo sales / purchases / prescriptions
const MASTER_NOTE = 'DEMO DATA'; // notes on demo suppliers / customers (set by demo.js)
const DEMO_EMAIL_DOMAIN = '@demo.wellness.local';
const DAY = 86400000;

let seed = 77123;
const rnd = (min, max) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return min + Math.floor((seed / 4294967296) * (max - min + 1)); };
const pick = (arr) => arr[rnd(0, arr.length - 1)];
const chance = (pct) => rnd(1, 100) <= pct;

// a business-hours timestamp `daysAgo` days back (never in the future)
function when(daysAgo, hourMin = 9, hourMax = 21) {
  const start = dayRange(new Date(Date.now() - daysAgo * DAY)).start;
  const t = new Date(start.getTime() + rnd(hourMin, hourMax) * 3600000 + rnd(0, 59) * 60000);
  return t > new Date() ? new Date(Date.now() - rnd(2, 90) * 60000) : t;
}

// Services stamp "now". Move everything they just wrote to the intended date.
async function backdate(t0, at) {
  const q = { createdAt: { $gte: t0 } };
  const set = { $set: { createdAt: at, updatedAt: at } };
  await Promise.all([Sale, SaleReturn, StockMovement, CustomerLedger, SupplierLedger, PurchaseReturn].map((M) => M.collection.updateMany(q, set)));
  await Purchase.collection.updateMany(q, { $set: { createdAt: at, updatedAt: at, purchaseDate: at } });
}

const DOCTORS = ['Dr. Asif Mehmood', 'Dr. Sana Iqbal', 'Dr. Tariq Hussain', 'Dr. Nadia Rauf', 'Dr. Imran Qureshi'];
const PRESCRIBED = [['Augmentin 625mg', '1+0+1', 'after meals, 5 days'], ['Panadol 500mg', '1+1+1', 'when fever'], ['Risek 20mg', '1+0+0', 'before breakfast, 14 days'], ['Zyrtec 10mg', '0+0+1', 'at night, 5 days'], ['Cipro 500mg', '1+0+1', '7 days'], ['Glucophage 500mg', '1+0+1', 'with meals']];

async function addActivity({ log }) {
  if (await Sale.exists({ notes: TAG })) { log('Demo activity already exists - skipped (remove it first with --remove to rebuild).'); return; }

  const admin = await User.findOne({ role: 'admin', isActive: true });
  if (!admin) throw new Error('No admin user found. Run `npm run seed` first.');

  // ---- demo staff (random passwords, printed once)
  const staff = [admin];
  const creds = [];
  for (const [name, role] of [['Demo Pharmacist', 'pharmacist'], ['Demo Cashier', 'cashier'], ['Demo Inventory', 'inventory']]) {
    const email = `${role}${DEMO_EMAIL_DOMAIN}`;
    let u = await User.findOne({ email });
    if (!u) {
      const password = `${crypto.randomBytes(9).toString('base64url')}!1`;
      u = await User.create({ name, email, password, role });
      creds.push({ role, email, password });
    }
    staff.push(u);
  }
  const sellers = staff.filter((u) => ['admin', 'pharmacist', 'cashier'].includes(u.role));
  const buyer = staff.find((u) => u.role === 'inventory') || admin;

  // ---- data to work with
  const meds = await Medicine.find({ barcode: /^8961000/, isActive: true });
  const stock = await stockByMedicine(meds.map((m) => m._id));
  const sellable = meds.filter((m) => (stock.get(String(m._id))?.sellable || 0) >= unitsPerBox(m) * 2);
  const plain = sellable.filter((m) => !m.requiresPrescription);
  const rxMeds = sellable.filter((m) => m.requiresPrescription);
  const suppliers = await Supplier.find({ notes: MASTER_NOTE });
  const customers = await Customer.find({ notes: MASTER_NOTE });
  const retailCust = customers.filter((c) => c.type === 'retail');
  const wholesaleCust = customers.filter((c) => c.type === 'wholesale');
  if (!plain.length || !suppliers.length || !customers.length) throw new Error('Demo medicines/suppliers/customers are missing. Run the demo seed first.');

  // ---- prescriptions
  const rxDocs = [];
  for (let i = 0; i < 8; i += 1) {
    const cust = retailCust[i % retailCust.length];
    const at = when(rnd(1, 28));
    const lines = Array.from({ length: rnd(1, 3) }, () => pick(PRESCRIBED));
    const rx = await Prescription.create({
      rxNo: await nextNumber('prescription', 'RX'), customer: cust._id, customerName: cust.name, prescriptionDate: at, doctorName: pick(DOCTORS),
      reference: `REG-${rnd(10000, 99999)}`, items: lines.map(([name, dosage, instructions]) => ({ name, dosage, instructions })), notes: TAG,
      createdBy: admin._id, createdByName: admin.name,
    });
    await Prescription.collection.updateOne({ _id: rx._id }, { $set: { createdAt: at, updatedAt: at } });
    rxDocs.push(rx);
  }

  // ---- build the timeline
  const events = [];
  const ev = (daysAgo, type, extra = {}) => events.push({ at: when(daysAgo), type, ...extra });
  [27, 22, 17, 12, 7, 2].forEach((d, i) => ev(d, 'purchase', { supplier: suppliers[i % suppliers.length], pay: [1, 0.5, 0.4, 0, 0.7, 0.3][i] }));
  [20, 9, 1].forEach((d) => ev(d, 'supplierPayment'));
  for (let i = 0; i < 75; i += 1) {
    const d = chance(35) ? rnd(0, 4) : rnd(0, 29);
    ev(d, 'sale', { wholesale: chance(14) });
  }
  [16, 8, 3, 0].forEach((d) => ev(d, 'customerPayment'));
  [20, 14, 9, 5, 2, 0].forEach((d) => ev(d, 'saleReturn'));
  [12, 4].forEach((d) => ev(d, 'cancel'));
  ev(6, 'purchaseReturn');
  [[25, 'rent', 12000, 'Shop rent'], [24, 'internet', 2500, 'Internet bill'], [22, 'electricity', 4300, 'Electricity bill'], [18, 'delivery', 600, 'Delivery rider'], [15, 'maintenance', 1800, 'AC service'],
    [13, 'other', 350, 'Tea and cleaning'], [10, 'delivery', 450, 'Delivery rider'], [8, 'other', 900, 'Stationery and receipt rolls'], [5, 'maintenance', 1200, 'Shelf repair'], [3, 'salaries', 25000, 'Staff salaries'],
    [1, 'delivery', 500, 'Delivery rider'], [2, 'other', 700, 'Entered twice (voided)']]
    .forEach(([d, category, amount, description]) => ev(d, 'expense', { category, amount, description, void: description.includes('voided') }));
  events.sort((a, b) => a.at - b.at);

  // ---- run it in date order
  const made = { sales: [], purchases: [] };
  const count = { purchase: 0, supplierPayment: 0, sale: 0, customerPayment: 0, saleReturn: 0, cancel: 0, purchaseReturn: 0, expense: 0 };
  const failed = {};
  let batchNo = 0;

  for (const e of events) {
    const t0 = new Date(Date.now() - 1);
    try {
      if (e.type === 'purchase') {
        const lines = Array.from({ length: rnd(4, 8) }, () => pick(plain.concat(rxMeds)));
        const uniq = [...new Map(lines.map((m) => [String(m._id), m])).values()];
        batchNo += 1;
        const items = uniq.map((m, k) => ({
          medicine: m._id, batchNumber: `DEMO-PUR${batchNo}-${k + 1}`, expiryDate: new Date(Date.now() + rnd(420, 800) * DAY).toISOString().slice(0, 10),
          quantity: { box: rnd(2, 8) }, pricePerBox: m.purchasePrice, discountPercent: chance(30) ? 2 : undefined,
        }));
        const total = items.reduce((s, i) => s + i.pricePerBox * i.quantity.box * (1 - (i.discountPercent || 0) / 100), 0);
        const p = await createPurchase({ supplier: e.supplier._id, supplierInvoiceNo: `SI-${rnd(1000, 9999)}`, items, paidAmount: round2(total * e.pay), paymentMethod: pick(['cash', 'bank_transfer']), notes: TAG }, buyer);
        await backdate(t0, e.at);
        made.purchases.push({ id: p._id, at: e.at });
      } else if (e.type === 'supplierPayment') {
        const sup = (await Supplier.find({ notes: MASTER_NOTE, balance: { $gt: 100 } }).sort({ balance: -1 }).limit(1))[0];
        if (!sup) throw new Error('no supplier owes money');
        await postSupplierLedger({ supplierId: sup._id, amount: -round2(sup.balance * rnd(40, 70) / 100), type: 'payment', method: 'bank_transfer', note: 'Part payment', user: buyer });
        await backdate(t0, e.at);
      } else if (e.type === 'sale') {
        await runSale(e, t0);
      } else if (e.type === 'customerPayment') {
        const c = (await Customer.find({ notes: MASTER_NOTE, balance: { $gt: 50 } }).sort({ balance: -1 }).limit(1))[0];
        if (!c) throw new Error('no customer owes money');
        await postCustomerLedger({ customerId: c._id, amount: -round2(Math.min(c.balance, Math.max(50, c.balance * rnd(40, 100) / 100))), type: 'payment', method: pick(['cash', 'cash', 'bank_transfer']), note: 'Payment received', user: pick(sellers) });
        await backdate(t0, e.at);
      } else if (e.type === 'saleReturn') {
        const s = pick(made.sales.filter((x) => x.at < e.at && !x.cancelled));
        const sale = await Sale.findById(s.id);
        const item = pick(sale.items.filter((i) => i.returnedBase < i.baseQty));
        await processReturn(sale, { items: [{ saleItem: item._id, unitType: 'unit', quantity: Math.max(1, Math.floor(item.baseQty / 2)) }], reason: pick(['Wrong medicine given', 'Customer changed mind', 'Doctor changed prescription', 'Packing damaged']), refundTo: 'credit' }, pick(sellers));
        await backdate(t0, e.at);
      } else if (e.type === 'cancel') {
        const s = pick(made.sales.filter((x) => x.at < e.at && !x.cancelled && !x.returned && !x.rx));
        const sale = await Sale.findById(s.id);
        if (sale.items.some((i) => i.returnedBase > 0)) throw new Error('has returns');
        await cancelSale(sale, pick(['Billing mistake', 'Customer left without paying']), admin);
        s.cancelled = true;
        await backdate(t0, e.at); // the sale itself keeps its own earlier date; reverse stock rows get the cancel date
        await Sale.collection.updateOne({ _id: sale._id }, { $set: { createdAt: s.at, cancelledAt: e.at } });
      } else if (e.type === 'purchaseReturn') {
        const p = pick(made.purchases.filter((x) => x.at < e.at));
        const purchase = await Purchase.findById(p.id);
        await createPurchaseReturn(purchase, { items: [{ purchaseItem: purchase.items[0]._id, quantity: { box: 1 } }], reason: 'Damaged packs received' }, buyer);
        await backdate(t0, e.at);
        await Purchase.collection.updateOne({ _id: purchase._id }, { $set: { createdAt: p.at, purchaseDate: p.at } });
      } else if (e.type === 'expense') {
        const x = await Expense.create({ expenseNo: await nextNumber('expense', 'EXP'), category: e.category, amount: e.amount, date: e.at, description: `${TAG}: ${e.description}`, paymentMethod: e.amount > 10000 ? 'bank_transfer' : 'cash', isVoided: !!e.void, voidReason: e.void ? 'Entered twice' : undefined, voidedBy: e.void ? admin._id : undefined, createdBy: admin._id, createdByName: admin.name });
        await Expense.collection.updateOne({ _id: x._id }, { $set: { createdAt: e.at, updatedAt: e.at } });
      }
      count[e.type] += 1;
    } catch (err) {
      failed[e.type] = (failed[e.type] || 0) + 1;
    }
  }

  async function runSale(e, t0) {
    const wholesale = e.wholesale && wholesaleCust.length > 0;
    const customer = wholesale ? pick(wholesaleCust) : (chance(30) ? pick(retailCust) : null);
    const lineCount = wholesale ? rnd(3, 6) : rnd(1, 5);
    const chosen = [...new Map(Array.from({ length: lineCount }, () => pick(chance(12) && rxMeds.length ? rxMeds : plain)).map((m) => [String(m._id), m])).values()];
    const hasRx = chosen.some((m) => m.requiresPrescription);
    const items = chosen.map((m) => {
      let unitType; let quantity;
      if (wholesale) { unitType = 'box'; quantity = rnd(1, 3); } else if (m.stripsPerBox > 1) { unitType = pick(['strip', 'strip', 'strip', 'unit', 'box']); quantity = unitType === 'unit' ? rnd(1, 10) : unitType === 'strip' ? rnd(1, 3) : 1; } else { unitType = pick(['unit', 'unit', 'unit', 'box']); quantity = unitType === 'unit' ? rnd(1, 3) : 1; }
      return { medicine: m._id, unitType, quantity };
    });
    // expected total, to build payments that cover it
    let total = 0;
    items.forEach((it) => { const m = chosen.find((x) => String(x._id) === String(it.medicine)); const list = wholesale && m.wholesalePrice?.box ? m.wholesalePrice : m.salePrice; const per = unitPrice(list, m, it.unitType); const base = it.unitType === 'box' ? unitsPerBox(m) : it.unitType === 'strip' ? m.unitsPerStrip : 1; total += per * base * it.quantity; });
    total = round2(total);
    const discount = !wholesale && chance(18) ? Math.min(Math.floor(total * 0.03), 30) : wholesale && chance(40) ? Math.floor(total * 0.02) : 0;
    const due = round2(total - discount);

    let payments;
    const fresh = customer ? await Customer.findById(customer._id) : null;
    const room = fresh ? (fresh.creditLimit > 0 ? fresh.creditLimit - fresh.balance : 100000) : 0;
    if (fresh && room > 100 && chance(wholesale ? 70 : 40)) {
      const credit = round2(Math.min(due * rnd(40, 100) / 100, room));
      const rest = round2(due - credit);
      payments = [{ method: 'credit', amount: credit }].concat(rest > 0 ? [{ method: 'cash', amount: Math.ceil(rest) }] : []);
    } else {
      const m = pick(['cash', 'cash', 'cash', 'cash', 'card', 'bank_transfer']);
      payments = m === 'cash' ? [{ method: 'cash', amount: Math.ceil(due / 5) * 5 }] : [{ method: m, amount: Math.floor(due) }, { method: 'cash', amount: Math.max(1, Math.ceil(due - Math.floor(due))) }];
    }
    const rx = hasRx ? pick(rxDocs) : null;
    const seller = pick(sellers);
    const sale = await checkout({ items, type: wholesale ? 'wholesale' : 'retail', customer: customer?._id, discount: discount || undefined, payments, notes: TAG, prescriptionConfirmed: hasRx || undefined }, seller);
    await backdate(t0, e.at);
    if (rx) {
      await Sale.collection.updateOne({ _id: sale._id }, { $set: { prescription: rx._id } });
      await Prescription.updateOne({ _id: rx._id }, { $addToSet: { sales: sale._id } });
      await Prescription.collection.updateOne({ _id: rx._id }, { $set: { updatedAt: new Date() } });
    }
    made.sales.push({ id: sale._id, at: e.at, rx: !!rx });
  }

  log(`Demo activity: ${count.purchase} purchases, ${count.sale} sales, ${count.saleReturn} returns, ${count.cancel} cancellations, ${count.customerPayment} customer payments, ${count.supplierPayment} supplier payments, ${count.purchaseReturn} purchase return, ${count.expense} expenses, ${rxDocs.length} prescriptions.`);
  if (Object.keys(failed).length) log(`(some random events were skipped because of stock / credit limits: ${JSON.stringify(failed)} - this is normal)`);
  if (creds.length) {
    log('\nDemo staff accounts created (password is shown only now - note it down if you want to test roles):');
    creds.forEach((c) => log(`  ${c.role.padEnd(11)} ${c.email}   password: ${c.password}`));
  }
}

// Remove everything addActivity created. Stock changes made by demo bills disappear together with the demo medicines.
async function removeActivity({ log }) {
  const sales = await Sale.find({ notes: TAG }).select('_id');
  const purchases = await Purchase.find({ notes: TAG }).select('_id');
  const saleIds = sales.map((s) => s._id); const purchaseIds = purchases.map((p) => p._id);
  const demoCust = (await Customer.find({ notes: MASTER_NOTE }).select('_id')).map((c) => c._id);
  const demoSup = (await Supplier.find({ notes: MASTER_NOTE }).select('_id')).map((s) => s._id);
  const rx = (await Prescription.find({ notes: TAG }).select('_id')).map((p) => p._id);
  await SaleReturn.deleteMany({ sale: { $in: saleIds } });
  await PurchaseReturn.deleteMany({ purchase: { $in: purchaseIds } });
  await Sale.deleteMany({ _id: { $in: saleIds } });
  await Purchase.deleteMany({ _id: { $in: purchaseIds } });
  await CustomerLedger.deleteMany({ customer: { $in: demoCust } });
  await SupplierLedger.deleteMany({ supplier: { $in: demoSup } });
  await PrescriptionFile.deleteMany({ prescription: { $in: rx } });
  await Prescription.deleteMany({ _id: { $in: rx } });
  await Expense.deleteMany({ description: /^DEMO: / });
  await User.deleteMany({ email: new RegExp(`${DEMO_EMAIL_DOMAIN.replace('.', '\\.')}$`) });
  // balances of demo customers/suppliers are reset so the (now empty) demo records can be removed cleanly
  await Customer.updateMany({ _id: { $in: demoCust } }, { $set: { balance: 0 } });
  await Supplier.updateMany({ _id: { $in: demoSup } }, { $set: { balance: 0 } });
  log(`Removed demo activity: ${saleIds.length} sales, ${purchaseIds.length} purchases, prescriptions, expenses, ledgers and demo staff.`);
}

module.exports = { addActivity, removeActivity };
