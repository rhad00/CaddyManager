/**
 * The audit log routes against a real database (MODERNIZATION.md 4.8): filters, pagination
 * and the statistics. The userId filter used a column name the model does not have.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: 'u-admin', role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { sequelize, AuditLog, User } = require('../../src/models');

const app = express();
app.use(express.json());
app.use('/api/audit', require('../../src/api/audit/routes').router);

let alice;

beforeAll(async () => {
  await sequelize.sync({ force: true });
  alice = await User.create({ email: 'alice@example.com', password_hash: 'x'.repeat(60), role: 'admin' });
  const rows = [
    { user_id: alice.id, action: 'LOGIN', resource: 'auth', status: 'success', createdAt: new Date('2026-01-01T10:00:00Z') },
    { user_id: alice.id, action: 'LOGIN_FAILED', resource: 'auth', status: 'failure', createdAt: new Date('2026-01-02T10:00:00Z') },
    { user_id: null, action: 'PROXY_CREATED', resource: 'proxy', status: 'success', createdAt: new Date('2026-01-03T10:00:00Z') },
  ];
  for (const row of rows) await AuditLog.create(row);
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
});

const logs = (res) => res.body.logs.map((l) => l.action).sort();

describe('GET /api/audit/logs', () => {
  test('lists every entry with its pagination', async () => {
    const res = await request(app).get('/api/audit/logs');

    expect(res.status).toBe(200);
    expect(logs(res)).toEqual(['LOGIN', 'LOGIN_FAILED', 'PROXY_CREATED']);
    expect(res.body.pagination).toMatchObject({ total: 3, page: 1, limit: 50, totalPages: 1 });
  });

  test('filters by action, resource and status', async () => {
    expect(logs(await request(app).get('/api/audit/logs?action=LOGIN'))).toEqual(['LOGIN']);
    expect(logs(await request(app).get('/api/audit/logs?resource=auth'))).toEqual(['LOGIN', 'LOGIN_FAILED']);
    expect(logs(await request(app).get('/api/audit/logs?status=failure'))).toEqual(['LOGIN_FAILED']);
  });

  test('filters by userId', async () => {
    const res = await request(app).get(`/api/audit/logs?userId=${alice.id}`);

    expect(res.status).toBe(200);
    expect(logs(res)).toEqual(['LOGIN', 'LOGIN_FAILED']);
  });

  test('filters by date range', async () => {
    const res = await request(app).get('/api/audit/logs?startDate=2026-01-02T00:00:00Z&endDate=2026-01-02T23:59:59Z');

    expect(logs(res)).toEqual(['LOGIN_FAILED']);
  });

  test('pages through the entries, newest first', async () => {
    const res = await request(app).get('/api/audit/logs?limit=2&page=2');

    expect(res.body.logs.map((l) => l.action)).toEqual(['LOGIN']);
    expect(res.body.pagination).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
  });

  test('an unusable page falls back to the first one', async () => {
    const res = await request(app).get('/api/audit/logs?page=abc&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
  });

  test('a repeated or nested filter is ignored instead of reaching the query', async () => {
    const repeated = await request(app).get('/api/audit/logs?action=LOGIN&action=PROXY_CREATED');
    const nested = await request(app).get('/api/audit/logs?action[x]=1');

    expect(repeated.status).toBe(200);
    expect(logs(repeated)).toEqual(['LOGIN']);
    expect(nested.status).toBe(200);
    expect(logs(nested)).toEqual(['LOGIN', 'LOGIN_FAILED', 'PROXY_CREATED']);
  });
});

describe('GET /api/audit/stats', () => {
  test('counts by action, resource and status', async () => {
    const res = await request(app).get('/api/audit/stats');

    expect(res.status).toBe(200);
    expect(res.body.stats.total).toBe(3);
  });
});
