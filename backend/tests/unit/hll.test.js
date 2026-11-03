const { HyperLogLog } = require('../../src/services/hll');

const within = (actual, expected, tolerance) => Math.abs(actual - expected) <= expected * tolerance;

test('an empty sketch counts zero and small sets are near exact', () => {
  expect(new HyperLogLog().count()).toBe(0);
  const hll = new HyperLogLog();
  for (let i = 0; i < 50; i++) hll.add(`10.0.0.${i}`);
  expect(Math.abs(hll.count() - 50)).toBeLessThanOrEqual(1);
});

test('the same value counted twice is one visitor', () => {
  const hll = new HyperLogLog();
  for (let i = 0; i < 1000; i++) hll.add('198.51.100.7');
  expect(hll.count()).toBe(1);
});

test('large sets are within a few percent', () => {
  const hll = new HyperLogLog();
  for (let i = 0; i < 100000; i++) hll.add(`ip-${i}`);
  expect(within(hll.count(), 100000, 0.05)).toBe(true);
});

test('merging gives the union, not the sum', () => {
  const a = new HyperLogLog();
  const b = new HyperLogLog();
  for (let i = 0; i < 3000; i++) a.add(`v${i}`);
  for (let i = 1500; i < 4500; i++) b.add(`v${i}`);
  a.merge(b);
  expect(within(a.count(), 4500, 0.05)).toBe(true);
});

test('IPv6 and short strings hash without error', () => {
  const hll = new HyperLogLog();
  ['::1', '2001:db8::1', 'a', 'ab', 'abc', 'abcd', 'abcde'].forEach((v) => hll.add(v));
  expect(Math.abs(hll.count() - 7)).toBeLessThanOrEqual(1);
});
