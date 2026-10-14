jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: {},
  Middleware: {},
  Certificate: { findAll: jest.fn(async () => []) },
  sequelize: {},
}));

const { Proxy } = require('../../src/models');
const { caddyService } = require('../../src/services/caddyService');

const isCloudflarePolicy = (p) => p.issuers?.some((i) => i.challenges?.dns?.provider?.name === 'cloudflare');
const cfPolicies = (config) => (config.apps?.tls?.automation?.policies || []).filter(isCloudflarePolicy);

describe('setCloudflarePolicy', () => {
  test('creates one DNS-01 policy covering exactly the given domains', () => {
    const config = caddyService.setCloudflarePolicy({}, ['b.example.com', 'a.example.com', 'a.example.com']);
    const [policy] = cfPolicies(config);
    expect(cfPolicies(config)).toHaveLength(1);
    expect(policy.subjects).toEqual(['a.example.com', 'b.example.com']);
    expect(policy.issuers[0]).toEqual({
      module: 'acme',
      challenges: { dns: { provider: { name: 'cloudflare', api_token: '{env.CF_API_TOKEN}' } } },
    });
  });

  test('replaces subjects instead of merging, so removed domains drop out', () => {
    const before = caddyService.setCloudflarePolicy({}, ['a.example.com', 'b.example.com']);
    const after = caddyService.setCloudflarePolicy(before, ['b.example.com']);
    expect(cfPolicies(after)[0].subjects).toEqual(['b.example.com']);
  });

  test('removes the policy when no Cloudflare domains remain and keeps other policies', () => {
    const other = { subjects: ['internal.example.com'], issuers: [{ module: 'internal' }] };
    const config = caddyService.setCloudflarePolicy(
      { apps: { tls: { automation: { policies: [other] } } } },
      ['a.example.com']
    );
    const cleared = caddyService.setCloudflarePolicy(config, []);
    expect(cfPolicies(cleared)).toHaveLength(0);
    expect(cleared.apps.tls.automation.policies).toEqual([other]);
  });

  test('does not depend on CF_API_TOKEN being set in the backend (Caddy holds the token)', () => {
    const saved = process.env.CF_API_TOKEN;
    delete process.env.CF_API_TOKEN;
    expect(cfPolicies(caddyService.setCloudflarePolicy({}, ['a.example.com']))).toHaveLength(1);
    process.env.CF_API_TOKEN = saved;
  });
});

describe('cloudflareDomains', () => {
  test('returns only domains of active Cloudflare proxies', async () => {
    Proxy.findAll.mockResolvedValue([{ domains: ['cf.example.com'] }, { domains: 'cf2.example.com' }]);
    await expect(caddyService.cloudflareDomains()).resolves.toEqual(['cf.example.com', 'cf2.example.com']);
    expect(Proxy.findAll).toHaveBeenCalledWith({ where: { ssl_type: 'cloudflare', status: 'active' } });
  });
});
