import test from 'node:test';
import assert from 'node:assert/strict';
import { derivedPrices, priceFromMargin, marginPct, packText } from '../lib/pricing.js';

test('strip and tablet prices follow from the box price', () => {
  assert.deepEqual(derivedPrices(245, 10, 10), { strip: 24.5, unit: 2.45 });
  assert.deepEqual(derivedPrices(500, 10, 10), { strip: 50, unit: 5 });
  assert.deepEqual(derivedPrices(1200, 1, 1), { strip: 1200, unit: 1200 });   // a single bottle
  assert.deepEqual(derivedPrices(100, 3, 7), { strip: 33.33, unit: 4.76 });   // rounded to paisa
  assert.deepEqual(derivedPrices('', 10, 10), { strip: 0, unit: 0 });
  assert.deepEqual(derivedPrices(100, '', ''), { strip: 100, unit: 100 });    // missing pack numbers count as 1
});

test('price from margin: margin is a share of the SELLING price, rounded up', () => {
  assert.deepEqual(priceFromMargin(400, 20), { price: 500, cappedByMrp: false });     // 400 / 0.8
  assert.deepEqual(priceFromMargin(400, 15), { price: 471, cappedByMrp: false });     // 470.58 -> 471
  assert.equal(marginPct(400, priceFromMargin(400, 15).price), 15.1);                  // the margin really is at least 15%
  assert.deepEqual(priceFromMargin(400, 0), { price: 400, cappedByMrp: false });
  assert.deepEqual(priceFromMargin(400, 20, { mrp: 480 }), { price: 480, cappedByMrp: true });  // never above the printed MRP
  assert.deepEqual(priceFromMargin(400, 20, { mrp: 600 }), { price: 500, cappedByMrp: false });
  for (const bad of [[0, 20], [400, 100], [400, -5], [400, 'abc']]) assert.deepEqual(priceFromMargin(...bad), { price: 0, cappedByMrp: false });
});

test('margin percentage', () => {
  assert.equal(marginPct(400, 500), 20);
  assert.equal(marginPct(400, 350), -14.3);   // selling at a loss
  assert.equal(marginPct(0, 500), null);
  assert.equal(marginPct(400, 0), null);
});

test('pack text', () => {
  assert.equal(packText(10, 10), '1 box = 10 strips = 100 tablets');
  assert.equal(packText(10, 1), '1 box = 10 pieces');
  assert.equal(packText(1, 12), '1 box = 12 pieces');
  assert.equal(packText(1, 1), '1 box = 1 piece');
});

import { mapRows, parseCsv, TEMPLATE_COLUMNS } from '../lib/importCsv.js';
test('the import file understands a maximum stock column', () => {
  assert.ok(TEMPLATE_COLUMNS.includes('maxStock'));
  const { records, recognised, ignored } = mapRows(parseCsv('Medicine Name,Minimum Stock,Maximum Stock\nPanadol,100,400\n'));
  assert.deepEqual(ignored, []);
  assert.ok(recognised.includes('maxStock') && recognised.includes('minStock'));
  assert.deepEqual(records[0], { name: 'Panadol', minStock: '100', maxStock: '400' });
});
