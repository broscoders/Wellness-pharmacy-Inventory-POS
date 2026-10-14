import test from 'node:test';
import assert from 'node:assert/strict';
import { unitChoices, defaultUnitFor, unitLabel, unitName, locationText, substitutes, genericKey, strengthOf, prepare, search, stockOf, takeLocal, parseQuery, findByBarcode, parseDiscount, normalize } from '../lib/search.js';

const day = 86400000;
const now = Date.now();
const mk = (_id, name, extra = {}) => prepare({
  _id, name, genericName: '', manufacturer: '', category: null, barcode: '', stripsPerBox: 10, unitsPerStrip: 10,
  salePrice: { box: 0, strip: 25, unit: 0 }, wholesalePrice: {}, minStockLevel: 0, requiresPrescription: false, pop: 0,
  batches: [[100, now + 200 * day]], ...extra,
});

const items = [
  mk('1', 'Panadol 500mg', { genericName: 'Paracetamol', manufacturer: 'GSK', barcode: '8961000000001', pop: 50 }),
  mk('2', 'Panadol Extra', { genericName: 'Paracetamol + Caffeine', manufacturer: 'GSK', pop: 20 }),
  mk('3', 'Calpol Syrup 120ml', { genericName: 'Paracetamol', manufacturer: 'GSK' }),
  mk('4', 'Augmentin 625mg', { genericName: 'Amoxicillin + Clavulanate', manufacturer: 'GSK', requiresPrescription: true }),
  mk('5', 'Brufen 400mg', { genericName: 'Ibuprofen', manufacturer: 'Abbott', batches: [] }),            // out of stock
  mk('6', 'Panadol Cold & Flu', { batches: [[40, now - 5 * day]] }),                                      // only expired stock
  mk('7', 'Disprin 300mg', { genericName: 'Aspirin', manufacturer: 'Reckitt' }),
];
const names = (r) => r.map((i) => i.name);

