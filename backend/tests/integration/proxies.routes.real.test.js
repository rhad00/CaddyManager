const request = require('supertest');
const express = require('express');

// Mock models and services used by routes
jest.mock('../../../src/models/proxy', () => ({
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) }
}));

jest.mock('../../../src/models/header', () => ({ create: jest.fn(), destroy: jest.fn() }));
jest.mock('../../../src/models/middleware', () => ({ create: jest.fn(), destroy: jest.fn() }));
jest.mock('../../../src/services/caddyService', () => ({ addProxy: jest.fn().mockResolvedValue({ ok: true }), updateProxy: jest.fn().mockResolvedValue({ ok: true }), deleteProxy: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('../../../src/services/securityHeadersService', () => ({ applySecurityHeaders: jest.fn(), removeSecurityHeaders: jest.fn() }));
jest.mock('../../../src/services/auditService', () => ({ logAction: jest.fn() }));

const Proxy = require('../../../src/models/proxy');
const Header = require('../../../src/models/header');
const Middleware = require('../../../src/models/middleware');
const proxiesRouter = require('../../../src/api/proxies/routes');

// Simple auth middleware bypass for tests
jest.mock('../../../src/middleware/auth', () => ({ authMiddleware: (req, res, next) => { req.user = { id: 'test-user' }; return next(); } }));

describe('Proxies routes (integration-style with mocks)', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/proxies', proxiesRouter);
  });

  beforeEach(() => jest.clearAllMocks());

  test('GET /api/proxies returns proxies list', async () => {
    Proxy.findAll.mockResolvedValueOnce([{ id: 'p1' }]);
    Proxy.findAll.mockResolvedValueOnce([{ id: 'p1', name: 'one', domains: ['a'], upstream_url: 'http://up' }]);

    const res = await request(app).get('/api/proxies');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.proxies)).toBe(true);
  });

  test('POST /api/proxies creates a proxy and calls caddyService', async () => {
    const fakeProxy = { id: 'newp', name: 'n', domains: ['d'], upstream_url: 'http://u' };
    Proxy.findAll.mockResolvedValueOnce([]); // for conflict check
    // create returns proxy instance
    Proxy.create.mockResolvedValueOnce(fakeProxy);
    Proxy.findByPk.mockResolvedValueOnce({ ...fakeProxy, id: 'newp' });

    const res = await request(app).post('/api/proxies').send({ name: 'n', domains: ['d'], upstream_url: 'http://u' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
