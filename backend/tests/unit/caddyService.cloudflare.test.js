const caddyService = require('../../src/services/caddyService');

describe('CaddyService Cloudflare policy injection', () => {
  const originalToken = process.env.CF_API_TOKEN;

  afterEach(() => {
    process.env.CF_API_TOKEN = originalToken;
  });

  test('ensureCloudflarePolicy adds policy when token present', () => {
    process.env.CF_API_TOKEN = 'dummy-token-for-test';

    const service = caddyService; // singleton instance
    const config = {};
    const domains = ['example.com', 'www.example.com'];

    const newConfig = service.ensureCloudflarePolicy(config, domains);

    expect(newConfig.apps).toBeDefined();
    expect(newConfig.apps.tls).toBeDefined();
    expect(newConfig.apps.tls.automation).toBeDefined();
    expect(Array.isArray(newConfig.apps.tls.automation.policies)).toBe(true);

    const policies = newConfig.apps.tls.automation.policies;
    expect(policies.length).toBeGreaterThan(0);

    const p = policies.find(pol => Array.isArray(pol.subjects) && pol.subjects.includes('example.com'));
    expect(p).toBeDefined();
    expect(p.issuers).toBeDefined();
    expect(Array.isArray(p.issuers)).toBe(true);
    expect(p.issuers.length).toBeGreaterThan(0);
    const issuer = p.issuers[0];
    expect(issuer.module).toBe('acme');
    expect(issuer.challenges).toBeDefined();
    expect(issuer.challenges.dns).toBeDefined();
    expect(issuer.challenges.dns.provider).toBeDefined();
    expect(issuer.challenges.dns.provider.name).toBe('cloudflare');
    expect(issuer.challenges.dns.provider.api_token).toBe('{env.CF_API_TOKEN}');
  });

  test('ensureCloudflarePolicy is a no-op when token missing', () => {
    delete process.env.CF_API_TOKEN;

    const service = caddyService;
    const config = {};
    const newConfig = service.ensureCloudflarePolicy(config, ['example.com']);
    expect(newConfig.apps).toBeUndefined();
  });
});
