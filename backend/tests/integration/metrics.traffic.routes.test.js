/**
 * GET /api/metrics/traffic: per-proxy analytics from the access log, against a real database.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-traffic-route-'));
const logFile = path.join(dir, 'access.log');
process.env.CADDY_ACCESS_LOG = logFile;

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: 'u-admin', role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { sequelize, Proxy, User } = require('../../src/models');

const app = express();
app.use(express.json());
app.use('/api/metrics', require('../../src/api/metrics/routes').router);

const now = () => Math.floor(Date.now() / 1000);
const line = (ago, host, status) => JSON.stringify({
  ts: now() - ago, level: 'info', logger: 'http.log.access', status, duration: 0.02, size: 10,
  request: { host, method: 'GET', uri: '/a', remote_ip: '203.0.113.1' },
});

beforeAll(async () => {
  await sequelize.sync({ force: true });
  const user = await User.create({ email: 'a@example.com', password_hash: 'x'.repeat(60), role: 'admin' });
  await Proxy.create({ name: 'Cloud', domains: ['cloud.example.com'], upstream_url: 'http://cloud:80', ssl_type: 'acme', created_by: user.id });
});
afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('returns the traffic of each proxy for the range', async () => {
  fs.writeFileSync(logFile, [line(60, 'cloud.example.com', 200), line(30, 'cloud.example.com', 500), line(20, 'scanner.example.org', 404)].join('\n'));

  const res = await request(app).get('/api/metrics/traffic?range=1h');

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.traffic.range).toBe('1h');
  expect(res.body.traffic.available).toBe(true);
  const cloud = res.body.traffic.proxies.find((p) => p.name === 'Cloud');
  expect(cloud.requests).toBe(2);
  expect(cloud.status['5xx']).toBe(1);
  expect(res.body.traffic.other.hosts).toEqual(['scanner.example.org']);
});

test('defaults to 24 hours and rejects an unknown range with a message', async () => {
  const ok = await request(app).get('/api/metrics/traffic');
  expect(ok.body.traffic.range).toBe('24h');

  const bad = await request(app).get('/api/metrics/traffic?range=1y');
  expect(bad.status).toBe(400);
  expect(bad.body.message).toMatch(/1h, 6h, 24h or 7d/);
});

test('says the log is unavailable when there is none', async () => {
  fs.rmSync(logFile, { force: true });
  const res = await request(app).get('/api/metrics/traffic?range=6h');
  expect(res.status).toBe(200);
  expect(res.body.traffic.available).toBe(false);
});
