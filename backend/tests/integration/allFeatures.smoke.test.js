const request = require('supertest');
const { app } = require('../../src/app');

describe('All feature routes smoke tests', () => {
  test('GET /health returns liveness response', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /ready responds with readiness state', async () => {
    const res = await request(app).get('/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
  });

  test.each([
    '/api/csrf-token',
    '/api/v1/csrf-token',
    '/api/features',
    '/api/v1/features',
  ])('GET %s is mounted and reachable', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
  });

  test.each([
    '/api/auth/me',
    '/api/v1/auth/me',
    '/api/proxies',
    '/api/v1/proxies',
    '/api/templates',
    '/api/v1/templates',
    '/api/users',
    '/api/v1/users',
    '/api/backups',
    '/api/v1/backups',
    '/api/certificates',
    '/api/v1/certificates',
    '/api/metrics',
    '/api/v1/metrics',
    '/api/audit/logs',
    '/api/v1/audit/logs',
    '/api/discovery',
    '/api/v1/discovery',
    '/api/git/repositories',
    '/api/v1/git/repositories',
    '/api/logs',
    '/api/v1/logs',
    '/api/alerts/channels',
    '/api/v1/alerts/channels',
    '/api/keys',
    '/api/v1/keys',
  ])('GET %s is mounted and protected', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
  });
});