/**
 * DEMO DATA for testing and client demos. Adds ~110 medicines in 10 categories with batches, a few suppliers and customers.
 *
 *   npm run seed:demo                      medicines + suppliers + customers + 30 days of demo activity
 *   npm run seed:demo -- --no-activity     only the medicines/suppliers/customers
 *   npm run seed:demo -- --remove          remove ALL demo data again (medicines are kept if a real, non-demo bill uses them)
 *
 * Prices are only approximate and for demonstration. Demo medicines have barcodes starting with 8961000.
 */
const env = require('../config/env');
env.validateEnv();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Category = require('../models/Category');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const StockMovement = require('../models/StockMovement');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const { applyMovement } = require('../services/stock.service');
const { addActivity, removeActivity } = require('./demoActivity');

const BARCODE_PREFIX = '8961000';
const DEMO_NOTE = 'DEMO DATA';

// Strip items: [name, generic, category, manufacturer, stripsPerBox, unitsPerStrip, pricePerStrip, needsPrescription]
const S = (...a) => ({ kind: 'strip', a });
// Piece items (bottles, tubes, packs): [name, generic, category, manufacturer, piecesPerBox, pricePerPiece, needsPrescription]
const P = (...a) => ({ kind: 'piece', a });

const ITEMS = [
  // ---- Tablet
  S('Panadol 500mg', 'Paracetamol', 'Tablet', 'GSK', 10, 10, 25), S('Panadol Extra', 'Paracetamol + Caffeine', 'Tablet', 'GSK', 10, 10, 38),
  S('Disprin 300mg', 'Aspirin', 'Tablet', 'Reckitt', 10, 10, 20), S('Brufen 400mg', 'Ibuprofen', 'Tablet', 'Abbott', 10, 10, 55),
  S('Ponstan Forte 500mg', 'Mefenamic Acid', 'Tablet', 'Pfizer', 10, 10, 85), S('Augmentin 625mg', 'Amoxicillin + Clavulanate', 'Tablet', 'GSK', 2, 6, 640, true),
  S('Flagyl 400mg', 'Metronidazole', 'Tablet', 'Sanofi', 10, 10, 60, true), S('Cipro 500mg', 'Ciprofloxacin', 'Tablet', 'Bayer', 5, 10, 190, true),
  S('Zithromax 500mg', 'Azithromycin', 'Tablet', 'Pfizer', 1, 3, 520, true), S('Glucophage 500mg', 'Metformin', 'Tablet', 'Merck', 10, 10, 75, true),
  S('Norvasc 5mg', 'Amlodipine', 'Tablet', 'Pfizer', 3, 10, 210, true), S('Concor 5mg', 'Bisoprolol', 'Tablet', 'Merck', 3, 10, 260, true),
  S('Lipitor 20mg', 'Atorvastatin', 'Tablet', 'Pfizer', 3, 10, 480, true), S('Arinac Forte', 'Ibuprofen + Pseudoephedrine', 'Tablet', 'Abbott', 10, 10, 70),
  S('Zyrtec 10mg', 'Cetirizine', 'Tablet', 'GSK', 10, 10, 110), S('Claritin 10mg', 'Loratadine', 'Tablet', 'Bayer', 10, 10, 120),
  S('Avil 25mg', 'Pheniramine', 'Tablet', 'Sanofi', 10, 10, 30), S('Motilium 10mg', 'Domperidone', 'Tablet', 'Janssen', 10, 10, 95),
  S('Buscopan 10mg', 'Hyoscine Butylbromide', 'Tablet', 'Sanofi', 10, 10, 90), S('Folic Acid 5mg', 'Folic Acid', 'Tablet', 'Generic', 10, 10, 18),
  S('Rigix 10mg', 'Cetirizine', 'Tablet', 'Getz', 10, 10, 65), S('Gravinate 50mg', 'Dimenhydrinate', 'Tablet', 'Getz', 10, 10, 35),
  // ---- Capsule
  S('Risek 20mg', 'Omeprazole', 'Capsule', 'Getz', 14, 7, 160), S('Nexium 20mg', 'Esomeprazole', 'Capsule', 'AstraZeneca', 2, 7, 550),
  S('Amoxil 500mg', 'Amoxicillin', 'Capsule', 'GSK', 10, 10, 210, true), S('Keflex 500mg', 'Cephalexin', 'Capsule', 'Abbott', 5, 10, 240, true),
  S('Doxycycline 100mg', 'Doxycycline', 'Capsule', 'Generic', 10, 10, 80, true), S('Diflucan 150mg', 'Fluconazole', 'Capsule', 'Pfizer', 1, 1, 380, true),
  S('Becosules', 'Vitamin B Complex', 'Capsule', 'Pfizer', 10, 10, 65), S('Imodium 2mg', 'Loperamide', 'Capsule', 'Janssen', 10, 6, 90),
  S('Omega-3 1000mg', 'Fish Oil', 'Capsule', 'Generic', 6, 10, 450), S('Vitamin E 400 IU', 'Tocopherol', 'Capsule', 'Generic', 6, 10, 260),
  // ---- Syrup
  P('Calpol 120mg/5ml 60ml', 'Paracetamol', 'Syrup', 'GSK', 12, 95), P('Panadol Suspension 120ml', 'Paracetamol', 'Syrup', 'GSK', 12, 135),
  P('Brufen Suspension 60ml', 'Ibuprofen', 'Syrup', 'Abbott', 12, 120), P('Augmentin 156mg Suspension', 'Amoxicillin + Clavulanate', 'Syrup', 'GSK', 10, 360, true),
  P('Zithromax 200mg Suspension', 'Azithromycin', 'Syrup', 'Pfizer', 10, 640, true), P('Zyrtec Syrup 60ml', 'Cetirizine', 'Syrup', 'GSK', 12, 170),
  P('Ventolin Syrup 100ml', 'Salbutamol', 'Syrup', 'GSK', 12, 85), P('Benylin Dry Cough 100ml', 'Dextromethorphan', 'Syrup', 'Johnson', 12, 220),
  P('Gaviscon Liquid 150ml', 'Sodium Alginate', 'Syrup', 'Reckitt', 12, 380), P('Duphalac 200ml', 'Lactulose', 'Syrup', 'Abbott', 12, 410),
  P('Mucosolvan 100ml', 'Ambroxol', 'Syrup', 'Sanofi', 12, 175), P('Tonoferon Syrup 120ml', 'Iron', 'Syrup', 'Getz', 12, 190),
  // ---- Injection
  P('Diclofenac Injection 75mg', 'Diclofenac Sodium', 'Injection', 'Generic', 50, 30, true), P('Ceftriaxone 1g Injection', 'Ceftriaxone', 'Injection', 'Generic', 10, 175, true),
  P('Gentamicin 80mg Injection', 'Gentamicin', 'Injection', 'Generic', 50, 28, true), P('Dexamethasone 4mg Injection', 'Dexamethasone', 'Injection', 'Generic', 50, 25, true),
  P('Avil Injection 45.5mg', 'Pheniramine', 'Injection', 'Sanofi', 50, 38), P('Buscopan Injection 20mg', 'Hyoscine', 'Injection', 'Sanofi', 10, 95, true),
  P('Tetanus Toxoid Injection', 'Tetanus Toxoid', 'Injection', 'Generic', 10, 120, true), P('Vitamin B12 Injection 1000mcg', 'Cyanocobalamin', 'Injection', 'Generic', 50, 45),
  // ---- Ointment/Cream
  P('Fucidin Cream 15g', 'Fusidic Acid', 'Ointment/Cream', 'Leo', 12, 520, true), P('Betnovate-N Cream 15g', 'Betamethasone + Neomycin', 'Ointment/Cream', 'GSK', 12, 150, true),
  P('Canesten Cream 20g', 'Clotrimazole', 'Ointment/Cream', 'Bayer', 12, 260), P('Polyfax Skin Ointment 20g', 'Polymyxin + Bacitracin', 'Ointment/Cream', 'GSK', 12, 210),
  P('Soframycin Skin Cream 20g', 'Framycetin', 'Ointment/Cream', 'Sanofi', 12, 135), P('Voltaren Emulgel 20g', 'Diclofenac Gel', 'Ointment/Cream', 'GSK', 12, 360),
  P('Burnol Cream 20g', 'Burn Cream', 'Ointment/Cream', 'Generic', 12, 90), P('Zovirax Cream 5g', 'Acyclovir', 'Ointment/Cream', 'GSK', 12, 430),
  P('Bepanthen Ointment 30g', 'Dexpanthenol', 'Ointment/Cream', 'Bayer', 12, 640), P('Dermovate Cream 15g', 'Clobetasol', 'Ointment/Cream', 'GSK', 12, 170, true),
  // ---- Drops
  P('Tobrex Eye Drops 5ml', 'Tobramycin', 'Drops', 'Alcon', 12, 310, true), P('Refresh Tears 15ml', 'Carboxymethylcellulose', 'Drops', 'Allergan', 12, 780),
  P('Otrivin Adult Nasal Drops', 'Xylometazoline', 'Drops', 'GSK', 12, 165), P('Otrivin Paediatric Nasal Drops', 'Xylometazoline', 'Drops', 'GSK', 12, 150),
  P('Vigamox Eye Drops 5ml', 'Moxifloxacin', 'Drops', 'Alcon', 12, 520, true), P('Panadol Baby Drops 15ml', 'Paracetamol', 'Drops', 'GSK', 12, 140),
  P('Cipro Ear Drops 10ml', 'Ciprofloxacin', 'Drops', 'Generic', 12, 230, true), P('Systane Eye Drops 10ml', 'Polyethylene Glycol', 'Drops', 'Alcon', 12, 820),
  // ---- Surgical
  P('Cotton Roll 100g', 'Absorbent Cotton', 'Surgical', 'Generic', 50, 120), P('Gauze Bandage 3 inch', 'Gauze', 'Surgical', 'Generic', 100, 35),
  P('Crepe Bandage 4 inch', 'Crepe', 'Surgical', 'Generic', 50, 150), P('Micropore Tape 1 inch', 'Surgical Tape', 'Surgical', '3M', 24, 110),
  P('Syringe 3cc', 'Disposable Syringe', 'Surgical', 'Generic', 100, 14), P('Syringe 5cc', 'Disposable Syringe', 'Surgical', 'Generic', 100, 16),
  P('Face Mask (3-ply)', 'Surgical Mask', 'Surgical', 'Generic', 50, 12), P('Examination Gloves (pair)', 'Latex Gloves', 'Surgical', 'Generic', 100, 18),
  P('IV Cannula 22G', 'IV Cannula', 'Surgical', 'Generic', 100, 55), P('Digital Thermometer', 'Thermometer', 'Surgical', 'Omron', 10, 450),
  // ---- Supplements
  P('Calcium Sandoz Tablets', 'Calcium', 'Supplements', 'Novartis', 12, 720), P('Neurobion Tablets (30)', 'Vitamin B1,B6,B12', 'Supplements', 'Merck', 12, 480),
  P('Cac-1000 Plus', 'Calcium + Vitamin C', 'Supplements', 'GSK', 12, 560), P('Surbex-Z (30)', 'Multivitamin + Zinc', 'Supplements', 'Abbott', 12, 640),
  P('Vitamin C 500mg (100)', 'Ascorbic Acid', 'Supplements', 'Generic', 12, 350), P('Zincat Syrup 60ml', 'Zinc', 'Supplements', 'Getz', 12, 190),
  P('Vitamin D3 50000 IU (4)', 'Cholecalciferol', 'Supplements', 'Generic', 12, 260), P('Ensure Powder 400g', 'Nutrition Supplement', 'Supplements', 'Abbott', 6, 2450),
  P('Revital H Capsules (30)', 'Multivitamin', 'Supplements', 'Sun', 12, 790), P('Haemoplex Syrup 120ml', 'Iron + B12', 'Supplements', 'Generic', 12, 210),
  // ---- Baby Care
  P('Cerelac Wheat 350g', 'Infant Cereal', 'Baby Care', 'Nestle', 12, 640), P('Lactogen 1 (400g)', 'Infant Formula', 'Baby Care', 'Nestle', 12, 1580),
  P('Nan Pro 1 (400g)', 'Infant Formula', 'Baby Care', 'Nestle', 12, 1990), P('Pampers Medium (44 pcs)', 'Diapers', 'Baby Care', 'P&G', 6, 1850),
  P("Johnson's Baby Powder 200g", 'Baby Powder', 'Baby Care', 'Johnson', 12, 420), P("Johnson's Baby Lotion 200ml", 'Baby Lotion', 'Baby Care', 'Johnson', 12, 560),
  P('Baby Wipes (80 pcs)', 'Wet Wipes', 'Baby Care', 'Nestle', 12, 390), P('Woodwards Gripe Water 148ml', 'Gripe Water', 'Baby Care', 'Reckitt', 12, 330),
  // ---- General
  P('ORS Sachet', 'Oral Rehydration Salts', 'General', 'Generic', 100, 30), P('Dettol Antiseptic 250ml', 'Chloroxylenol', 'General', 'Reckitt', 12, 370),
  P('Savlon Antiseptic 100ml', 'Chlorhexidine', 'General', 'Johnson', 12, 190), P('Betadine Solution 60ml', 'Povidone Iodine', 'General', 'Mundipharma', 12, 210),
  P('Vicks VapoRub 25g', 'Menthol + Camphor', 'General', 'P&G', 24, 160), P('Strepsils Lozenges (24)', 'Amylmetacresol', 'General', 'Reckitt', 12, 290),
  P('Eno Fruit Salt', 'Antacid', 'General', 'GSK', 24, 25), P('Vicks Inhaler', 'Menthol Inhaler', 'General', 'P&G', 24, 120),
  P('Glucose-D 400g', 'Glucose', 'General', 'Generic', 12, 280), P('Hand Sanitizer 250ml', 'Alcohol Sanitizer', 'General', 'Dettol', 12, 380),
  P('Pregnancy Test Strip', 'hCG Test', 'General', 'Generic', 50, 80), P('Glucometer Test Strips (50)', 'Blood Glucose Strips', 'General', 'Accu-Chek', 10, 2400),
];

