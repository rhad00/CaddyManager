const bcrypt = require('bcrypt');
const {
  prepareBasicAuth,
  redactBasicAuth,
  toCaddyAuthHandler,
} = require('../../src/utils/basicAuth');

describe('prepareBasicAuth', () => {
  test('returns undefined when the request does not touch basic auth', async () => {
    await expect(prepareBasicAuth(undefined, null)).resolves.toBeUndefined();
  });

  test('disabling keeps the username but drops credentials', async () => {
    const existing = { enabled: true, username: 'admin', hashed_password: 'hash' };
    await expect(prepareBasicAuth({ enabled: false }, existing))
      .resolves.toEqual({ enabled: false, username: 'admin' });
  });

  test('hashes a new password with bcrypt and never stores the plaintext', async () => {
    const stored = await prepareBasicAuth({ enabled: true, username: 'admin', password: 'correct horse' }, null);
    expect(stored).toEqual({ enabled: true, username: 'admin', hashed_password: expect.any(String) });
    expect(stored).not.toHaveProperty('password');
    await expect(bcrypt.compare('correct horse', stored.hashed_password)).resolves.toBe(true);
  });

  test('keeps the existing hash when no new password is sent', async () => {
    const existing = { enabled: true, username: 'admin', hashed_password: '$2b$12$existing' };
    await expect(prepareBasicAuth({ enabled: true, username: 'ops', password: '' }, existing))
      .resolves.toEqual({ enabled: true, username: 'ops', hashed_password: '$2b$12$existing' });
  });

  test('hashes a legacy plaintext password left on the existing record', async () => {
    const existing = { enabled: true, username: 'admin', password: 'legacy-plain' };
    const stored = await prepareBasicAuth({ enabled: true, username: 'admin' }, existing);
    await expect(bcrypt.compare('legacy-plain', stored.hashed_password)).resolves.toBe(true);
  });

  test.each([
    [{ enabled: true, password: 'longenough' }, 'username'],
    [{ enabled: true, username: 'has:colon', password: 'longenough' }, 'username'],
    [{ enabled: true, username: 'has space', password: 'longenough' }, 'username'],
    [{ enabled: true, username: 'admin', password: 'short' }, 'at least 8'],
    [{ enabled: true, username: 'admin', password: 'x'.repeat(73) }, 'at most 72'],
    [{ enabled: true, username: 'admin' }, 'password is required'],
    ['yes', 'object'],
  ])('rejects %o', async (input, message) => {
    await expect(prepareBasicAuth(input, null)).rejects.toThrow(message);
  });
});

describe('redactBasicAuth', () => {
  test('replaces the hash with a has_password flag', () => {
    expect(redactBasicAuth({ enabled: true, username: 'admin', hashed_password: 'hash', password: 'legacy' }))
      .toEqual({ enabled: true, username: 'admin', has_password: true });
  });

  test('passes through empty values', () => {
    expect(redactBasicAuth(null)).toBeNull();
    expect(redactBasicAuth({ enabled: false })).toEqual({ enabled: false, has_password: false });
  });
});

describe('toCaddyAuthHandler', () => {
  test('builds the Caddy JSON authentication handler with http_basic', () => {
    expect(toCaddyAuthHandler({ enabled: true, username: 'admin', hashed_password: 'hash' })).toEqual({
      handler: 'authentication',
      providers: {
        http_basic: {
          accounts: [{ username: 'admin', password: 'hash' }],
        },
      },
    });
  });

  test('returns null when disabled', () => {
    expect(toCaddyAuthHandler({ enabled: false, username: 'admin' })).toBeNull();
    expect(toCaddyAuthHandler(null)).toBeNull();
  });

  test('fails closed (401 for every request) when enabled without a hash', () => {
    // Throwing would abort the whole config rebuild; returning null would open the route
    expect(toCaddyAuthHandler({ enabled: true, username: 'admin' })).toEqual({
      handler: 'static_response',
      status_code: 401,
      body: 'Authentication is misconfigured',
    });
  });
});
