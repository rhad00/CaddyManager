const request = require('supertest');
const { app } = require('../../src/app');

describe('Route module smoke coverage', () => {
  test('GET /api/alerts/channels requires auth (route is mounted)', async () => {
    const res = await request(app).get('/api/alerts/channels');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/keys requires auth (route is mounted)', async () => {
    const res = await request(app).get('/api/keys');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/logs requires auth (route is mounted)', async () => {
    const res = await request(app).get('/api/logs');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/discovery requires auth (route is mounted)', async () => {
    const res = await request(app).get('/api/discovery');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/git/repositories requires auth (route is mounted)', async () => {
    const res = await request(app).get('/api/git/repositories');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/certificates requires auth (route is mounted)', async () => {
    const res = await request(app).get('/api/certificates');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/features is reachable without auth', async () => {
    const res = await request(app).get('/api/features');
    expect([200, 500]).toContain(res.statusCode);
  });
});
