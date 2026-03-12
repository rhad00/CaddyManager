const request = require('supertest');
const express = require('express');

jest.mock('../../src/models/template', () => ({
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
  findAndCountAll: jest.fn(),
}));

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
  roleMiddleware: () => (req, res, next) => next(),
}));

jest.mock('../../src/services/caddyService', () => ({}));
jest.mock('../../src/models/proxy', () => ({ findByPk: jest.fn() }));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));

const Template = require('../../src/models/template');
const templateRouter = require('../../src/api/templates/routes');

describe('Templates routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/templates', templateRouter);
  });

  beforeEach(() => jest.clearAllMocks());

  test('GET /api/templates returns all templates', async () => {
    Template.findAll.mockResolvedValueOnce([{ id: '1', name: 'authelia' }]);

    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.templates)).toBe(true);
  });

  test('GET /api/templates with pagination returns paginated result', async () => {
    Template.findAndCountAll.mockResolvedValueOnce({
      count: 1,
      rows: [{ id: '1', name: 'authelia' }],
    });

    const res = await request(app).get('/api/templates?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.totalPages).toBe(1);
  });

  test('GET /api/templates/:id returns a template', async () => {
    Template.findByPk.mockResolvedValueOnce({ id: '1', name: 'authelia' });

    const res = await request(app).get('/api/templates/1');
    expect(res.status).toBe(200);
    expect(res.body.template.name).toBe('authelia');
  });

  test('GET /api/templates/:id returns 404 for missing template', async () => {
    Template.findByPk.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/templates/nonexistent');
    expect(res.status).toBe(404);
  });
});
