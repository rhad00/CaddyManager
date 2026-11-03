/**
 * The bundled Caddyfile ships a catch-all "No routes configured yet" route. Caddy runs routes in
 * order and that one has no host match, so a proxy route added after it never receives a request
 * (every request answers 503). The placeholder must stay last: proxies are inserted before it.
 * (A config that already has it first is repaired by the rebuild from the database at startup.)
 */
const axios = require('axios');

jest.mock('axios');
jest.mock('fs', () => ({
  promises: { access: jest.fn(), readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() },
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));
jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: { findAll: jest.fn(async () => []) },
  Middleware: { findAll: jest.fn(async () => []) },
  Certificate: { findAll: jest.fn(async () => []) },
  sequelize: {},
}));

const { Proxy } = require('../../src/models');
const { caddyService } = require('../../src/services/caddyService');

const placeholder = (body = 'No routes configured yet (HTTPS)') => ({
  handle: [{ handler: 'subroute', routes: [{ handle: [{ handler: 'static_response', status_code: 503, body }] }] }],
});
const hostRoute = (host) => ({
  match: [{ host: [host] }],
  handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'u:80' }] }],
});
const configWith = (routes) => ({ apps: { http: { servers: { srv0: { listen: [':443'], routes } } } } });
const newProxy = () => ({
  domains: ['s3.example.com'],
  upstream_url: 'http://u:80',
  ssl_type: 'none',
  update: jest.fn().mockResolvedValue(true),
});

describe('addProxy and the catch-all placeholder route', () => {
  beforeEach(() => {
    axios.post.mockResolvedValue({});
    axios.put.mockResolvedValue({});
    axios.delete.mockResolvedValue({});
    Proxy.findAll.mockResolvedValue([]);
  });
  afterEach(() => jest.clearAllMocks());

  test('inserts the route before a trailing placeholder, which stays last', async () => {
    axios.get.mockResolvedValue({ data: configWith([placeholder()]) });
    const proxy = newProxy();

    const result = await caddyService.addProxy(proxy);

    expect(result.routeIndex).toBe(0);
    expect(axios.put).toHaveBeenCalledTimes(1);
    expect(axios.put.mock.calls[0][0]).toMatch(/\/servers\/srv0\/routes\/0$/);
    expect(axios.put.mock.calls[0][1].match[0].host).toEqual(['s3.example.com']);
    expect(axios.post.mock.calls.some(([url]) => /\/routes$/.test(String(url)))).toBe(false);
    expect(proxy.update).toHaveBeenCalledWith({ caddy_route_index: 0 });
  });

  test('later proxies go before the placeholder too', async () => {
    axios.get.mockResolvedValue({ data: configWith([hostRoute('a.example.com'), placeholder()]) });

    const result = await caddyService.addProxy(newProxy());

    expect(result.routeIndex).toBe(1);
    expect(axios.put.mock.calls[0][0]).toMatch(/\/routes\/1$/);
  });

  test('without a placeholder the route is appended as before', async () => {
    axios.get.mockResolvedValue({ data: configWith([hostRoute('a.example.com')]) });

    const result = await caddyService.addProxy(newProxy());

    expect(result.routeIndex).toBe(1);
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.post.mock.calls.some(([url]) => /\/servers\/srv0\/routes$/.test(String(url)))).toBe(true);
  });

  test('a failed add removes the route at the index it was inserted at', async () => {
    axios.get.mockResolvedValue({ data: configWith([placeholder()]) });
    const proxy = newProxy();
    proxy.update.mockRejectedValue(new Error('db down'));

    await expect(caddyService.addProxy(proxy)).rejects.toThrow(/db down/);
    expect(axios.delete.mock.calls[0][0]).toMatch(/\/routes\/0$/);
  });
});