const SUPPLIERS = [
  ['Al-Shifa Pharma Distributors', 'Mr. Imran', '0300-1112233', 'Lahore'], ['Ravi Medical Traders', 'Mr. Bilal', '0321-4455667', 'Lahore'],
  ['Hayat Wholesale Medicos', 'Mr. Kamran', '0333-9988776', 'Faisalabad'], ['City Surgical Suppliers', 'Mr. Adnan', '0345-2233445', 'Lahore'],
  ['Baby & Care Distributors', 'Ms. Sana', '0311-7766554', 'Lahore'],
];
const CUSTOMERS = [
  ['Muhammad Ali', '0300-5551001', 'retail', 5000], ['Ayesha Khan', '0321-5551002', 'retail', 3000], ['Hassan Raza', '0333-5551003', 'retail', 0],
  ['Fatima Noor', '0345-5551004', 'retail', 2000], ['City Clinic (Dr. Asif)', '0300-5551005', 'wholesale', 50000], ['Al-Noor Dispensary', '0322-5551006', 'wholesale', 80000],
  ['Bilal Ahmed', '0311-5551007', 'retail', 1500], ['Zainab Bibi', '0331-5551008', 'retail', 1000],
];

// small deterministic random so every run builds the same demo shop
let seed = 20261008;
const rnd = (min, max) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return min + Math.floor((seed / 4294967296) * (max - min + 1)); };
const inDays = (n) => new Date(Date.now() + n * 86400000);
const round = (n) => Math.round(n * 100) / 100;

