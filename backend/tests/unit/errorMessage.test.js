const { errorMessage } = require('../../src/utils/errorMessage');

describe('errorMessage', () => {
  test('an Error gives its message', () => {
    expect(errorMessage(new TypeError('bad type'))).toBe('bad type');
  });

  test('a { message } object that is not an Error gives its message', () => {
    expect(errorMessage({ message: 'from a double' })).toBe('from a double');
  });

  test.each([
    ['a string', 'plain', 'plain'],
    ['a number', 42, '42'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
    ['an object without a message', { code: 1 }, '[object Object]'],
    ['an object with a non-string message', { message: 7 }, '[object Object]'],
  ])('%s is stringified', (_label, value, expected) => {
    expect(errorMessage(value)).toBe(expected);
  });
});
