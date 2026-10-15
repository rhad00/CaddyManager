/**
 * Applying a template replaces the proxy's headers and middlewares, then pushes the route to
 * Caddy. When Caddy refuses, the proxy must keep what it had instead of the half-applied template.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

jest.mock('axios');

const { sequelize, Proxy, Header, Middleware } = require('../../src/models');
const { caddyService } = require('../../src/services/caddyService');

const template = {
  headers: [{ header_type: 'request', header_name: 'X-From-Template', header_value: 't' }],
  middleware: [{ middleware_type: 'redirect', configuration: { from: '/', to: '/app' }, order: 0 }],
};

let proxy;

beforeAll(async () => { await sequelize.sync({ force: true }); });
afterAll(async () => { try { await sequelize.close(); } catch { /* already closed */ } });
beforeEach(async () => {
  await Header.destroy({ where: {} });
  await Middleware.destroy({ where: {} });
  await Proxy.destroy({ where: {} });
  proxy = await Proxy.create({ name: 'tpl-app', domains: ['tpl.example.com'], upstream_url: 'http://app:80', ssl_type: 'none' });
  await Header.create({ proxy_id: proxy.id, header_type: 'request', header_name: 'X-Mine', header_value: 'mine', enabled: true });
  await Middleware.create({ proxy_id: proxy.id, middleware_type: 'rate_limit', configuration: { rate: 5, unit: 'second' }, order: 0, enabled: true });
  jest.spyOn(caddyService, 'getConfig').mockResolvedValue({ apps: { http: { servers: { srv0: { routes: [] } } } } });
});
afterEach(() => jest.restoreAllMocks());

const state = async () => ({
  headers: (await Header.findAll({ where: { proxy_id: proxy.id } })).map((h) => h.header_name).sort(),
  middlewares: (await Middleware.findAll({ where: { proxy_id: proxy.id } })).map((m) => m.middleware_type).sort(),
});

test('a successful apply replaces the headers and middlewares', async () => {
  jest.spyOn(caddyService, 'updateProxy').mockResolvedValue({ success: true });

  await caddyService.applyTemplate(proxy, template);

  expect(await state()).toEqual({ headers: ['X-From-Template'], middlewares: ['redirect'] });
});

test('a Caddy failure restores what the proxy had', async () => {
  jest.spyOn(caddyService, 'updateProxy').mockRejectedValue(new Error('caddy said no'));

  await expect(caddyService.applyTemplate(proxy, template)).rejects.toThrow(/Failed to apply template: caddy said no/);

  expect(await state()).toEqual({ headers: ['X-Mine'], middlewares: ['rate_limit'] });
  const restored = await Header.findOne({ where: { proxy_id: proxy.id } });
  expect(restored.enabled).toBe(true);
  expect(restored.header_value).toBe('mine');
});
