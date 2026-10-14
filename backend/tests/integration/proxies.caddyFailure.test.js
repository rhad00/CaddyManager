/**
 * The database and Caddy must not drift apart when Caddy rejects a change
 * (MODERNIZATION.md 0.15): the proxy routes commit to the database first, so a Caddy
 * failure has to undo that commit instead of leaving an orphan row behind a 500.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/services/caddyService', () => ({
  caddyService: {
    addProxy: jest.fn(),
    updateProxy: jest.fn(),
    deleteProxy: jest.fn(),
  },
}));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: null, role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { sequelize, Proxy, Header } = require('../../src/models');
const { caddyService } = require('../../src/services/caddyService');
const proxiesRouter = require('../../src/api/proxies/routes');

const app = express();
app.use(express.json());
app.use('/api/proxies', proxiesRouter);

const baseBody = {
  name: 'app',
  domains: ['app.example.com'],
  upstream_url: 'http://app:8080',
  ssl_type: 'acme',
  headers: [{ header_type: 'request', header_name: 'X-Original', header_value: 'one', enabled: true }],
};

const caddyRejects = () => Promise.reject(new Error('Failed to add proxy: loading config: invalid handler'));

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
});

beforeEach(async () => {
  jest.clearAllMocks();
  caddyService.addProxy.mockResolvedValue({ success: true });
  caddyService.updateProxy.mockResolvedValue({ success: true });
  caddyService.deleteProxy.mockResolvedValue({ success: true });
  await Header.destroy({ where: {} });
  await Proxy.destroy({ where: {} });
});

describe('create', () => {
  test('a Caddy failure removes the new proxy and its headers and reports 502', async () => {
    caddyService.addProxy.mockImplementation(caddyRejects);

    const res = await request(app).post('/api/proxies').send(baseBody);

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid handler/);
    expect(await Proxy.count()).toBe(0);
    expect(await Header.count()).toBe(0);
  });

  test('a failed cleanup still reports the Caddy error as 502', async () => {
    caddyService.addProxy.mockImplementation(caddyRejects);
    const destroy = jest.spyOn(Proxy, 'destroy').mockRejectedValueOnce(new Error('database is locked'));

    const res = await request(app).post('/api/proxies').send(baseBody);
    destroy.mockRestore();

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/invalid handler/);
    expect(res.body.message).toMatch(/could not be removed/);
  });

  test('the same proxy can be created again once Caddy accepts it', async () => {
    caddyService.addProxy.mockImplementationOnce(caddyRejects);
    await request(app).post('/api/proxies').send(baseBody);

    const res = await request(app).post('/api/proxies').send(baseBody);

    expect(res.status).toBe(201);
    expect(await Proxy.count()).toBe(1);
  });
});

describe('update', () => {
  test('a Caddy failure restores the previous proxy, headers included, and reports 502', async () => {
    const created = await request(app).post('/api/proxies').send(baseBody);
    const id = created.body.proxy.id;
    caddyService.updateProxy.mockImplementation(caddyRejects);

    const res = await request(app).put(`/api/proxies/${id}`).send({
      upstream_url: 'http://other:9090',
      headers: [{ header_type: 'request', header_name: 'X-Replaced', header_value: 'two', enabled: true }],
    });

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/invalid handler/);
    const stored = await Proxy.findByPk(id, { include: [{ model: Header, as: 'headers' }] });
    expect(stored.upstream_url).toBe('http://app:8080');
    expect(stored.headers.map((h) => h.header_name)).toEqual(['X-Original']);
  });
});

describe('update with a concurrent edit', () => {
  test('the restore does not overwrite a change made while Caddy was being called', async () => {
    const created = await request(app).post('/api/proxies').send(baseBody);
    const id = created.body.proxy.id;
    caddyService.updateProxy.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5)); // a distinct updatedAt
      await Proxy.update({ name: 'edited-elsewhere' }, { where: { id } });
      throw new Error('loading config: invalid handler');
    });

    const res = await request(app).put(`/api/proxies/${id}`).send({ upstream_url: 'http://other:9090' });

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/could not be restored/);
    expect((await Proxy.findByPk(id)).name).toBe('edited-elsewhere');
  });
});

describe('delete', () => {
  test('hands Caddy the deleted proxy without asking it to delete the row again', async () => {
    const created = await request(app).post('/api/proxies').send({ ...baseBody, ssl_type: 'cloudflare' });

    const res = await request(app).delete(`/api/proxies/${created.body.proxy.id}`);

    expect(res.status).toBe(200);
    expect(await Proxy.count()).toBe(0);
    const [passed] = caddyService.deleteProxy.mock.calls[0];
    expect(passed).toMatchObject({ id: created.body.proxy.id, ssl_type: 'cloudflare' });
  });
});
