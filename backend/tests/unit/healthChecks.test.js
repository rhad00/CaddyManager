const { caddyService } = require('../../src/services/caddyService');

const reverseProxyOf = (route) => route.handle.find((h) => h.handler === 'reverse_proxy');

describe('active health checks in generated routes', () => {
  test('maps the stored config to Caddy active health check fields', () => {
    const route = caddyService.createRouteFromProxy({
      domains: ['hc.example.com'],
      upstream_url: 'http://app:8080',
      health_checks: { enabled: true, path: '/healthz', interval: '10s', timeout: '2s', max_fails: 4 },
    });

    expect(reverseProxyOf(route).health_checks).toEqual({
      active: { uri: '/healthz', interval: '10s', timeout: '2s', fails: 4 },
    });
  });

  test('applies defaults and never emits the passive-only max_fails field', () => {
    const route = caddyService.createRouteFromProxy({
      domains: ['hc.example.com'],
      upstream_url: 'http://app:8080',
      health_checks: { enabled: true },
    });

    const active = reverseProxyOf(route).health_checks.active;
    expect(active).toEqual({ uri: '/health', interval: '30s', timeout: '5s', fails: 3 });
    expect(active).not.toHaveProperty('max_fails');
    expect(active).not.toHaveProperty('path');
  });

  test('omits health checks when disabled', () => {
    const route = caddyService.createRouteFromProxy({
      domains: ['hc.example.com'],
      upstream_url: 'http://app:8080',
      health_checks: { enabled: false, path: '/x' },
    });
    expect(reverseProxyOf(route).health_checks).toBeUndefined();
  });
});