function toMedicine(item, index, categoryId) {
  const barcode = `${BARCODE_PREFIX}${String(index + 1).padStart(6, '0')}`;
  if (item.kind === 'strip') {
    const [name, genericName, , manufacturer, spb, ups, strip, rx] = item.a;
    const box = round(strip * spb * 0.98);
    return {
      name, genericName, category: categoryId, manufacturer, barcode, stripsPerBox: spb, unitsPerStrip: ups, packType: 'Box',
      purchasePrice: round(box * 0.82), salePrice: { box, strip, unit: round(strip / ups) }, wholesalePrice: { box: round(box * 0.92) },
      minStockLevel: Math.max(20, Math.round(spb * ups * 0.4)), requiresPrescription: !!rx,
    };
  }
  const [name, genericName, , manufacturer, perBox, piece, rx] = item.a;
  const box = round(piece * perBox * 0.98);
  return {
    name, genericName, category: categoryId, manufacturer, barcode, stripsPerBox: 1, unitsPerStrip: perBox, packType: 'Box',
    purchasePrice: round(box * 0.82), salePrice: { box, strip: 0, unit: piece }, wholesalePrice: { box: round(box * 0.92) },
    minStockLevel: Math.max(3, Math.round(perBox * 0.4)), requiresPrescription: !!rx,
  };
}

