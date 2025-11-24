const caddyService = require('../../src/services/caddyService');

describe('CaddyService Cloudflare policy injection', () => {
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;

  afterEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = originalToken;
  });

  test('ensureCloudflarePolicy adds policy when token present', () => {
    process.env.CLOUDFLARE_API_TOKEN = 'dummy-token-for-test';

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
    expect(p.issuer).toBeDefined();
    expect(p.issuer.module).toBe('acme');
    expect(p.issuer.challenges).toBeDefined();
    expect(p.issuer.challenges.dns).toBeDefined();
    expect(p.issuer.challenges.dns.provider).toBeDefined();
    expect(p.issuer.challenges.dns.provider.name).toBe('cloudflare');
    expect(p.issuer.challenges.dns.provider.api_token).toBe('{env.CLOUDFLARE_API_TOKEN}');
  });

  test('ensureCloudflarePolicy is a no-op when token missing', () => {
    delete process.env.CLOUDFLARE_API_TOKEN;

    const service = caddyService;
    const config = {};
    const newConfig = service.ensureCloudflarePolicy(config, ['example.com']);
    expect(newConfig.apps).toBeUndefined();
  });
});
