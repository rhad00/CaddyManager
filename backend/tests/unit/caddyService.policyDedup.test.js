const caddyService = require('../../src/services/caddyService');

describe('CaddyService Cloudflare policy deduplication', () => {
  const originalToken = process.env.CF_API_TOKEN;

  afterEach(() => {
    process.env.CF_API_TOKEN = originalToken;
  });

  test('does not duplicate policy for identical domain sets', () => {
    process.env.CF_API_TOKEN = 'dup-token';
    const baseConfig = { apps: { tls: { automation: { policies: [] } } } };

    const cfg1 = caddyService.ensureCloudflarePolicy(baseConfig, ['a.example.com', 'b.example.com']);
    expect(cfg1.apps.tls.automation.policies.length).toBe(1);

    // Call again with same domains in different order
    const cfg2 = caddyService.ensureCloudflarePolicy(cfg1, ['b.example.com', 'a.example.com']);
    expect(cfg2.apps.tls.automation.policies.length).toBe(1);
  });

  test('adds new policy for different domain sets', () => {
    process.env.CF_API_TOKEN = 'dup-token';
    const baseConfig = { apps: { tls: { automation: { policies: [] } } } };

    const cfg1 = caddyService.ensureCloudflarePolicy(baseConfig, ['a.example.com']);
    expect(cfg1.apps.tls.automation.policies.length).toBe(1);

    const cfg2 = caddyService.ensureCloudflarePolicy(cfg1, ['b.example.com']);
    expect(cfg2.apps.tls.automation.policies.length).toBe(2);
  });
});
