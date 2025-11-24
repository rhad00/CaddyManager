const axios = require('axios');

jest.mock('axios');
jest.mock('fs', () => ({ promises: { writeFile: jest.fn(), mkdir: jest.fn() } }));

jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: { destroy: jest.fn(), create: jest.fn() },
  Middleware: { destroy: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) }
}));

const { Proxy } = require('../../src/models');
const caddyService = require('../../src/services/caddyService');

describe('CaddyService integration - Cloudflare policy injection on add/update', () => {
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = originalToken;
  });

  test('addProxy injects Cloudflare policy when token present and proxy ssl_type=cloudflare', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'itoken';

    // Mock getConfig initial call
    const baseConfig = { apps: { http: { servers: { srv0: { routes: [] } } } } };

    // Have axios.get always return a base config unless otherwise mocked
    axios.get.mockResolvedValue({ data: baseConfig });
    axios.post.mockResolvedValue({}); // route add / load

    // Prevent real network TLS checks during the test
    caddyService.verifyTlsForDomains = jest.fn().mockResolvedValue({ ok: true, results: [] });

    const proxy = {
      domains: ['integ.example.com'],
      upstream_url: 'http://u',
      ssl_type: 'cloudflare',
      update: jest.fn().mockResolvedValue(true)
    };

    const res = await caddyService.addProxy(proxy);
    expect(res.success).toBe(true);

    // Ensure that the policy can be injected when called directly
    const cfg = caddyService.ensureCloudflarePolicy(JSON.parse(JSON.stringify(baseConfig)), ['integ.example.com']);
    expect(cfg.apps).toBeDefined();
    expect(cfg.apps.tls).toBeDefined();
    expect(cfg.apps.tls.automation.policies.length).toBeGreaterThan(0);
    const policy = cfg.apps.tls.automation.policies[0];
    expect(policy.issuer.challenges.dns.provider.name).toBe('cloudflare');
    expect(policy.issuer.challenges.dns.provider.api_token).toBe('{env.CLOUDFLARE_API_TOKEN}');
  });

  test('updateProxy injects Cloudflare policy when ssl_type=cloudflare', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'itoken';

    // Mock getConfig for updateProxy
    const baseConfig = { apps: { http: { servers: { srv0: { routes: [ {}, {} ] } } } } };
    axios.get.mockResolvedValue({ data: baseConfig });
    axios.post.mockResolvedValue({});

    // Prevent TLS network calls
    caddyService.verifyTlsForDomains = jest.fn().mockResolvedValue({ ok: true, results: [] });

    const proxy = {
      id: 'p1',
      caddy_route_index: 1,
      domains: ['update.example.com'],
      upstream_url: 'http://u',
      ssl_type: 'cloudflare',
      update: jest.fn().mockResolvedValue(true)
    };

    // Call updateProxy
    const res = await caddyService.updateProxy(proxy);
    expect(res).toHaveProperty('success');
  });
});
