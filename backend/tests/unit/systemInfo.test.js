/**
 * GET /api/system/info: what a bug report needs to name (version, Node, database, uptime).
 * Authenticated only: an exact version is not something to hand to anonymous scanners.
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
const { appVersion } = require('../../src/utils/appVersion');

describe('appVersion', () => {
  const original = process.env.APP_VERSION;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = original;
  });

  test('reads the version of package.json', () => {
    delete process.env.APP_VERSION;
    expect(appVersion()).toBe(require('../../package.json').version);
  });

  test('APP_VERSION overrides it (a build can stamp its own version)', () => {
    process.env.APP_VERSION = 'v9.9.9';
    expect(appVersion()).toBe('9.9.9');
  });

  test('ignores an APP_VERSION that is not a plain version', () => {
    process.env.APP_VERSION = '<script>alert(1)</script>';
    expect(appVersion()).toBe(require('../../package.json').version);
  });
});

describe('GET /api/system/info', () => {
  const app = express();
  app.use('/api/system', require('../../src/api/system/routes').router);

  test('returns the version, runtime, database and uptime', async () => {
    const res = await request(app).get('/api/system/info');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.info).toEqual({
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      node: process.version,
      database: 'sqlite',
      uptimeSeconds: expect.any(Number),
    });
    expect(res.body.info.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  test('does not expose paths, environment variables or secrets', async () => {
    const res = await request(app).get('/api/system/info');

    expect(Object.keys(res.body.info).sort()).toEqual(['database', 'node', 'uptimeSeconds', 'version']);
    expect(JSON.stringify(res.body)).not.toMatch(/JWT_SECRET|ENCRYPTION_KEY|password/i);
  });
});
