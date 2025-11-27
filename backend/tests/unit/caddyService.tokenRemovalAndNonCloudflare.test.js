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

describe('CaddyService token removal and non-cloudflare behavior', () => {
  const originalToken = process.env.CF_API_TOKEN;

  afterEach(() => {
    process.env.CF_API_TOKEN = originalToken;
    jest.clearAllMocks();
  });

  test('existing policies remain when token removed (no-op)', () => {
    // Start with a config that already contains a policy
    process.env.CF_API_TOKEN = 'temp';
    const baseConfig = { apps: { tls: { automation: { policies: [] } } } };
    const cfgWithPolicy = caddyService.ensureCloudflarePolicy(baseConfig, ['keep.example.com']);
    expect(cfgWithPolicy.apps.tls.automation.policies.length).toBe(1);

    // Remove token and call ensureCloudflarePolicy again with new domains
    delete process.env.CF_API_TOKEN;
    const cfgAfter = caddyService.ensureCloudflarePolicy(cfgWithPolicy, ['new.example.com']);

    // Since token is missing, ensureCloudflarePolicy should be a no-op and not add new policy
    expect(cfgAfter.apps.tls.automation.policies.length).toBe(1);
  });

  test('addProxy/updateProxy do not inject policy for non-cloudflare ssl_type', async () => {
    delete process.env.CF_API_TOKEN; // token absent

    const baseConfig = { apps: { http: { servers: { srv0: { routes: [] } } } } };
    axios.get.mockResolvedValue({ data: baseConfig });
    axios.post.mockResolvedValue({});

    // Mock verifyTlsForDomains to avoid network
    caddyService.verifyTlsForDomains = jest.fn().mockResolvedValue({ ok: true, results: [] });

    const proxy = { domains: ['nope.example.com'], upstream_url: 'http://u', ssl_type: 'none', update: jest.fn().mockResolvedValue(true) };
    const res = await caddyService.addProxy(proxy);
    expect(res.success).toBe(true);

    // Ensure no /load payload contains tls.automation.policies
    const loadCall = axios.post.mock.calls.find(c => String(c[0]).includes('/load'));
    if (loadCall) {
      const payload = loadCall[1];
      // If payload has tls automation, it should have no policies
      if (payload.apps && payload.apps.tls && payload.apps.tls.automation) {
        expect(Array.isArray(payload.apps.tls.automation.policies)).toBe(true);
        expect(payload.apps.tls.automation.policies.length).toBe(0);
      }
    }

    // Test updateProxy doesn't inject when ssl_type isn't cloudflare/acme
    axios.post.mockClear();
    axios.get.mockResolvedValue({ data: { apps: { http: { servers: { srv0: { routes: [ {}, {} ] } } } } } });
    const up = { id: 'p', caddy_route_index: 1, domains: ['nope.example.com'], upstream_url: 'http://u', ssl_type: 'custom', update: jest.fn().mockResolvedValue(true) };
    const ures = await caddyService.updateProxy(up);
    expect(ures).toHaveProperty('success');

    const loadCall2 = axios.post.mock.calls.find(c => String(c[0]).includes('/load'));
    if (loadCall2) {
      const payload2 = loadCall2[1];
      if (payload2.apps && payload2.apps.tls && payload2.apps.tls.automation) {
        expect(Array.isArray(payload2.apps.tls.automation.policies)).toBe(true);
        expect(payload2.apps.tls.automation.policies.length).toBe(0);
      }
    }
  });
});
