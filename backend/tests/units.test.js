const test = require('node:test');
const assert = require('node:assert');
const { toBase, fromBase, unitPrice, parseExpiry } = require('../src/utils/units');

const med = { stripsPerBox: 10, unitsPerStrip: 10 };

test('toBase converts box/strip/unit to base units', () => {
  assert.strictEqual(toBase(med, { box: 1 }), 100);
  assert.strictEqual(toBase(med, { box: 2, strip: 3, unit: 5 }), 235);
  assert.strictEqual(toBase(med, { strip: 1 }), 10);
});

test('fromBase converts back for display', () => {
  assert.deepStrictEqual(fromBase(med, 235), { box: 2, strip: 3, unit: 5 });
  assert.deepStrictEqual(fromBase(med, 0), { box: 0, strip: 0, unit: 0 });
});

test('unitPrice derives per-unit price from any defined price', () => {
  assert.strictEqual(unitPrice({ box: 500 }, med, 'box'), 5);
  assert.strictEqual(unitPrice({ strip: 55, unit: 6 }, med, 'strip'), 5.5);
  assert.strictEqual(unitPrice({ strip: 50 }, med, 'unit'), 5);
});

test('parseExpiry handles YYYY-MM as end of month and rejects junk', () => {
  assert.strictEqual(parseExpiry('2030-02').toISOString(), '2030-02-28T23:59:59.000Z');
  assert.strictEqual(parseExpiry('2028-02').toISOString(), '2028-02-29T23:59:59.000Z');
  assert.strictEqual(parseExpiry('not a date'), null);
});
