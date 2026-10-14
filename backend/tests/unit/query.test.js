const { queryString } = require('../../src/utils/query');

describe('queryString', () => {
  test.each([
    ['a string', 'abc1234', 'abc1234'],
    ['the first of repeated parameters', ['abc1234', 'def5678'], 'abc1234'],
    ['nothing', undefined, undefined],
    ['an object (?a[b]=1)', { b: '1' }, undefined],
    ['an array that starts with an object', [{ b: '1' }], undefined],
    ['an empty array', [], undefined],
  ])('gives %s', (_label, input, expected) => {
    expect(queryString(input)).toBe(expected);
  });
});
