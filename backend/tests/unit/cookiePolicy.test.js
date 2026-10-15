const { cookiePolicy } = require('../../src/utils/cookiePolicy');

describe('cookiePolicy', () => {
  test('production: Secure, strict, and the __Host- CSRF cookie (HTTPS or localhost only)', () => {
    expect(cookiePolicy({ NODE_ENV: 'production' })).toEqual({
      secure: true, sameSite: 'strict', csrfCookieName: '__Host-x-csrf-token',
    });
  });

  test('development and test: plain cookies, lax', () => {
    expect(cookiePolicy({ NODE_ENV: 'development' })).toEqual({ secure: false, sameSite: 'lax', csrfCookieName: 'x-csrf-token' });
    expect(cookiePolicy({})).toEqual({ secure: false, sameSite: 'lax', csrfCookieName: 'x-csrf-token' });
  });

  test('COOKIE_SECURE=false lets a production install be used over plain HTTP (browsers drop Secure cookies there)', () => {
    expect(cookiePolicy({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toEqual({
      secure: false, sameSite: 'strict', csrfCookieName: 'x-csrf-token',
    });
  });

  test('COOKIE_SECURE=true forces Secure cookies outside production too', () => {
    expect(cookiePolicy({ NODE_ENV: 'development', COOKIE_SECURE: 'true' })).toEqual({
      secure: true, sameSite: 'lax', csrfCookieName: '__Host-x-csrf-token',
    });
  });

  test('any other COOKIE_SECURE value is ignored', () => {
    expect(cookiePolicy({ NODE_ENV: 'production', COOKIE_SECURE: 'maybe' }).secure).toBe(true);
  });
});