test('prefix of the name finds it, in name order', () => {
  assert.deepEqual(names(search(items, 'pana')).slice(0, 2), ['Panadol 500mg', 'Panadol Extra']);
});
test('generic name and manufacturer are searchable', () => {
  assert.ok(names(search(items, 'paracetamol')).includes('Calpol Syrup 120ml'));
  assert.ok(names(search(items, 'abbott')).includes('Brufen 400mg'));
});
test('words in any order, each must match', () => {
  assert.deepEqual(names(search(items, '500 pana')), ['Panadol 500mg']);
  assert.deepEqual(names(search(items, 'extra panadol')), ['Panadol Extra']);
  assert.deepEqual(search(items, 'panadol zzz'), []);
});
test('typed without a space still matches ("panadol500")', () => {
  assert.equal(search(items, 'panadol500')[0].name, 'Panadol 500mg');
});
test('punctuation and case do not matter', () => {
  assert.equal(normalize('  PANADOL  Cold & Flu '), 'panadol cold flu');
  assert.equal(search(items, 'COLD flu')[0].name, 'Panadol Cold & Flu');
});
test('barcode: exact scan wins, partial digits also find it', () => {
  assert.equal(search(items, '8961000000001')[0].name, 'Panadol 500mg');
  assert.equal(findByBarcode(items, ' 8961000000001 ').name, 'Panadol 500mg');
  assert.equal(findByBarcode(items, '123'), undefined);
});
test('out-of-stock and expired-only medicines sink below sellable ones', () => {
  const r = names(search(items, 'panadol'));
  assert.equal(r[r.length - 1], 'Panadol Cold & Flu');
  assert.equal(names(search(items, 'brufen'))[0], 'Brufen 400mg'); // still findable, just last
});
test('one small typo is forgiven only when nothing else matches', () => {
  assert.equal(search(items, 'panadoll')[0].name, 'Panadol 500mg');   // extra letter
  assert.equal(search(items, 'augmentn')[0].name, 'Augmentin 625mg'); // missing letter
  assert.equal(search(items, 'brufne')[0].name, 'Brufen 400mg');      // swapped letters
  assert.deepEqual(search(items, 'xxxxyyyy'), []);
});
test('empty search is the plain A-Z list (what sold most does not reorder it); category filter works', () => {
  assert.deepEqual(names(search(items, '')).slice(0, 3), ['Augmentin 625mg', 'Brufen 400mg', 'Calpol Syrup 120ml']);
  const busy = items.map((i) => (i._id === '7' ? { ...i, pop: 999 } : i));
  assert.equal(search(busy, '')[0].name, 'Augmentin 625mg'); // Disprin sells most, but is not pushed to the top
  const withCat = items.map((i) => (i._id === '4' ? { ...i, category: 'abx' } : i));
  assert.deepEqual(names(search(withCat, '', { category: 'abx' })), ['Augmentin 625mg']);
});
test('stock: expired batches are not sellable', () => {
  const s = stockOf(items[5], now);
  assert.equal(s.sellable, 0); assert.equal(s.expired, 40); assert.equal(s.onlyExpired, true); assert.equal(s.isOut, true);
  const ok = stockOf(items[0], now);
  assert.equal(ok.sellable, 100); assert.deepEqual(ok.display, { box: 1, strip: 0, unit: 0 }); assert.equal(ok.daysToExpiry, 200);
  assert.equal(stockOf({ ...items[0], minStockLevel: 100 }, now).isLow, true);
});
test('takeLocal sells the earliest expiry first and skips expired', () => {
  const b = [[10, now + 300 * day], [5, now + 10 * day], [50, now - 1 * day]];
  const after = takeLocal(b, 8, now);
  // 5 from the batch expiring in 10 days, the other 3 from the 300-day batch; the expired 50 stays untouched
  assert.deepEqual(after.map(([q]) => q), [50, 7]);
  assert.equal(takeLocal([[5, now + day]], 5, now).length, 0);
});
test('quantity and unit prefix: 3*pana, 10t*pana, 2s*pana', () => {
  assert.deepEqual(parseQuery('3*pana'), { qty: 3, text: 'pana' });
  assert.deepEqual(parseQuery('12 x panadol'), { qty: 12, text: 'panadol' });
  assert.deepEqual(parseQuery('10t*panadol'), { qty: 10, text: 'panadol', unit: 'unit' });  // 10 tablets
  assert.deepEqual(parseQuery('2s*panadol'), { qty: 2, text: 'panadol', unit: 'strip' });
  assert.deepEqual(parseQuery('1B*panadol'), { qty: 1, text: 'panadol', unit: 'box' });
  assert.deepEqual(parseQuery('3 u x extra'), { qty: 3, text: 'extra', unit: 'unit' });
  assert.deepEqual(parseQuery('500mg'), { qty: 1, text: '500mg' });
  assert.deepEqual(parseQuery('panadol 500'), { qty: 1, text: 'panadol 500' });
});
test('discount: a plain number is a percent; "rs" makes it an amount; always capped', () => {
  assert.equal(parseDiscount('2', 500), 10);        // typing 2 means 2%
  assert.equal(parseDiscount('2%', 500), 10);       // the % sign is optional
  assert.equal(parseDiscount('10', 445), 44.5);
  assert.equal(parseDiscount('2.5', 400), 10);
  assert.equal(parseDiscount('rs 75', 500), 75);    // a fixed amount needs "rs"
  assert.equal(parseDiscount('75rs', 500), 75);
  assert.equal(parseDiscount('Rs. 75', 500), 75);
  assert.equal(parseDiscount('150', 500), 500);     // 150% is capped at the whole bill
  assert.equal(parseDiscount('rs 900', 500), 500);
  assert.equal(parseDiscount('-5', 500), 0);
  assert.equal(parseDiscount('abc', 500), 0);
  assert.equal(parseDiscount('', 500), 0);
});
test('search over 5,000 medicines takes a few milliseconds', () => {
  const big = Array.from({ length: 5000 }, (_, i) => mk(String(i), `Medicine ${i} ${['Tablet', 'Syrup', 'Injection'][i % 3]} ${i % 7}mg`, { genericName: `Generic${i % 300}`, manufacturer: `Maker${i % 40}`, pop: i % 70 }));
  const t0 = performance.now();
  for (let i = 0; i < 20; i += 1) search(big, 'medic 12 tab');
  const per = (performance.now() - t0) / 20;
  console.log(`      5,000 medicines: ${per.toFixed(2)} ms per search`);
  assert.ok(per < 40, `search took ${per} ms`);
  const t1 = performance.now(); search(big, 'medicinx 99'); const typo = performance.now() - t1;
  console.log(`      typo search: ${typo.toFixed(1)} ms`);
  assert.ok(typo < 150);
});

