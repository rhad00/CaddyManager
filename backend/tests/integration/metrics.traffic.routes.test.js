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

test('history: daily points, a clear message for a bad range, prototype names are not ranges', async () => {
  const { TrafficRollup } = require('../../src/models');
  const hour = Math.floor(now() / 3600) * 3600 - 3600;
  await TrafficRollup.create({ hour_ts: hour, scope_id: 'total', requests: 7, status_2xx: 7, bytes: 70, duration_sum_ms: 70, duration_count: 7 });

  const res = await request(app).get('/api/metrics/history?range=30d');
  expect(res.status).toBe(200);
  expect(res.body.history.series.requests).toHaveLength(30);
  expect(res.body.history.totals.requests).toBe(7);
  expect(res.body.history.coveredFrom).toBe(hour);

  expect((await request(app).get('/api/metrics/history?range=1y')).body.message).toMatch(/30d or 90d/);
  expect((await request(app).get('/api/metrics/history?range=toString')).status).toBe(400);
  const unknown = await request(app).get('/api/metrics/history?proxy=nope');
  expect(unknown.body.history.scope).toBeNull();
});

test('upstreams: probes the active proxies and keeps working without the Caddy admin API', async () => {
  const res = await request(app).get('/api/metrics/upstreams');

  expect(res.status).toBe(200);
  expect(res.body.upstreams.caddyAvailable).toBe(false);
  expect(res.body.upstreams.rows).toHaveLength(1);
  expect(res.body.upstreams.rows[0]).toMatchObject({ proxyName: 'Cloud', dial: 'cloud:80', inFlight: null });
  expect(['up', 'down']).toContain(res.body.upstreams.rows[0].state);
});

test('certificates: one row per domain with the stored check', async () => {
  const proxy = await Proxy.findOne({ where: { name: 'Cloud' } });
  const validTo = new Date(Date.now() + 10 * 86_400_000).toISOString();
  await proxy.update({
    tls_status: { ok: true, results: [{ domain: 'cloud.example.com', ok: true, issuer: 'Test CA', validTo }] },
    tls_checked_at: new Date(),
  });

  const res = await request(app).get('/api/metrics/certificates');

  expect(res.status).toBe(200);
  expect(res.body.certificates).toHaveLength(1);
  expect(res.body.certificates[0]).toMatchObject({ domain: 'cloud.example.com', state: 'valid', issuer: 'Test CA', proxyName: 'Cloud' });
  expect(res.body.certificates[0].daysLeft).toBeGreaterThanOrEqual(9);
  expect(res.body.certificates[0].checkedAt).toBeTruthy();
});

test('live: the last five minutes, newest first, without query strings', async () => {
  const withQuery = JSON.stringify({
    ts: now() - 3, level: 'info', logger: 'http.log.access', status: 502, duration: 0.5, size: 1,
    request: { host: 'cloud.example.com', method: 'POST', uri: '/api?token=secret', remote_ip: '203.0.113.1' },
  });
  fs.writeFileSync(logFile, [line(120, 'cloud.example.com', 200), withQuery].join('\n'));

  const res = await request(app).get('/api/metrics/live');

  expect(res.status).toBe(200);
  expect(res.body.live.total).toBe(2);
  expect(res.body.live.series.requests).toHaveLength(60);
  expect(res.body.live.recent[0]).toMatchObject({ path: '/api', status: 502, method: 'POST' });
  expect(JSON.stringify(res.body)).not.toContain('secret');
});

test('a proxy scope returns the detailed breakdowns for that proxy and the total only', async () => {
  fs.writeFileSync(logFile, [line(60, 'cloud.example.com', 200), line(20, 'scanner.example.org', 404)].join('\n'));
  const proxy = await Proxy.findOne({ where: { name: 'Cloud' } });

  const res = await request(app).get(`/api/metrics/traffic?range=1h&proxy=${proxy.id}`);
  const cloud = res.body.traffic.proxies.find((p) => p.name === 'Cloud');
  expect(res.body.traffic.scope).toBe(proxy.id);
  expect(cloud.detail.topPaths[0].key).toBe('/a');
  expect(res.body.traffic.totals.detail).toBeDefined();
  expect(res.body.traffic.other.detail).toBeUndefined();

  const unknown = await request(app).get('/api/metrics/traffic?range=1h&proxy=does-not-exist');
  expect(unknown.body.traffic.scope).toBeNull();
  expect(unknown.body.traffic.proxies.find((p) => p.name === 'Cloud').detail).toBeUndefined();
});
