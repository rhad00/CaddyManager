const axios = require('axios');
const fs = require('fs');

jest.mock('axios');
jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: { destroy: jest.fn(), create: jest.fn() },
  Middleware: { destroy: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) }
}));

jest.mock('fs', () => ({ promises: { writeFile: jest.fn(), mkdir: jest.fn() }, existsSync: jest.fn(), unlinkSync: jest.fn() }));

const { Proxy, Header } = require('../../src/models');
const caddyService = require('../../src/services/caddyService');

describe('CaddyService', () => {
  afterEach(() => jest.clearAllMocks());

  test('shouldUseHTTPSTransport detects https urls', () => {
    expect(caddyService.shouldUseHTTPSTransport('https://example.com')).toBe(true);
    expect(caddyService.shouldUseHTTPSTransport('http://example.com:443')).toBe(true);
    expect(caddyService.shouldUseHTTPSTransport('http://example.com')).toBe(false);
  });

  test('createRouteFromProxy creates reverse_proxy handler and headers', () => {
    const proxy = {
      domains: ['a.example.com'],
      upstream_url: 'http://upstream:8080',
      headers: [{ header_type: 'request', header_name: 'x-test', header_value: 'v', enabled: true }],
      compression_enabled: true
    };

    const route = caddyService.createRouteFromProxy(proxy);
    expect(route.match[0].host).toEqual(['a.example.com']);
    expect(route.handle.some(h => h.handler === 'reverse_proxy')).toBe(true);
  });

  test('addProxy posts route and updates proxy index', async () => {
    // Mock getConfig sequence: initial, after add, and for backup
    const baseConfig = { apps: { http: { servers: { srv0: { routes: [] } } } } };
    const updatedConfig = { apps: { http: { servers: { srv0: { routes: [{}, {}] } } } } };
    axios.get.mockResolvedValueOnce({ data: baseConfig })
      .mockResolvedValueOnce({ data: updatedConfig })
      .mockResolvedValueOnce({ data: updatedConfig }); // for backupCurrentConfig

    axios.post.mockResolvedValueOnce({}); // for adding route

    const proxy = { domains: ['a'], upstream_url: 'http://u', update: jest.fn() };
    const res = await caddyService.addProxy(proxy);
    expect(res.success).toBe(true);
    expect(proxy.update).toHaveBeenCalled();
  });

  test('deleteProxy deletes route and adjusts indices', async () => {
    axios.delete.mockResolvedValue({});
    Proxy.findAll.mockResolvedValue([{ id: 'p2', caddy_route_index: 3, update: jest.fn() }]);
    const proxy = { caddy_route_index: 2, destroy: jest.fn() };
    const res = await caddyService.deleteProxy(proxy);
    expect(res.success).toBe(true);
    expect(proxy.destroy).toHaveBeenCalled();
  });

  test('applyTemplate removes headers and creates new ones then updates proxy', async () => {
    const proxy = {
      id: 'p1',
      caddy_route_index: 0,
      upstream_url: 'http://backend:3000',
      domains: ['example.com'],
      reload: jest.fn(),
      update: jest.fn().mockResolvedValue(true)
    };
    // make reload return the proxy with headers attached
    proxy.reload.mockResolvedValue({ ...proxy, headers: [{ header_type: 'request', header_name: 'h', header_value: 'v', enabled: true }] });
    const template = { headers: [{ header_type: 'request', header_name: 'h', header_value: 'v' }] };
    Proxy.findAll.mockResolvedValue([]);

    // Mock getConfig sequence: oldConfig for applyTemplate, then getConfig in updateProxy, then for backup
    const oldConfig = { apps: { http: { servers: { srv0: { routes: [ { handle: [ { handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3000' }] } ] } ] } } } } };
    const updatedConfig = JSON.parse(JSON.stringify(oldConfig));
    axios.get.mockResolvedValueOnce({ data: oldConfig })
      .mockResolvedValueOnce({ data: updatedConfig })
      .mockResolvedValueOnce({ data: updatedConfig });

    axios.post.mockResolvedValue({});

    const res = await caddyService.applyTemplate(proxy, template);
    expect(res).toHaveProperty('success');
  });

  test('rebuildConfigFromDatabase builds and loads config from proxies', async () => {
    // Base config contains one caddyManager route (backend) and one random route
    const baseConfig = {
      apps: { http: { servers: { srv0: { routes: [
        { handle: [ { handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3000' }] } ] },
        { handle: [ { handler: 'reverse_proxy', upstreams: [{ dial: 'other:8080' }] } ] }
      ] } } } }
    };

    axios.get.mockResolvedValueOnce({ data: baseConfig });
    axios.post.mockResolvedValueOnce({}); // for loadConfig

    // Two proxies in DB, one duplicate domain to test uniqueness
    const p1 = { id: 'p1', domains: ['a.example.com'], upstream_url: 'http://u1', headers: [], update: jest.fn() };
    const p2 = { id: 'p2', domains: ['b.example.com'], upstream_url: 'http://u2', headers: [], update: jest.fn() };
    const pDup = { id: 'p3', domains: ['a.example.com'], upstream_url: 'http://u1', headers: [], update: jest.fn() };

    Proxy.findAll.mockResolvedValue([p1, p2, pDup]);

    const res = await caddyService.rebuildConfigFromDatabase();

    // Expect that proxies were updated with route index (called for unique proxies only)
    expect(p1.update).toHaveBeenCalled();
    expect(p2.update).toHaveBeenCalled();
    // pDup should be filtered out (domain duplicate), so its update may not be called
    // Expect axios.post was called to load the new config
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/load'), expect.any(Object), expect.any(Object));
  });

  test('loadConfig throws when Caddy rejects', async () => {
    const badConfig = { invalid: true };
    axios.post.mockRejectedValueOnce(new Error('caddy failure'));

    await expect(caddyService.loadConfig(badConfig)).rejects.toThrow(/Failed to load configuration/);
  });

  test('includeInBackup returns backupData with error when getConfig fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('caddy unreachable'));
    const backupData = { created: Date.now() };

    const res = await caddyService.includeInBackup(backupData);
    expect(res).toHaveProperty('caddy_config_error');
    expect(res.caddy_config_error).toMatch(/caddy unreachable/);
  });

  test('createRouteFromProxy handles path_routing subroutes', () => {
    const proxy = {
      domains: ['paths.example.com'],
      path_routing: {
        enabled: true,
        routes: [
          { path: '/api', upstream_url: 'http://api:4000' },
          { path: '/static', upstream_url: 'http://static:5000' }
        ]
      }
    };

    const route = caddyService.createRouteFromProxy(proxy);
    // Should have a subroute handler
    expect(route.handle.some(h => h.handler === 'subroute')).toBe(true);
    const sub = route.handle.find(h => h.handler === 'subroute');
    expect(sub.routes.length).toBe(2);
    expect(sub.routes[0].match[0].path).toEqual(['/api']);
  });

  test('createRouteFromProxy includes basic_auth handler when enabled', () => {
    const proxy = {
      domains: ['auth.example.com'],
      upstream_url: 'http://u',
      basic_auth: { enabled: true, username: 'alice', hashed_password: 'hashed' }
    };

    const route = caddyService.createRouteFromProxy(proxy);
    expect(route.handle.some(h => h.handler === 'basic_auth')).toBe(true);
    const auth = route.handle.find(h => h.handler === 'basic_auth');
    expect(auth.users).toHaveProperty('alice', 'hashed');
  });

  test('createRouteFromProxy includes rate_limit handler when enabled', () => {
    const proxy = {
      domains: ['rl.example.com'],
      upstream_url: 'http://u',
      rate_limit: { enabled: true, requests_per_second: 5, burst: 10 }
    };

    const route = caddyService.createRouteFromProxy(proxy);
    expect(route.handle.some(h => h.handler === 'rate_limit')).toBe(true);
    const rl = route.handle.find(h => h.handler === 'rate_limit');
    expect(rl.rate).toBe(5);
    expect(rl.burst).toBe(10);
  });

  test('createRouteFromProxy sets transport.tls for https upstreams', () => {
    const proxy = {
      domains: ['secure.example.com'],
      upstream_url: 'https://secure-upstream:443'
    };

    const route = caddyService.createRouteFromProxy(proxy);
    const rp = route.handle.find(h => h.handler === 'reverse_proxy');
    expect(rp.transport).toBeDefined();
    expect(rp.transport.tls).toBeDefined();
    expect(rp.transport.tls.insecure_skip_verify).toBe(true);
  });

  test('rebuildConfigFromDatabase handles proxies with combined handlers in correct order', async () => {
    // Base config with only caddyManager route preserved
    const baseConfig = { apps: { http: { servers: { srv0: { routes: [ { handle: [ { handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3000' }] } ] } ] } } } } };

    axios.get.mockResolvedValueOnce({ data: baseConfig });
    axios.post.mockResolvedValueOnce({}); // for loadConfig

    const combinedProxy = {
      id: 'pc',
      domains: ['combined.example.com'],
      upstream_url: 'http://combined:7000',
      rate_limit: { enabled: true, requests_per_second: 2, burst: 5 },
      ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.0.0.0/8'] },
      basic_auth: { enabled: true, username: 'bob', hashed_password: 'h' },
      compression_enabled: true,
      path_routing: {
        enabled: true,
        routes: [{ path: '/a', upstream_url: 'http://a:7001' }]
      },
      headers: [{ header_type: 'request', header_name: 'x-c', header_value: '1', enabled: true }],
      update: jest.fn()
    };

    Proxy.findAll.mockResolvedValue([combinedProxy]);

    await caddyService.rebuildConfigFromDatabase();

    // After rebuild, update should be called to set caddy_route_index
    expect(combinedProxy.update).toHaveBeenCalled();

    // Inspect the route that would have been created
    const route = caddyService.createRouteFromProxy(combinedProxy);

    // Handler order: rate_limit, request_filter (ip_filtering), basic_auth, encode (compression), subroute
    const handlers = route.handle;
    expect(handlers[0].handler).toBe('rate_limit');
    expect(handlers[1].handler).toBe('request_filter');
    expect(handlers[2].handler).toBe('basic_auth');
    // compression encode may appear before reverse_proxy/subroute
    expect(handlers.some(h => h.handler === 'encode')).toBe(true);
    // subroute must exist and contain the path routing
    expect(handlers.some(h => h.handler === 'subroute')).toBe(true);

    const sub = handlers.find(h => h.handler === 'subroute');
    expect(sub.routes[0].match[0].path).toEqual(['/a']);
  });

  test('rebuildConfigFromDatabase sends route with reverse_proxy terminal and headers inside reverse_proxy when no path_routing', async () => {
    const baseConfig = { apps: { http: { servers: { srv0: { routes: [ { handle: [ { handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3000' }] } ] } ] } } } } };

    axios.get.mockResolvedValueOnce({ data: baseConfig });
    axios.post.mockResolvedValueOnce({}); // for loadConfig

    const proxy = {
      id: 'pno',
      domains: ['nop.example.com'],
      upstream_url: 'http://no-path:9000',
      rate_limit: { enabled: true, requests_per_second: 1, burst: 2 },
      ip_filtering: { enabled: true, mode: 'deny', ip_list: ['192.168.0.0/16'] },
      basic_auth: { enabled: true, username: 'z', hashed_password: 'hp' },
      compression_enabled: true,
      path_routing: { enabled: false },
      headers: [ { header_type: 'request', header_name: 'x-req', header_value: 'r', enabled: true }, { header_type: 'response', header_name: 'x-res', header_value: 's', enabled: true } ],
      update: jest.fn()
    };

    Proxy.findAll.mockResolvedValue([proxy]);

    await caddyService.rebuildConfigFromDatabase();

    // Find the axios.post that loaded the config
    const loadCall = axios.post.mock.calls.find(call => String(call[0]).includes('/load'));
    expect(loadCall).toBeDefined();
    const payload = loadCall[1];

    const routes = payload.apps.http.servers.srv0.routes;
    const route = routes[routes.length - 1];
    const handlers = route.handle;

    // Exact order expected: rate_limit, request_filter, basic_auth, encode, reverse_proxy
    expect(handlers[0].handler).toBe('rate_limit');
    expect(handlers[1].handler).toBe('request_filter');
    expect(handlers[2].handler).toBe('basic_auth');
    expect(handlers[3].handler).toBe('encode');
    const rp = handlers[4];
    expect(rp.handler).toBe('reverse_proxy');

    // Headers for request/response should reside inside reverse_proxy.headers
    expect(rp.headers).toBeDefined();
    expect(rp.headers.request.set['x-req']).toEqual(['r']);
    expect(rp.headers.response.set['x-res']).toEqual(['s']);
  });
});
