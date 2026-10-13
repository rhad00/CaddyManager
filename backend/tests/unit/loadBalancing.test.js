const caddyService = require('../../src/services/caddyService');

const reverseProxyOf = (route) => route.handle.find((h) => h.handler === 'reverse_proxy');
const routeFor = (load_balancing) => caddyService.createRouteFromProxy({
  domains: ['lb.example.com'],
  upstream_url: 'http://app:8080',
  load_balancing: { enabled: true, ...load_balancing },
});

describe('load balancing in generated routes', () => {
  test('weights select weighted_round_robin with weights in upstream order', () => {
    const rp = reverseProxyOf(routeFor({
      policy: 'round_robin',
      upstreams: [{ url: 'http://a:80', weight: 3 }, { url: 'http://b:80', weight: 1 }],
    }));
    expect(rp.load_balancing.selection_policy).toEqual({ policy: 'weighted_round_robin', weights: [3, 1] });
    expect(rp.upstreams).toEqual([{ dial: 'a:80' }, { dial: 'b:80' }]);
  });

  test('"weighted" (documented name) maps to weighted_round_robin; missing weights default to 1', () => {
    const rp = reverseProxyOf(routeFor({
      policy: 'weighted',
      upstreams: [{ url: 'http://a:80', weight: '5' }, { url: 'http://b:80' }],
    }));
    expect(rp.load_balancing.selection_policy).toEqual({ policy: 'weighted_round_robin', weights: [5, 1] });
  });

  test('never maps weight to max_requests (a concurrency cap, not a weight)', () => {
    const rp = reverseProxyOf(routeFor({
      policy: 'least_conn',
      upstreams: [{ url: 'http://a:80', weight: 3 }, { url: 'http://b:80', weight: 1 }],
    }));
    expect(rp.upstreams.every((u) => u.max_requests === undefined)).toBe(true);
    // Explicit non-round-robin policies keep their own semantics; weights are ignored
    expect(rp.load_balancing.selection_policy).toEqual({ policy: 'least_conn' });
  });

  test('plain round robin without weights is unchanged', () => {
    const rp = reverseProxyOf(routeFor({ upstreams: [{ url: 'http://a:80' }, { url: 'http://b:80' }] }));
    expect(rp.load_balancing.selection_policy).toEqual({ policy: 'round_robin' });
  });
});
