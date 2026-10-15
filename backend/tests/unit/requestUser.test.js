const { currentUser } = require('../../src/utils/requestUser');

describe('currentUser', () => {
  test('returns the user authMiddleware put on the request', () => {
    const user = { id: 'u1', role: 'admin' };
    expect(currentUser({ user })).toBe(user);
  });

  test('throws, rather than returning undefined, when no user was set', () => {
    expect(() => currentUser({})).toThrow(/authMiddleware/);
  });
});
