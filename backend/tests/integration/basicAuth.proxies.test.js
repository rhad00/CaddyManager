/**
 * Basic auth through the proxies API and the startup migration:
 * passwords are hashed before storage and never returned by the API.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/services/caddyService', () => ({
  addProxy: jest.fn().mockResolvedValue({ success: true }),
  updateProxy: jest.fn().mockResolvedValue({ success: true }),
  deleteProxy: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: null, role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { sequelize, Proxy } = require('../../src/models');
const proxiesRouter = require('../../src/api/proxies/routes');
const migration = require('../../src/migrations/20261013-hash-basic-auth-passwords');

const app = express();
app.use(express.json());
app.use('/api/proxies', proxiesRouter);

const baseBody = {
  name: 'secured-app',
  domains: ['secured.example.com'],
  upstream_url: 'http://app:8080',
  ssl_type: 'acme',
};

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  // tests/setup.js also closes the connection when run under the default jest config
  try { await sequelize.close(); } catch { /* already closed */ }
});

beforeEach(async () => {
  await Proxy.destroy({ where: {} });
});

test('create hashes the password and the response does not expose it', async () => {
  const res = await request(app).post('/api/proxies').send({
    ...baseBody,
    basic_auth: { enabled: true, username: 'admin', password: 'correct horse' },
  });

  expect(res.status).toBe(201);
  expect(res.body.proxy.basic_auth).toEqual({ enabled: true, username: 'admin', has_password: true });

  const stored = await Proxy.findByPk(res.body.proxy.id);
  expect(stored.basic_auth.password).toBeUndefined();
  await expect(bcrypt.compare('correct horse', stored.basic_auth.hashed_password)).resolves.toBe(true);
});

test('update without a password keeps the stored hash', async () => {
  const created = await request(app).post('/api/proxies').send({
    ...baseBody,
    basic_auth: { enabled: true, username: 'admin', password: 'correct horse' },
  });
  const before = (await Proxy.findByPk(created.body.proxy.id)).basic_auth.hashed_password;

  const res = await request(app).put(`/api/proxies/${created.body.proxy.id}`).send({
    basic_auth: { enabled: true, username: 'admin', password: '' },
  });

  expect(res.status).toBe(200);
  expect((await Proxy.findByPk(created.body.proxy.id)).basic_auth.hashed_password).toBe(before);
});

test('enabling without a password is rejected', async () => {
  const res = await request(app).post('/api/proxies').send({
    ...baseBody,
    basic_auth: { enabled: true, username: 'admin' },
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/password is required/);
});

test('GET responses never include the hash', async () => {
  await request(app).post('/api/proxies').send({
    ...baseBody,
    basic_auth: { enabled: true, username: 'admin', password: 'correct horse' },
  });
  const res = await request(app).get('/api/proxies');
  expect(res.status).toBe(200);
  expect(JSON.stringify(res.body)).not.toMatch(/hashed_password|\$2[aby]\$/);
});

// Regression for MODERNIZATION.md 0.12 (ssl_type enum lacked 'cloudflare')
test('creates a Cloudflare DNS-01 proxy', async () => {
  const res = await request(app).post('/api/proxies').send({ ...baseBody, ssl_type: 'cloudflare' });
  expect(res.status).toBe(201);
  expect((await Proxy.findByPk(res.body.proxy.id)).ssl_type).toBe('cloudflare');
});

test('rejects an unknown ssl_type', async () => {
  const res = await request(app).post('/api/proxies').send({ ...baseBody, ssl_type: 'letsencrypt' });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/ssl_type must be one of/);
});

test('migration hashes legacy plaintext passwords', async () => {
  const legacy = await Proxy.create({
    ...baseBody,
    basic_auth: { enabled: true, username: 'admin', password: 'legacy-plain' },
  });

  await migration.up(sequelize.getQueryInterface(), sequelize.constructor);

  const migrated = (await Proxy.findByPk(legacy.id)).basic_auth;
  expect(migrated.password).toBeUndefined();
  expect(migrated.username).toBe('admin');
  await expect(bcrypt.compare('legacy-plain', migrated.hashed_password)).resolves.toBe(true);
});
