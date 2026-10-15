/**
 * skip_tls_verify (trust a self-signed HTTPS upstream) used to be read by the route builder but
 * could not be stored or set through the API.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/services/caddyService', () => ({
  caddyService: {
    addProxy: jest.fn().mockResolvedValue({ success: true }),
    updateProxy: jest.fn().mockResolvedValue({ success: true }),
    deleteProxy: jest.fn().mockResolvedValue({ success: true }),
  },
}));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: null, role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { sequelize, Proxy } = require('../../src/models');
const { router: proxiesRouter } = require('../../src/api/proxies/routes');
const migration = require('../../src/migrations/20261014-add-skip-tls-verify-to-proxies');

const app = express();
app.use(express.json());
app.use('/api/proxies', proxiesRouter);

const body = { name: 'selfsigned-app', domains: ['ss.example.com'], upstream_url: 'https://app:8006', ssl_type: 'acme' };

beforeAll(async () => { await sequelize.sync({ force: true }); });
afterAll(async () => { try { await sequelize.close(); } catch { /* already closed */ } });
beforeEach(async () => { await Proxy.destroy({ where: {} }); });

test('defaults to verifying the upstream certificate', async () => {
  const res = await request(app).post('/api/proxies').send(body);
  expect(res.status).toBe(201);
  expect((await Proxy.findByPk(res.body.proxy.id)).skip_tls_verify).toBe(false);
});

test('can be enabled on create and changed on update', async () => {
  const created = await request(app).post('/api/proxies').send({ ...body, skip_tls_verify: true });
  expect(created.status).toBe(201);
  const id = created.body.proxy.id;
  expect((await Proxy.findByPk(id)).skip_tls_verify).toBe(true);

  const updated = await request(app).put(`/api/proxies/${id}`).send({ skip_tls_verify: false });
  expect(updated.status).toBe(200);
  expect((await Proxy.findByPk(id)).skip_tls_verify).toBe(false);
});

test('the migration is a no-op when the column exists', async () => {
  await expect(migration.up(sequelize.getQueryInterface(), require('sequelize'))).resolves.toBeUndefined();
});
