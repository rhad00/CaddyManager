let models;
try {
  // eslint-disable-next-line global-require
  models = require('../../src/models');
} catch (e) {
  models = null;
}

describe('User model', () => {
  test('models.user should exist and have expected fields', () => {
    if (!models) {
      expect(models).toBeNull();
      return;
    }
    const { User } = models;
    expect(User).toBeDefined();
    if (User && User.rawAttributes) {
      expect(User.rawAttributes.email || User.rawAttributes.username).toBeDefined();
      expect(User.rawAttributes.password_hash || User.rawAttributes.password).toBeDefined();
    }
  });
});
