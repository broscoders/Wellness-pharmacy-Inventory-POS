import test from 'node:test';
import assert from 'node:assert/strict';
import { locationText, substitutes, genericKey, strengthOf, prepare, search, stockOf, takeLocal, parseQuery, findByBarcode, parseDiscount, normalize } from '../lib/search.js';

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

test('prefix of the name finds it, best seller first', () => {
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
test('empty search lists best sellers first; category filter works', () => {
  assert.equal(search(items, '')[0].name, 'Panadol 500mg');
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
test('quantity prefix: 3*pana / 2x extra', () => {
  assert.deepEqual(parseQuery('3*pana'), { qty: 3, text: 'pana' });
  assert.deepEqual(parseQuery('12 x panadol'), { qty: 12, text: 'panadol' });
  assert.deepEqual(parseQuery('500mg'), { qty: 1, text: '500mg' });
  assert.deepEqual(parseQuery('panadol 500'), { qty: 1, text: 'panadol 500' });
});
test('discount accepts an amount or a percentage and is capped', () => {
  assert.equal(parseDiscount('10%', 500), 50);
  assert.equal(parseDiscount('75', 500), 75);
  assert.equal(parseDiscount('900', 500), 500);
  assert.equal(parseDiscount('-5', 500), 0);
  assert.equal(parseDiscount('abc', 500), 0);
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
