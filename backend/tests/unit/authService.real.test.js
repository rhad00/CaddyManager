const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => ({
  User: {
    findOne: jest.fn()
  }
}));

const { User } = require('../../src/models');
const authService = require('../../src/services/authService');

describe('authService (real tests with mocks)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('authenticateUser returns not found when user missing', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await authService.authenticateUser('nope@example.com', 'pass');
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not found/i);
  });

  test('authenticateUser handles locked accounts', async () => {
    const user = { status: 'locked' };
    User.findOne.mockResolvedValue(user);
    const res = await authService.authenticateUser('locked@example.com', 'pass');
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/locked/i);
  });

  test('authenticateUser rejects invalid password and increments failed attempts', async () => {
    const user = {
      id: 'u1',
      email: 'u@example.com',
      role: 'read-only',
      status: 'active',
      failed_login_attempts: 0,
      checkPassword: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(true)
    };
    User.findOne.mockResolvedValue(user);

    const res = await authService.authenticateUser('u@example.com', 'wrong');
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/invalid password/i);
    expect(user.failed_login_attempts).toBeGreaterThanOrEqual(1);
    expect(user.save).toHaveBeenCalled();
  });

  test('authenticateUser succeeds for valid credentials and returns token', async () => {
    const user = {
      id: 'u2',
      email: 'ok@example.com',
      role: 'admin',
      status: 'active',
      failed_login_attempts: 2,
      checkPassword: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(true)
    };
    User.findOne.mockResolvedValue(user);

    // Spy on jwt.sign to produce predictable token
    const signSpy = jest.spyOn(jwt, 'sign').mockReturnValue('signed-token');

    const res = await authService.authenticateUser('ok@example.com', 'right');
    expect(res.success).toBe(true);
    expect(res.token).toBe('signed-token');
    expect(res.user.email).toBe('ok@example.com');
    expect(user.failed_login_attempts).toBe(0);
    expect(user.save).toHaveBeenCalled();

    signSpy.mockRestore();
  });
});
