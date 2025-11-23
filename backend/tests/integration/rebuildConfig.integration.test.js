// Integration test: rebuildConfigFromDatabase persists caddy_route_index using an in-memory SQLite DB
jest.setTimeout(20000);

// Ensure we reset module cache so database config picks up test env vars
beforeAll(() => {
  jest.resetModules();
  process.env.DB_TYPE = 'sqlite';
  process.env.SQLITE_PATH = ':memory:';
  process.env.NODE_ENV = 'test';
});

jest.mock('axios');
const axios = require('axios');
// Ensure mocked axios has the expected function properties and default responses
axios.get = axios.get || jest.fn();
axios.post = axios.post || jest.fn();
axios.get.mockResolvedValue({ data: { apps: { http: { servers: { srv0: { routes: [] } } } } } });
axios.post.mockResolvedValue({});

describe('CaddyService integration with SQLite', () => {
  let sequelize;
  let User;
  let Proxy;
  let caddyService;

  beforeAll(async () => {
    // Require models after env vars set
    const models = require('../../src/models');
    sequelize = models.sequelize;
    User = models.User;
    Proxy = models.Proxy;

    // Sync DB schema
    await sequelize.sync({ force: true });

    // Create a user (required by Proxy.created_by FK)
    const user = await User.create({ email: 'int-test@example.com', password_hash: 'password', role: 'admin' });

    // Create two proxies
    await Proxy.create({ name: 'p1', domains: ['one.example.com'], upstream_url: 'http://one:8000', created_by: user.id });
    await Proxy.create({ name: 'p2', domains: ['two.example.com'], upstream_url: 'http://two:8000', created_by: user.id });

    // Now require the caddyService so it picks up the in-memory DB models
    caddyService = require('../../src/services/caddyService');
  });

  afterAll(async () => {
    try { await sequelize.close(); } catch (e) { /* ignore */ }
  });

  test('rebuildConfigFromDatabase updates proxies caddy_route_index in DB', async () => {
    // Mock getConfig to return a basic config with only caddyManager route preserved
    const baseConfig = { apps: { http: { servers: { srv0: { routes: [ { handle: [ { handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3000' }] } ] } ] } } } } };
    // Stub caddyService methods directly to avoid axios mock ordering issues
    jest.spyOn(caddyService, 'getConfig').mockResolvedValue(baseConfig);
    jest.spyOn(caddyService, 'loadConfig').mockResolvedValue({});
    jest.spyOn(caddyService, 'backupConfig').mockResolvedValue({});

    // Run rebuild
    await caddyService.rebuildConfigFromDatabase();

    // Query proxies from DB and ensure caddy_route_index is set
    const proxies = await Proxy.findAll();
    expect(proxies.length).toBeGreaterThanOrEqual(2);
    for (const p of proxies) {
      expect(p.caddy_route_index).not.toBeNull();
      expect(typeof p.caddy_route_index).toBe('number');
      expect(p.caddy_route_index).toBeGreaterThanOrEqual(0);
    }
  });
});
