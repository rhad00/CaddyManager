const request = require('supertest');

// Mock database before requiring app
jest.mock('../../src/config/database', () => ({
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(true),
    sync: jest.fn(),
    define: jest.fn(),
  },
  testConnection: jest.fn().mockResolvedValue(true),
}));

// Mock individual model files that route files require directly
jest.mock('../../src/models/user', () => ({
  findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
  create: jest.fn(), count: jest.fn(), findAndCountAll: jest.fn(),
}));
jest.mock('../../src/models/proxy', () => ({
  findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
  create: jest.fn(), count: jest.fn(), findAndCountAll: jest.fn(),
}));
jest.mock('../../src/models/header', () => ({
  findAll: jest.fn(), bulkCreate: jest.fn(), destroy: jest.fn(),
}));
jest.mock('../../src/models/middleware', () => ({
  findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(),
  upsert: jest.fn(), destroy: jest.fn(),
}));
jest.mock('../../src/models/template', () => ({
  findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(),
  create: jest.fn(), count: jest.fn(), findAndCountAll: jest.fn(),
}));

// Mock models/index.js (used by services and other imports)
jest.mock('../../src/models', () => ({
  User: {},
  Proxy: {},
  Header: {},
  Middleware: {},
  Template: {},
  Certificate: {},
  Backup: {},
  AuditLog: {},
  Metric: {},
  GitRepository: { findAll: jest.fn().mockResolvedValue([]) },
  DiscoveredService: {},
  ConfigChange: {},
  sequelize: { sync: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, res, next) => { req.user = { id: 'test', role: 'admin' }; next(); },
  roleMiddleware: () => (req, res, next) => next(),
}));

const { app } = require('../../src/app');
const { testConnection } = require('../../src/config/database');

describe('Health & Readiness endpoints', () => {
  test('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  test('GET /ready returns 200 when database is connected', async () => {
    testConnection.mockResolvedValueOnce(true);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('GET /ready returns 503 when database is down', async () => {
    testConnection.mockResolvedValueOnce(false);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not ready');
  });
});

describe('API Versioning', () => {
  test('GET /api/v1/csrf-token returns a CSRF token', async () => {
    const res = await request(app).get('/api/v1/csrf-token');
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeDefined();
  });

  test('GET /api/csrf-token still works (backward compat)', async () => {
    const res = await request(app).get('/api/csrf-token');
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeDefined();
  });
});