test('generic keys ignore order, case and separators', () => {
  assert.equal(genericKey('Paracetamol + Caffeine'), genericKey('caffeine / PARACETAMOL'));
  assert.notEqual(genericKey('Paracetamol'), genericKey('Paracetamol + Caffeine'));
  assert.equal(genericKey(''), '');
  assert.equal(strengthOf('Panadol 500mg'), '500mg');
  assert.equal(strengthOf('Calpol Syrup 120 ml'), '120ml');
  assert.equal(strengthOf('Panadol Extra'), null);
});
test('substitutes: same generic, in stock, same strength first, never itself', () => {
  const pool = [
    mk('a', 'Panadol 500mg', { genericName: 'Paracetamol', pop: 10 }),
    mk('b', 'Calpol 500mg', { genericName: 'paracetamol', pop: 5 }),
    mk('c', 'Fevadol 650mg', { genericName: 'Paracetamol', pop: 90 }),
    mk('d', 'Dolo 500mg', { genericName: 'Paracetamol', batches: [] }),                 // out of stock: never suggested
    mk('e', 'Panadol Extra', { genericName: 'Paracetamol + Caffeine', pop: 99 }),       // different combination
    mk('f', 'Brufen 400mg', { genericName: 'Ibuprofen' }),
    mk('g', 'Old 500mg', { genericName: 'Paracetamol', batches: [[50, now - day]] }),   // expired only
  ];
  const r = substitutes(pool, pool[0]);
  assert.deepEqual(r.map((x) => x.name), ['Calpol 500mg', 'Fevadol 650mg']);
  assert.equal(r[0].sameStrength, true); assert.equal(r[1].sameStrength, false);
  assert.deepEqual(substitutes(pool, mk('z', 'No generic', { genericName: '' })), []);
});

test('shelf location is shown and searchable', () => {
  const a = mk('x1', 'Zinc Tablet', { rack: 'C', row: '2', side: 'Left' });
  const b = mk('x2', 'Vitamin D', { rack: 'D', row: '1', side: 'Right' });
  assert.equal(locationText(a), 'Rack C | Row 2 | Left');
  assert.equal(locationText(mk('x3', 'Plain')), '');
  assert.equal(locationText(mk('x4', 'Half', { rack: 'A' })), 'Rack A');
  assert.deepEqual(search([a, b], 'rack c').map((i) => i.name)[0], 'Zinc Tablet');
  assert.deepEqual(search([a, b], 'right').map((i) => i.name), ['Vitamin D']);
});

import { waNumber, waLink, udhaarMessage, dailyMessage } from '../lib/whatsapp.js';
test('WhatsApp numbers are turned into international format', () => {
  assert.equal(waNumber('0300-1234567'), '923001234567');
  assert.equal(waNumber('+92 300 1234567'), '923001234567');
  assert.equal(waNumber('923001234567'), '923001234567');
  assert.equal(waNumber('0092 300 1234567'), '923001234567');
  assert.equal(waNumber('3001234567'), '923001234567');
  assert.equal(waNumber('+44 7700 900123'), '447700900123');
  assert.equal(waNumber(''), '');
  assert.equal(waNumber('12'), '');
  assert.equal(waNumber(undefined), '');
});
test('WhatsApp link carries the encoded message', () => {
  const l = waLink('0300-1234567', 'Hello & welcome\nbye');
  assert.ok(l.startsWith('https://wa.me/923001234567?text='));
  assert.ok(l.includes(encodeURIComponent('Hello & welcome\nbye')));
  assert.ok(waLink('', 'x').startsWith('https://wa.me/?text='));
});
test('messages mention the name and amount', () => {
  const m = udhaarMessage({ name: 'Ali', balance: 12500, shop: 'Wellness' });
  assert.ok(m.includes('Ali') && m.includes('Rs 12,500') && m.includes('Wellness'));
  const d = dailyMessage({ shopName: 'Wellness', date: '2026-10-12', sales: { total: 1000, bills: 4, cash: 600, card: 100, bank: 0, credit: 300 }, profit: { grossProfit: 200, grossMarginPercent: 20, expenses: 50, netProfit: 150 }, udhaar: { given: 300, received: 100, totalOwed: 900 }, payables: 400, cash: { shiftsClosed: 1, difference: -50, shortOrExtra: [{ user: 'Ali', difference: -50 }] }, stockAlerts: { outOfStock: 1, lowStock: 2, expired: 0, nearExpiry30: 3 }, topSellers: [{ name: 'Panadol' }] });
  assert.ok(d.includes('Rs 1,000') && d.includes('CASH DIFFERENCE') && d.includes('Net profit today: Rs 150') && d.includes('Panadol'));
});

