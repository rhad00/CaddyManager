const request = require('supertest');
const express = require('express');

const mockUser = { id: 'u-admin', role: 'admin' };

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    req.user = mockUser;
    return next();
  },
}));

const mockFindAll = jest.fn();
const mockFindByPk = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../src/models', () => ({
  ApiKey: {
    findAll: (...args) => mockFindAll(...args),
    findByPk: (...args) => mockFindByPk(...args),
    create: (...args) => mockCreate(...args),
  },
  User: {},
}));

const mockLogAction = jest.fn();
jest.mock('../../src/services/auditService', () => ({
  logAction: (...args) => mockLogAction(...args),
}));

const keysRouter = require('../../src/api/keys/routes');

describe('API keys route regressions', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/keys', keysRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.id = 'u-admin';
    mockUser.role = 'admin';
  });

  test('POST /api/keys rejects overlong key name', async () => {
    const res = await request(app).post('/api/keys').send({
      name: 'x'.repeat(101),
      permissions: ['read'],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/between 1 and 100 characters/i);
  });

  test('POST /api/keys rejects non-printable characters in name', async () => {
    const res = await request(app).post('/api/keys').send({
      name: 'bad\u0000name',
      permissions: ['read'],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/printable ascii/i);
  });

  test('POST /api/keys rejects empty permissions', async () => {
    const res = await request(app).post('/api/keys').send({
      name: 'CI key',
      permissions: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least one permission is required/i);
  });

  test('POST /api/keys rejects invalid expires_at date', async () => {
    const res = await request(app).post('/api/keys').send({
      name: 'expiring key',
      permissions: ['read'],
      expires_at: 'not-a-real-date',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid date/i);
  });

  test('POST /api/keys blocks non-admin from admin-level key', async () => {
    mockUser.role = 'user';
    const res = await request(app).post('/api/keys').send({
      name: 'escalation-attempt',
      permissions: ['admin'],
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only admins can create admin-level keys/i);
  });

  test('PUT /api/keys/:id writes API_KEY_UPDATED audit log', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    mockFindByPk.mockResolvedValueOnce({
      id: 'k-1',
      name: 'old-name',
      key_hash: 'hash',
      enabled: true,
      created_by: 'u-admin',
      save,
      toJSON: () => ({ id: 'k-1', name: 'new-name', key_hash: 'hash', enabled: false }),
    });

    const res = await request(app).put('/api/keys/k-1').send({ name: 'new-name', enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.key.key_hash).toBeUndefined();
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'API_KEY_UPDATED',
        resource: 'api_key',
        resourceId: 'k-1',
      }),
      expect.any(Object)
    );
  });

  test('POST /api/keys successful create returns raw_key and logs create event', async () => {
    mockCreate.mockResolvedValueOnce({
      id: 'k-created',
      name: 'CI key',
      key_prefix: 'cm_abc12',
      permissions: ['read'],
      expires_at: null,
    });

    const res = await request(app).post('/api/keys').send({
      name: 'CI key',
      permissions: ['read'],
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.raw_key).toMatch(/^cm_/);
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'API_KEY_CREATED', resource: 'api_key' }),
      expect.any(Object)
    );
  });
});