async function addBatch(med, label, days, qty) {
  const batchNumber = `DEMO-${label}-${String(med.barcode).slice(-4)}`;
  if (await Batch.exists({ medicine: med._id, batchNumber })) return false;
  const batch = await Batch.create({ medicine: med._id, batchNumber, expiryDate: inDays(days), quantity: 0, purchasePricePerBox: med.purchasePrice, supplier: med.supplier });
  await applyMovement({ batchId: batch._id, delta: qty, type: 'opening', reason: 'Demo opening stock' });
  return true;
}

async function add() {
  const suppliers = [];
  for (const [name, contactPerson, phone, address] of SUPPLIERS) {
    suppliers.push(await Supplier.findOneAndUpdate({ name }, { $setOnInsert: { name, contactPerson, phone, address, notes: DEMO_NOTE } }, { upsert: true, returnDocument: 'after' }));
  }
  for (const [name, phone, type, creditLimit] of CUSTOMERS) {
    await Customer.updateOne({ name, phone }, { $setOnInsert: { name, phone, type, creditLimit, notes: DEMO_NOTE } }, { upsert: true });
  }
  const cats = {};
  let created = 0; let batchesMade = 0;
  for (let i = 0; i < ITEMS.length; i += 1) {
    const item = ITEMS[i];
    const catName = item.a[2];
    if (!cats[catName]) cats[catName] = (await Category.findOneAndUpdate({ name: catName }, { $setOnInsert: { name: catName } }, { upsert: true, returnDocument: 'after' }))._id;
    const data = toMedicine(item, i, cats[catName]);
    let med = await Medicine.findOne({ barcode: data.barcode });
    if (med) continue;
    data.supplier = suppliers[i % suppliers.length]._id;
    med = await Medicine.create(data);
    created += 1;

    const perBox = med.stripsPerBox * med.unitsPerStrip;
    const boxes = rnd(4, 14);
    const outOfStock = [20, 70].includes(i);
    const lowStock = [11, 44, 83].includes(i);
    if (outOfStock) continue;
    if (lowStock) { batchesMade += +(await addBatch(med, 'LOW', 300, Math.max(1, Math.floor(med.minStockLevel / 2)))); continue; }
    batchesMade += +(await addBatch(med, 'A', rnd(250, 420), boxes * perBox));
    batchesMade += +(await addBatch(med, 'B', rnd(520, 780), rnd(2, 8) * perBox));
    if (i % 13 === 5) batchesMade += +(await addBatch(med, 'NEAR30', rnd(10, 28), rnd(1, 3) * perBox)); // expires within 30 days
    if (i % 17 === 3) batchesMade += +(await addBatch(med, 'NEAR90', rnd(65, 88), rnd(1, 3) * perBox)); // expires in 61-90 days
    if ([7, 61].includes(i)) batchesMade += +(await addBatch(med, 'EXPIRED', -25, rnd(1, 2) * perBox)); // already expired
  }
  console.log(`Demo data ready: ${created} new medicines, ${batchesMade} batches, ${SUPPLIERS.length} suppliers, ${CUSTOMERS.length} customers.`);
  console.log('Categories used:', Object.keys(cats).join(', '));
  if (!process.argv.includes('--no-activity')) await addActivity({ log: console.log });
}

async function remove() {
  await removeActivity({ log: console.log });
  const meds = await Medicine.find({ barcode: new RegExp(`^${BARCODE_PREFIX}`) }).select('_id name');
  const ids = meds.map((m) => m._id);
  const usedInSale = await Sale.exists({ 'items.medicine': { $in: ids } });
  const usedInPurchase = await Purchase.exists({ 'items.medicine': { $in: ids } });
  if (usedInSale || usedInPurchase) {
    console.log('Not removed: some demo medicines are already used in real bills or purchases. Deactivate them in the app instead.');
    return;
  }
  await StockMovement.deleteMany({ medicine: { $in: ids } });
  await Batch.deleteMany({ medicine: { $in: ids } });
  await Medicine.deleteMany({ _id: { $in: ids } });
  await Supplier.deleteMany({ notes: DEMO_NOTE, balance: 0 });
  await Customer.deleteMany({ notes: DEMO_NOTE, balance: 0 });
  console.log(`Removed ${ids.length} demo medicines with their batches (and untouched demo suppliers/customers).`);
}

(async () => {
  await connectDB();
  if (process.argv.includes('--remove')) await remove(); else await add();
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
