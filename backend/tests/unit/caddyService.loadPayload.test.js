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

describe('CaddyService /load payload includes Cloudflare policy', () => {
  const originalToken = process.env.CF_API_TOKEN;

  afterEach(() => {
    process.env.CF_API_TOKEN = originalToken;
    jest.clearAllMocks();
  });

  test('rebuildConfigFromDatabase posts config with Cloudflare policy to /load', async () => {
    process.env.CF_API_TOKEN = 'itoken';

    const baseConfig = { apps: { http: { servers: { srv0: { routes: [ { handle: [ { handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3000' }] } ] } ] } } } } };

    // axios.get for getConfig should return baseConfig
    axios.get.mockResolvedValue({ data: baseConfig });
    // axios.post for load should capture the payload
    axios.post.mockResolvedValue({});

    // Create proxies in DB
    const p1 = { id: 'p1', domains: ['site.example.com'], upstream_url: 'http://u1', headers: [], update: jest.fn() };
    Proxy.findAll.mockResolvedValue([p1]);

    await caddyService.rebuildConfigFromDatabase();

    const loadCall = axios.post.mock.calls.find(call => String(call[0]).includes('/load'));
    expect(loadCall).toBeDefined();
    const payload = loadCall[1];

    // Policy should be present in payload
    expect(payload.apps).toBeDefined();
    expect(payload.apps.tls).toBeDefined();
    expect(payload.apps.tls.automation).toBeDefined();
    expect(Array.isArray(payload.apps.tls.automation.policies)).toBe(true);
    const policy = payload.apps.tls.automation.policies.find(p => Array.isArray(p.subjects) && p.subjects.includes('site.example.com'));
    expect(policy).toBeDefined();
    expect(policy.issuers).toBeDefined();
    expect(Array.isArray(policy.issuers)).toBe(true);
    const issuer = policy.issuers[0];
    expect(issuer.challenges.dns.provider.name).toBe('cloudflare');
    expect(issuer.challenges.dns.provider.api_token).toBe('{env.CF_API_TOKEN}');
  });
});