import { homeFor, pageFor } from '../lib/access.js';
test('each role lands on its own home screen', () => {
  const perms = (...p) => (x) => p.includes(x);
  assert.equal(homeFor(perms('reports:view', 'pos:use')), '/dashboard');   // owner
  assert.equal(homeFor(perms('pos:use', 'sales:view')), '/pos');            // cashier / pharmacist
  assert.equal(homeFor(perms('purchases:view', 'dashboard:view')), '/dashboard'); // inventory staff
});
test('an address maps to the menu item that owns it (longest match)', () => {
  const items = [{ href: '/medicines', perm: 'medicines:view' }, { href: '/purchases', perm: 'purchases:view' }, { href: '/purchase-orders', perm: 'purchases:view' }];
  assert.equal(pageFor('/medicines', items).perm, 'medicines:view');
  assert.equal(pageFor('/medicines/import', items).perm, 'medicines:manage'); // extra page, stricter than the list
  assert.equal(pageFor('/purchase-orders', items).href, '/purchase-orders'); // not confused with /purchases
  assert.equal(pageFor('/login', items), undefined);
});

test('units that make sense for each kind of pack', () => {
  const m = (stripsPerBox, unitsPerStrip, extra = {}) => ({ stripsPerBox, unitsPerStrip, ...extra });
  assert.deepEqual(unitChoices(m(10, 10)), ['box', 'strip', 'unit']);   // tablets
  assert.deepEqual(unitChoices(m(10, 1)), ['box', 'unit']);              // box of 10 sachets
  assert.deepEqual(unitChoices(m(1, 12)), ['box', 'unit']);              // one pack of 12 pieces
  assert.deepEqual(unitChoices(m(1, 1)), ['unit']);                      // a single bottle
  assert.equal(defaultUnitFor(m(10, 10)), 'strip');
  assert.equal(defaultUnitFor(m(1, 1)), 'unit');
  assert.equal(unitLabel(m(10, 10, { dosageForm: 'Tablet' }), 'unit'), 'Tablet');
  assert.equal(unitLabel(m(10, 10, { dosageForm: 'Capsule' }), 'unit'), 'Capsule');
  assert.equal(unitLabel(m(1, 1, { dosageForm: 'Syrup' }), 'unit'), 'Unit');
  assert.equal(unitLabel(m(10, 10), 'box'), 'Box');
});

test('unit names use the words counter staff use', () => {
  const tabs = { stripsPerBox: 10, unitsPerStrip: 10 };
  assert.equal(unitName(tabs, 'strip'), 'Strip (patta)');
  assert.equal(unitName(tabs, 'unit'), 'Tablet (goli)');                 // tablets even when no dosage form is filled in
  assert.equal(unitName({ ...tabs, dosageForm: 'Capsule' }, 'unit'), 'Capsule (goli)');
  assert.equal(unitName({ ...tabs, dosageForm: 'Syrup' }, 'unit'), 'Unit');
  assert.equal(unitName({ stripsPerBox: 1, unitsPerStrip: 1 }, 'unit'), 'Unit'); // a bottle or tube is not a goli
  assert.equal(unitName(tabs, 'box'), 'Box');
});
