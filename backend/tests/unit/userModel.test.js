const { User } = require('../../src/models');

describe('User model', () => {
  test('models.user should exist and have expected fields', () => {
    expect(User).toBeDefined();
    expect(User.rawAttributes).toBeDefined();
    expect(User.rawAttributes.email || User.rawAttributes.username).toBeDefined();
    expect(User.rawAttributes.password_hash || User.rawAttributes.password).toBeDefined();
  });
});
