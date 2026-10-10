const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const { toBase, parseExpiry } = require('../utils/units');
const { applyMovement } = require('./stock.service');
const { escapeRegex } = require('../utils/pagination');

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v) => { const s = clean(v).replace(/,/g, ''); if (s === '') return undefined; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const yes = (v) => /^(1|y|yes|true|rx)$/i.test(clean(v));

/** Turn one raw spreadsheet row into a validated medicine + optional opening stock, or a list of problems. */
function parseRow(raw) {
  const errors = [];
  const warnings = [];
  const r = Object.fromEntries(Object.entries(raw || {}).map(([k, v]) => [k, clean(v)]));
  const name = r.name;
  if (!name || name.length < 2) errors.push('Medicine name is missing');
  if (name && name.length > 150) errors.push('Medicine name is too long');

  const field = (key, label, { min = 0, int = false, def } = {}) => {
    const n = num(r[key]);
    if (n === undefined) return def;
    if (Number.isNaN(n) || n < min || (int && !Number.isInteger(n))) { errors.push(`${label} must be ${int ? 'a whole ' : 'a '}number${min ? ` of at least ${min}` : ''}`); return def; }
    return n;
  };
  const stripsPerBox = field('stripsPerBox', 'Strips per box', { min: 1, int: true, def: 1 });
  const unitsPerStrip = field('unitsPerStrip', 'Units per strip', { min: 1, int: true, def: 1 });
  const purchasePrice = field('purchasePrice', 'Purchase price (per box)', { def: 0 });
  const saleBox = field('salePriceBox', 'Sale price per box', { def: 0 });
  const saleStrip = field('salePriceStrip', 'Sale price per strip', { def: 0 });
  const saleUnit = field('salePriceUnit', 'Sale price per unit', { def: 0 });
  const wholesaleBox = field('wholesalePriceBox', 'Wholesale price per box', { def: 0 });
  const minStockLevel = field('minStock', 'Minimum stock', { int: true, def: 0 });
  const ob = field('openingBoxes', 'Opening boxes', { def: 0 });
  const os = field('openingStrips', 'Opening strips', { def: 0 });
  const ou = field('openingUnits', 'Opening units', { def: 0 });

  if (saleBox + saleStrip + saleUnit === 0) warnings.push('No sale price given - it cannot be sold until a price is set');

  const medicine = {
    name, genericName: r.genericName || undefined, manufacturer: r.manufacturer || undefined, barcode: r.barcode || undefined,
    stripsPerBox, unitsPerStrip, purchasePrice, minStockLevel,
    salePrice: { box: saleBox, strip: saleStrip, unit: saleUnit }, wholesalePrice: { box: wholesaleBox },
    requiresPrescription: yes(r.requiresPrescription),
  };

  let stock = null;
  const qty = toBase(medicine, { box: ob, strip: os, unit: ou });
  if (qty > 0) {
    const expiry = r.expiry ? parseExpiry(r.expiry) : null;
    if (!r.batchNumber) errors.push('Batch number is needed when opening stock is given');
    if (!expiry) errors.push('A valid expiry date (YYYY-MM-DD or YYYY-MM) is needed when opening stock is given');
    else if (expiry < new Date()) warnings.push('This batch is already expired');
    if (r.batchNumber && expiry) stock = { batchNumber: r.batchNumber.toUpperCase(), expiryDate: expiry, qty };
  }
  return { errors, warnings, medicine, category: r.category, supplier: r.supplier, stock };
}

async function findExisting(m) {
  if (m.barcode) {
    const byCode = await Medicine.findOne({ barcode: m.barcode });
    if (byCode) return byCode;
  }
  return Medicine.findOne({ name: new RegExp(`^${escapeRegex(m.name)}$`, 'i') });
}

/**
 * rows: array of raw rows with the canonical keys. dryRun=true only checks and reports.
 * Existing medicines (same barcode, else same name) are skipped, or updated when updateExisting=true.
 * Opening stock is added only when that batch number does not exist yet, so importing the same file twice never doubles the stock.
 */
async function importMedicines(rows, { dryRun = true, updateExisting = false } = {}) {
  const seenBarcodes = new Set();
  const seenNames = new Set();
  const out = [];
  const summary = { total: rows.length, create: 0, update: 0, skip: 0, errors: 0, stockBatches: 0 };
  const catCache = new Map();
  const supCache = new Map();

  for (let i = 0; i < rows.length; i += 1) {
    const rowNo = i + 2; // spreadsheet row number (row 1 is the header)
    const p = parseRow(rows[i]);
    const item = { row: rowNo, name: p.medicine.name || '', status: 'error', messages: [...p.errors], warnings: p.warnings };

    if (p.medicine.barcode) {
      if (seenBarcodes.has(p.medicine.barcode)) p.errors.push(`Barcode ${p.medicine.barcode} appears twice in this file`);
      seenBarcodes.add(p.medicine.barcode);
    } else if (p.medicine.name) {
      const key = p.medicine.name.toLowerCase();
      if (seenNames.has(key)) p.errors.push('This medicine name appears twice in the file (add a barcode or make names different)');
      seenNames.add(key);
    }
    item.messages = [...p.errors];
    if (p.errors.length) { summary.errors += 1; out.push(item); continue; }

    try {
      const existing = await findExisting(p.medicine);
      if (existing && !updateExisting) {
        item.status = 'skip'; item.messages.push('Already exists - not changed'); summary.skip += 1;
      } else {
        item.status = existing ? 'update' : 'create';
        summary[item.status] += 1;
      }
      if (p.stock && item.status !== 'skip') summary.stockBatches += 1;

      if (!dryRun && item.status !== 'skip') {
        const data = { ...p.medicine };
        if (p.category) {
          const key = p.category.toLowerCase();
          if (!catCache.has(key)) catCache.set(key, (await Category.findOneAndUpdate({ name: new RegExp(`^${escapeRegex(p.category)}$`, 'i') }, { $setOnInsert: { name: p.category } }, { upsert: true, returnDocument: 'after' }))._id);
          data.category = catCache.get(key);
        }
        if (p.supplier) {
          const key = p.supplier.toLowerCase();
          if (!supCache.has(key)) supCache.set(key, (await Supplier.findOneAndUpdate({ name: new RegExp(`^${escapeRegex(p.supplier)}$`, 'i') }, { $setOnInsert: { name: p.supplier } }, { upsert: true, returnDocument: 'after' }))._id);
          data.supplier = supCache.get(key);
        }
        let med = existing;
        if (existing) {
          // never change pack structure under existing stock
          const hasStock = await Batch.exists({ medicine: existing._id, quantity: { $gt: 0 } });
          if (hasStock) { delete data.stripsPerBox; delete data.unitsPerStrip; item.messages.push('Pack structure kept (medicine has stock)'); }
          Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
          Object.assign(existing, data);
          await existing.save();
        } else {
          med = await Medicine.create(data);
        }
        if (p.stock) {
          const dup = await Batch.exists({ medicine: med._id, batchNumber: p.stock.batchNumber });
          if (dup) { item.messages.push(`Batch ${p.stock.batchNumber} already exists - stock not added again`); }
          else {
            const b = await Batch.create({ medicine: med._id, batchNumber: p.stock.batchNumber, expiryDate: p.stock.expiryDate, quantity: 0, purchasePricePerBox: med.purchasePrice, supplier: med.supplier });
            await applyMovement({ batchId: b._id, delta: p.stock.qty, type: 'opening', reason: 'Imported opening stock' });
          }
        }
      }
    } catch (e) {
      item.status = 'error'; item.messages.push(e.code === 11000 ? 'Duplicate barcode in the database' : e.message); summary.errors += 1;
    }
    out.push(item);
  }
  return { summary, rows: out };
}

module.exports = { importMedicines, parseRow };
