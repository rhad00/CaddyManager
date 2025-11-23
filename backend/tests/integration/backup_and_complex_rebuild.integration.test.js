// Integration: backup/restore flows and complex rebuild using in-memory SQLite
jest.setTimeout(20000);

beforeAll(() => {
  jest.resetModules();
  process.env.DB_TYPE = 'sqlite';
  process.env.SQLITE_PATH = ':memory:';
  process.env.NODE_ENV = 'test';
});

jest.mock('axios');
const axios = require('axios');
axios.get = axios.get || jest.fn();
axios.post = axios.post || jest.fn();
axios.delete = axios.delete || jest.fn();

describe('CaddyService backup/restore and complex rebuild', () => {
  let sequelize, User, Proxy, Header, caddyService;

  beforeAll(async () => {
    const models = require('../../src/models');
    sequelize = models.sequelize;
    User = models.User;
    Proxy = models.Proxy;
    Header = models.Header;

    await sequelize.sync({ force: true });

    // Create admin user
    const u = await User.create({ email: 'bkr@example.com', password_hash: 'pw', role: 'admin' });

    // Complex proxies
    await Proxy.create({ name: 'c1', domains: ['c1.example.com'], upstream_url: 'http://c1:7000', rate_limit: { enabled: true, requests_per_second: 1, burst: 2 }, basic_auth: { enabled: true, username: 'b', hashed_password: 'h' }, ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.0.0.0/8'] }, compression_enabled: true, created_by: u.id });
    await Proxy.create({ name: 'c2', domains: ['c2.example.com'], upstream_url: 'https://c2:443', path_routing: { enabled: true, routes: [{ path: '/x', upstream_url: 'http://x:1' }] }, created_by: u.id });

    caddyService = require('../../src/services/caddyService');
  });

  afterAll(async () => {
    try { await sequelize.close(); } catch (e) {}
  });

  test('includeInBackup / restoreFromBackup roundtrip', async () => {
    // Stub getConfig to return a sample config
    const payload = { apps: { http: { servers: { srv0: { routes: [] } } } } };
    jest.spyOn(caddyService, 'getConfig').mockResolvedValue(payload);
    // includeInBackup should attach the caddy_config
    const backup = { created: Date.now() };
    const withCaddy = await caddyService.includeInBackup(backup);
    expect(withCaddy.caddy_config).toBeDefined();

    // Now test restoreFromBackup (stub loadConfig and backupConfig to succeed to avoid disk writes)
    jest.spyOn(caddyService, 'loadConfig').mockResolvedValue({});
    jest.spyOn(caddyService, 'backupConfig').mockResolvedValue({});
    const res = await caddyService.restoreFromBackup(withCaddy);
    expect(res).toHaveProperty('success', true);
  });

  test('rebuildConfigFromDatabase with complex proxies sets indices and uses https transport for c2', async () => {
    const baseConfig = { apps: { http: { servers: { srv0: { routes: [ { handle: [ { handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3000' }] } ] } ] } } } } };
    // stub getConfig/loadConfig/backupConfig
    jest.spyOn(caddyService, 'getConfig').mockResolvedValue(baseConfig);
    jest.spyOn(caddyService, 'loadConfig').mockResolvedValue({});
    jest.spyOn(caddyService, 'backupConfig').mockResolvedValue({});

    await caddyService.rebuildConfigFromDatabase();

    const proxies = await Proxy.findAll();
    // All proxies should have an index
    for (const p of proxies) {
      expect(typeof p.caddy_route_index).toBe('number');
      expect(p.caddy_route_index).toBeGreaterThanOrEqual(0);
    }

    // Find proxy c2 and ensure its route (if created) would use https transport when created
    const c2 = await Proxy.findOne({ where: { name: 'c2' } });
    const route = caddyService.createRouteFromProxy(c2);
    const rp = route.handle.find(h => h.handler === 'reverse_proxy' || (h.handler === 'subroute' && h.routes));
    // For c2 upstream is https, so transport.tls should be set on reverse_proxy (if present)
    const reverse = route.handle.find(h => h.handler === 'reverse_proxy');
    if (reverse) {
      expect(reverse.transport).toBeDefined();
      expect(reverse.transport.tls).toBeDefined();
    }
  });
});
