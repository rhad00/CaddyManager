/**
 * The certificate routes through HTTP (MODERNIZATION.md 4.13): the list, the CA list, the
 * ACME stubs and the upload's rejections, which must also remove the temp files multer wrote.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: null, role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));
jest.mock('../../src/services/caddyService', () => ({ caddyService: { syncCustomCertificates: jest.fn(), verifyTlsForDomains: jest.fn() } }));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { sequelize } = require('../../src/models');

const app = express();
app.use(express.json());
app.use('/api/certificates', require('../../src/api/certificates/routes').router);

const UPLOADS = path.join(process.cwd(), 'uploads');
const uploadedFiles = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []);

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
});

describe('listing', () => {
  test('GET / lists the certificates', async () => {
    const res = await request(app).get('/api/certificates');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /cas lists the certificate authorities', async () => {
    const res = await request(app).get('/api/certificates/cas');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('an unknown certificate is a 404', async () => {
    const res = await request(app).get('/api/certificates/9999');

    expect(res.status).toBe(404);
  });
});

describe('ACME accounts', () => {
  test.each([['get', '/acme/accounts'], ['post', '/acme/accounts'], ['delete', '/acme/accounts/1']])('%s %s is a documented 501', async (method, route) => {
    const res = await request(app)[method](`/api/certificates${route}`);

    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/managed by Caddy/);
  });
});

describe('POST /upload', () => {
  test('both files are required', async () => {
    const res = await request(app).post('/api/certificates/upload').field('name', 'site');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Certificate and private key files are required');
  });

  test('a name is required', async () => {
    const res = await request(app)
      .post('/api/certificates/upload')
      .attach('certificate', Buffer.from('x'), 'c.pem')
      .attach('privateKey', Buffer.from('x'), 'k.pem');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Name is required');
  });

  test('a file that is not a PEM is rejected and its temp copy removed', async () => {
    const before = uploadedFiles().length;

    const res = await request(app)
      .post('/api/certificates/upload')
      .field('name', 'site')
      .attach('certificate', Buffer.from('not a certificate'), 'c.pem')
      .attach('privateKey', Buffer.from('not a key'), 'k.pem');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid PEM format/);
    expect(uploadedFiles().length).toBe(before);
  });
});
