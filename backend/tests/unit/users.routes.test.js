const request = require('supertest');
const express = require('express');

// Mock User model
jest.mock('../../src/models/user', () => {
  const mockUser = {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    findAndCountAll: jest.fn(),
  };
  return mockUser;
});

jest.mock('../../src/services/authService', () => ({ generateToken: jest.fn().mockReturnValue('tok') }));
jest.mock('../../src/middleware/validation', () => ({ userValidation: (req, res, next) => next() }));
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
  roleMiddleware: () => (req, res, next) => next(),
}));

const User = require('../../src/models/user');
const usersRouter = require('../../src/api/users/routes');

describe('Users routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/users', usersRouter);
  });

  beforeEach(() => jest.resetAllMocks());

  test('GET /api/users returns users list', async () => {
    const users = [{ id: '1', email: 'a@b.com', role: 'admin', status: 'active' }];
    User.findAll.mockResolvedValueOnce(users);

    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  test('GET /api/users with pagination returns paginated result', async () => {
    User.findAndCountAll.mockResolvedValueOnce({
      count: 1,
      rows: [{ id: '1', email: 'a@b.com', role: 'admin', status: 'active' }],
    });

    const res = await request(app).get('/api/users?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
  });

  test('POST /api/users creates a user', async () => {
    User.findOne.mockResolvedValueOnce(null);
    User.create.mockResolvedValueOnce({ id: '2', email: 'new@test.com', role: 'read-only', createdAt: new Date() });

    const res = await request(app)
      .post('/api/users')
      .send({ email: 'new@test.com', password: 'Test1234!', role: 'read-only' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/users rejects duplicate email', async () => {
    User.findOne.mockResolvedValueOnce({ id: '1', email: 'dup@test.com' });

    const res = await request(app)
      .post('/api/users')
      .send({ email: 'dup@test.com', password: 'Test1234!' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exists/i);
  });

  test('PUT /api/users/:id updates user role', async () => {
    const mockUser = { id: 'u2', email: 'u@t.com', role: 'read-only', status: 'active', update: jest.fn() };
    User.findByPk.mockResolvedValueOnce(mockUser);
    User.count.mockResolvedValueOnce(2);

    const res = await request(app)
      .put('/api/users/u2')
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(mockUser.update).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });

  test('PUT /api/users/:id unlocks a locked account', async () => {
    const mockUser = { id: 'u3', email: 'l@t.com', role: 'read-only', status: 'locked', update: jest.fn() };
    User.findByPk.mockResolvedValueOnce(mockUser);

    const res = await request(app)
      .put('/api/users/u3')
      .send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', failed_login_attempts: 0, lockout_until: null })
    );
  });

  test('DELETE /api/users/:id deletes a non-admin user', async () => {
    const mockUser = { id: 'u4', role: 'read-only', destroy: jest.fn() };
    User.findByPk.mockResolvedValueOnce(mockUser);

    const res = await request(app).delete('/api/users/u4');
    expect(res.status).toBe(200);
    expect(mockUser.destroy).toHaveBeenCalled();
  });

  test('DELETE /api/users/:id prevents deleting self', async () => {
    const res = await request(app).delete('/api/users/admin-1');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/own/i);
  });

  test('DELETE /api/users/:id prevents deleting last admin', async () => {
    const mockUser = { id: 'u5', role: 'admin', destroy: jest.fn().mockResolvedValue() };
    User.findByPk.mockResolvedValueOnce(mockUser);
    User.count.mockResolvedValueOnce(1);

    const res = await request(app).delete('/api/users/u5');
    expect(User.count).toHaveBeenCalled();
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/last admin/i);
  });
});
