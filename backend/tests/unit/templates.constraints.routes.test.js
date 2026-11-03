const request = require('supertest');
const express = require('express');

jest.mock('../../src/models/template', () => ({
  Template: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findAndCountAll: jest.fn() },
}));
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
  roleMiddleware: () => (req, res, next) => next(),
  requireApiKeyPermission: () => (req, res, next) => next(),
}));
jest.mock('../../src/services/caddyService', () => ({ caddyService: { applyTemplate: jest.fn(async () => ({ ok: true })) } }));
jest.mock('../../src/models/proxy', () => ({ Proxy: { findByPk: jest.fn() } }));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));

const { Template } = require('../../src/models/template');
const { Proxy } = require('../../src/models/proxy');
const { caddyService } = require('../../src/services/caddyService');
const { router } = require('../../src/api/templates/routes');

describe('template constraints over the API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/templates', router);

  beforeEach(() => jest.clearAllMocks());

  test('GET /:id returns the constraints of the template', async () => {
    Template.findByPk.mockResolvedValueOnce({ id: '1', name: 'Amazon S3' });
    const res = await request(app).get('/api/templates/1');
    expect(res.body.template.constraints.map((c) => c.option).sort()).toEqual(['basic_auth', 'compression_enabled']);
  });

  test('GET /:id returns no constraints for other templates', async () => {
    Template.findByPk.mockResolvedValueOnce({ id: '2', name: 'Grafana' });
    const res = await request(app).get('/api/templates/2');
    expect(res.body.template.constraints).toEqual([]);
  });

  test('applying the S3 template resets compression and basic auth before the route is built', async () => {
    const proxy = { id: 'p', compression_enabled: true, basic_auth: { enabled: true }, update: jest.fn(async () => {}) };
    Template.findByPk.mockResolvedValueOnce({ id: '1', name: 'Amazon S3' });
    Proxy.findByPk.mockResolvedValueOnce(proxy);
    const res = await request(app).post('/api/templates/1/apply/p');
    expect(res.status).toBe(200);
    expect(proxy.update).toHaveBeenCalledWith({ compression_enabled: false, basic_auth: null });
    expect(proxy.update.mock.invocationCallOrder[0]).toBeLessThan(caddyService.applyTemplate.mock.invocationCallOrder[0]);
    expect(res.body.adjusted.sort()).toEqual(['basic_auth', 'compression_enabled']);
  });

  test('applying S3 to a proxy that already complies changes nothing', async () => {
    const proxy = { id: 'p', compression_enabled: false, basic_auth: null, update: jest.fn() };
    Template.findByPk.mockResolvedValueOnce({ id: '1', name: 'Amazon S3' });
    Proxy.findByPk.mockResolvedValueOnce(proxy);
    const res = await request(app).post('/api/templates/1/apply/p');
    expect(proxy.update).not.toHaveBeenCalled();
    expect(res.body.adjusted).toEqual([]);
  });
});
