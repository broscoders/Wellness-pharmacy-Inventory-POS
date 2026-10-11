const test = require('node:test');
const assert = require('node:assert');
const { planFEFO } = require('../src/services/stock.service');

const b = (batchNumber, quantity) => ({ batchNumber, quantity });

test('planFEFO takes from the earliest batch first and splits across batches', () => {
  const plan = planFEFO([b('SOON', 40), b('LATE', 100), b('LATER', 5)], 60);
  assert.deepStrictEqual(plan.map((p) => [p.batch.batchNumber, p.quantity]), [['SOON', 40], ['LATE', 20]]);
});

test('planFEFO uses exactly one batch when it is enough, and skips empty batches', () => {
  assert.deepStrictEqual(planFEFO([b('A', 0), b('B', 10), b('C', 10)], 7).map((p) => [p.batch.batchNumber, p.quantity]), [['B', 7]]);
});

test('planFEFO refuses to oversell', () => {
  assert.throws(() => planFEFO([b('A', 10), b('B', 5)], 16), /Insufficient non-expired stock. Available: 15, requested: 16/);
  assert.throws(() => planFEFO([], 1), /Available: 0/);
});

test('the same pool can be planned twice (a second cart line of the same medicine sees the first line\'s use)', () => {
  const pool = [b('A', 30), b('B', 30)];
  const first = planFEFO(pool, 20);
  first.forEach(({ batch, quantity }) => { batch.quantity -= quantity; }); // what checkout does after taking stock
  assert.deepStrictEqual(planFEFO(pool, 25).map((p) => [p.batch.batchNumber, p.quantity]), [['A', 10], ['B', 15]]);
});
