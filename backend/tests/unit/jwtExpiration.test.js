const { jwtExpiration } = require('../../src/utils/jwtExpiration');

describe('jwtExpiration', () => {
  test('defaults to 24h', () => {
    expect(jwtExpiration({})).toBe('24h');
  });

  test('JWT_EXPIRES_IN, the name the docs, compose files and .env templates use, is honoured', () => {
    expect(jwtExpiration({ JWT_EXPIRES_IN: '7d' })).toBe('7d');
  });

  test('the older JWT_EXPIRATION still works and wins when both are set', () => {
    expect(jwtExpiration({ JWT_EXPIRATION: '1h' })).toBe('1h');
    expect(jwtExpiration({ JWT_EXPIRATION: '1h', JWT_EXPIRES_IN: '7d' })).toBe('1h');
  });

  test('blank values fall back to the default', () => {
    expect(jwtExpiration({ JWT_EXPIRES_IN: '  ', JWT_EXPIRATION: '' })).toBe('24h');
  });
});
