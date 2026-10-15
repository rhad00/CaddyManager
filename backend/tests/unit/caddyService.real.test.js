const axios = require('axios');
const fs = require('fs');

jest.mock('axios');
jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: { destroy: jest.fn(), create: jest.fn(), findAll: jest.fn(async () => []), bulkCreate: jest.fn() },
  Middleware: { destroy: jest.fn(), create: jest.fn(), findAll: jest.fn(async () => []), bulkCreate: jest.fn() },
  // loadConfig merges custom certificates from the database
  Certificate: { findAll: jest.fn(async () => []) },
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) }
}));

jest.mock('fs', () => ({ promises: { writeFile: jest.fn(), mkdir: jest.fn() }, existsSync: jest.fn(), unlinkSync: jest.fn() }));

const { Proxy, Header } = require('../../src/models');
const { caddyService } = require('../../src/services/caddyService');

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

  // A skipped proxy must not keep pointing at a route that now belongs to another (0.18)
  test('rebuildConfigFromDatabase clears the route index of proxies it leaves out', async () => {
    axios.get.mockResolvedValue({ data: { apps: { http: { servers: { srv0: { routes: [] } } } } } });
    axios.post.mockResolvedValue({});
    const active = { domains: ['on.example.com'], upstream_url: 'http://a', status: 'active', caddy_route_index: 1, update: jest.fn() };
    const disabled = { domains: ['off.example.com'], upstream_url: 'http://b', status: 'disabled', caddy_route_index: 0, update: jest.fn() };
    Proxy.findAll.mockResolvedValue([disabled, active]);
    try {
      await caddyService.rebuildConfigFromDatabase();
      expect(active.update).toHaveBeenCalledWith({ caddy_route_index: 0 });
      expect(disabled.update).toHaveBeenCalledWith({ caddy_route_index: null });
    } finally {
      axios.get.mockReset();
      axios.post.mockReset();
    }
  });

  // The route then rolls back the DB row, so the posted route must go too (0.15)
  test('addProxy removes the route it posted when a later step fails', async () => {
    const config = { apps: { http: { servers: { srv0: { routes: [{}, {}] } } } } };
    axios.get.mockResolvedValue({ data: config });
    axios.post.mockResolvedValue({});
    axios.delete.mockResolvedValue({});
    try {
      const proxy = { domains: ['new.example.com'], upstream_url: 'http://u', update: jest.fn().mockRejectedValue(new Error('database is locked')) };
      await expect(caddyService.addProxy(proxy)).rejects.toThrow(/database is locked/);
      expect(axios.delete).toHaveBeenCalledWith(expect.stringMatching(/\/routes\/2$/));
    } finally {
      axios.get.mockReset();
      axios.post.mockReset();
      axios.delete.mockReset();
    }
  });

  test('addProxy does not delete anything when the route POST itself fails', async () => {
    axios.get.mockResolvedValue({ data: { apps: { http: { servers: { srv0: { routes: [] } } } } } });
    axios.post.mockRejectedValue(new Error('400 invalid handler'));
    try {
      const proxy = { domains: ['new.example.com'], upstream_url: 'http://u', update: jest.fn() };
      await expect(caddyService.addProxy(proxy)).rejects.toThrow(/invalid handler/);
      expect(axios.delete).not.toHaveBeenCalled();
    } finally {
      axios.get.mockReset();
      axios.post.mockReset();
    }
  });

  // Caddy already runs the change at that point; failing would roll back the DB (0.15)
  test('a failed config backup does not fail addProxy or updateProxy', async () => {
    const config = { apps: { http: { servers: { srv0: { routes: [{}] } } } } };
    axios.get.mockResolvedValue({ data: config });
    axios.post.mockResolvedValue({});
    Proxy.findAll.mockResolvedValue([]);
    fs.promises.writeFile.mockRejectedValue(new Error('EROFS: read-only file system'));

    try {
      const added = { domains: ['new.example.com'], upstream_url: 'http://u', update: jest.fn() };
      await expect(caddyService.addProxy(added)).resolves.toMatchObject({ success: true });

      const updated = { id: 'p', caddy_route_index: 0, domains: ['a.example.com'], upstream_url: 'http://u', update: jest.fn() };
      await expect(caddyService.updateProxy(updated)).resolves.toMatchObject({ success: true });
    } finally {
      fs.promises.writeFile.mockReset();
      axios.get.mockReset();
      axios.post.mockReset();
    }
  });

  // The route deletes the row and passes the proxy's plain data (MODERNIZATION.md 0.15)
  test('deleteProxy removes the route and shifts later indices for an already-deleted proxy', async () => {
    axios.delete.mockResolvedValue({});
    const later = { id: 'p2', caddy_route_index: 3, update: jest.fn() };
    Proxy.findAll.mockResolvedValue([later]);
    const proxyData = { id: 'p1', caddy_route_index: 2, ssl_type: 'acme' };
    const res = await caddyService.deleteProxy(proxyData);
    expect(res.success).toBe(true);
    expect(axios.delete).toHaveBeenCalledWith(expect.stringMatching(/\/routes\/2$/));
    expect(later.update).toHaveBeenCalledWith({ caddy_route_index: 2 });
  });

  test('deleteProxy recomputes the DNS-01 policy when a Cloudflare proxy is removed', async () => {
    axios.delete.mockResolvedValue({});
    axios.get.mockResolvedValue({ data: caddyService.setCloudflarePolicy({}, ['gone.example.com']) });
    axios.post.mockResolvedValue({});
    Proxy.findAll.mockResolvedValue([]);
    await caddyService.deleteProxy({ id: 'p1', caddy_route_index: 0, ssl_type: 'cloudflare' });
    const load = axios.post.mock.calls.find((c) => String(c[0]).includes('/load'));
    expect(load[1].apps.tls.automation.policies).toEqual([]);
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
    // Two path routes, then a catch-all 404: without it a path that matches no route
    // would get Caddy's empty 200
    expect(sub.routes.length).toBe(3);
    expect(sub.routes[0].match[0].path).toEqual(['/api']);
    expect(sub.routes[2]).toEqual({ handle: [{ handler: 'static_response', status_code: 404 }] });
  });

  test('createRouteFromProxy includes an http_basic authentication handler when enabled', () => {
    const proxy = {
      domains: ['auth.example.com'],
      upstream_url: 'http://u',
      basic_auth: { enabled: true, username: 'alice', hashed_password: 'hashed' }
    };

    const route = caddyService.createRouteFromProxy(proxy);
    const auth = route.handle.find(h => h.handler === 'authentication');
    expect(auth.providers.http_basic.accounts).toEqual([{ username: 'alice', password: 'hashed' }]);
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
    expect(rl.rate_limits.default.max_events).toBe(10);
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
    // Default is false (secure by default); set skip_tls_verify on proxy to override
    expect(rp.transport.tls.insecure_skip_verify).toBe(false);
  });

  test('createRouteFromProxy respects skip_tls_verify flag', () => {
    const proxy = {
      domains: ['secure.example.com'],
      upstream_url: 'https://secure-upstream:443',
      skip_tls_verify: true
    };

    const route = caddyService.createRouteFromProxy(proxy);
    const rp = route.handle.find(h => h.handler === 'reverse_proxy');
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

    // Handler order: rate_limit, subroute (ip_filtering), authentication, encode (compression), subroute (path_routing)
    const handlers = route.handle;
    expect(handlers[0].handler).toBe('rate_limit');
    expect(handlers[1].handler).toBe('subroute'); // IP filtering now uses subroute
    expect(handlers[2].handler).toBe('authentication');
    // compression is an encode handler wrapped in a subroute (it skips HEAD and S3-signed requests)
    const encodeWrapper = handlers.find(h => h.handler === 'subroute' && h.routes[0].handle[0].handler === 'encode');
    expect(encodeWrapper).toBeDefined();
    // subroute must exist for path routing (there will be 2 subroutes: one for IP filtering, one for path routing)
    const subroutes = handlers.filter(h => h.handler === 'subroute');
    expect(subroutes.length).toBeGreaterThanOrEqual(1);
    
    // Find the path routing subroute (it should have routes with path matchers)
    const pathRoutingSub = subroutes.find(s => s.routes && s.routes[0] && s.routes[0].match && s.routes[0].match[0].path);
    expect(pathRoutingSub).toBeDefined();
    expect(pathRoutingSub.routes[0].match[0].path).toEqual(['/a']);
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

    // Exact order expected: rate_limit, subroute (ip_filtering), authentication, encode, reverse_proxy
    expect(handlers[0].handler).toBe('rate_limit');
    expect(handlers[1].handler).toBe('subroute'); // IP filtering now uses subroute
    expect(handlers[2].handler).toBe('authentication');
    expect(handlers[3].handler).toBe('subroute');
    expect(handlers[3].routes[0].handle[0].handler).toBe('encode');
    const rp = handlers[4];
    expect(rp.handler).toBe('reverse_proxy');

    // Headers for request/response should reside inside reverse_proxy.headers
    expect(rp.headers).toBeDefined();
    expect(rp.headers.request.set['x-req']).toEqual(['r']);
    expect(rp.headers.response.set['x-res']).toEqual(['s']);
  });
});
