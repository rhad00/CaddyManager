const request = require('supertest');
let app;

beforeAll(() => {
  app = require('../../src/app');
});

describe('Auth API', () => {
  test('GET /api/auth should return 404 or relevant response', async () => {
    const res = await request(app).get('/api/auth');
    expect([200, 401, 404]).toContain(res.statusCode);
  });
});
