/**
 * The discovery list filters (MODERNIZATION.md 4.11): source_type and status are checked
 * instead of going straight into the query, where a bad value was a database error on
 * PostgreSQL (invalid enum value) and an empty list on SQLite.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('dockerode', () => jest.fn());
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: 'u-admin', role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { sequelize, DiscoveredService } = require('../../src/models');

const app = express();
app.use(express.json());
app.use('/api/discovery', require('../../src/api/discovery/routes').router);

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await DiscoveredService.create({ source_type: 'docker', source_id: 'c1', source_name: 'web', status: 'active' });
  await DiscoveredService.create({ source_type: 'docker', source_id: 'c2', source_name: 'db', status: 'stopped' });
  await DiscoveredService.create({ source_type: 'docker', source_id: 'c3', source_name: 'api', status: 'active' });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
});

const names = (res) => res.body.services.map((s) => s.source_name).sort();

describe('GET /api/discovery', () => {
  test('lists everything without a filter', async () => {
    const res = await request(app).get('/api/discovery');

    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['api', 'db', 'web']);
  });

  test('filters by source_type and by status', async () => {
    expect(names(await request(app).get('/api/discovery?source_type=docker'))).toEqual(['api', 'db', 'web']);
    expect(names(await request(app).get('/api/discovery?status=active'))).toEqual(['api', 'web']);
    expect(names(await request(app).get('/api/discovery?source_type=docker&status=active'))).toEqual(['api', 'web']);
  });

  test('an empty filter value means no filter', async () => {
    const res = await request(app).get('/api/discovery?source_type=&status=');

    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['api', 'db', 'web']);
  });

  test.each([
    ['source_type=podman'],
    ['source_type=kubernetes'],
    ['status=exploded'],
  ])('rejects an unknown filter value (%s) with a 400', async (query) => {
    const res = await request(app).get(`/api/discovery?${query}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false });
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('a repeated filter uses its first value and a nested one is ignored (queryString)', async () => {
    expect(names(await request(app).get('/api/discovery?status=stopped&status=active'))).toEqual(['db']);
    expect(names(await request(app).get('/api/discovery?status[ne]=active'))).toEqual(['api', 'db', 'web']);
  });

  test('pages the filtered list', async () => {
    const res = await request(app).get('/api/discovery?source_type=docker&limit=1&page=2');

    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ total: 3, page: 2, limit: 1, totalPages: 3 });
  });
});
