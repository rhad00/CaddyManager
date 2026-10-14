const {
  createRouteFromProxy,
  buildSelectionPolicy,
  buildTlsTransport,
  shouldUseHTTPSTransport,
} = require('../../src/utils/caddyRoute');

const base = { domains: ['app.example.com'], upstream_url: 'http://app:8080' };
const handlersOf = (proxy) => createRouteFromProxy(proxy).handle;
const terminal = (handlers) => handlers[handlers.length - 1];

describe('createRouteFromProxy', () => {
  it('matches the domains and ends with a reverse proxy to the dial address', () => {
    const route = createRouteFromProxy(base);
    expect(route.match).toEqual([{ host: ['app.example.com'] }]);
    expect(terminal(route.handle)).toEqual({
      handler: 'reverse_proxy',
      upstreams: [{ dial: 'app:8080' }],
    });
  });

  it('wraps a single domain string in a list', () => {
    expect(createRouteFromProxy({ ...base, domains: 'one.example.com' }).match)
      .toEqual([{ host: ['one.example.com'] }]);
  });

  it('puts the handlers in order: rate limit, IP filter, auth, redirects, compression, proxy', () => {
    const handlers = handlersOf({
      ...base,
      compression_enabled: true,
      rate_limit: { enabled: true, requests_per_second: 5 },
      ip_filtering: { enabled: true, mode: 'deny', ip_list: ['10.0.0.1'] },
      basic_auth: { enabled: true, username: 'u', hashed_password: '$2b$12$x' },
      middlewares: [{ middleware_type: 'redirect', configuration: { from: '/a', to: '/b' }, enabled: true }],
    });
    expect(handlers.map((h) => h.handler)).toEqual([
      'rate_limit', 'subroute', 'authentication', 'subroute', 'encode', 'reverse_proxy',
    ]);
  });

  describe('IP filtering', () => {
    const filterOf = (ipFiltering) => handlersOf({ ...base, ip_filtering: ipFiltering })[0];

    it('deny mode matches the listed ranges and answers 403', () => {
      const filter = filterOf({ enabled: true, mode: 'deny', ip_list: ['1.2.3.4', '10.0.0.0/8'] });
      expect(filter.routes[0].match).toEqual([{ remote_ip: { ranges: ['1.2.3.4', '10.0.0.0/8'] } }]);
      expect(filter.routes[0].handle[0]).toMatchObject({ handler: 'static_response', status_code: 403 });
    });

    it('allow mode blocks everything outside the list', () => {
      const filter = filterOf({ enabled: true, mode: 'allow', ip_list: ['1.2.3.4'] });
      expect(filter.routes[0].match).toEqual([{ not: [{ remote_ip: { ranges: ['1.2.3.4'] } }] }]);
    });

    it('applies at most 10 entries', () => {
      const ipList = Array.from({ length: 12 }, (_, i) => `10.0.0.${i + 1}`);
      const filter = filterOf({ enabled: true, mode: 'deny', ip_list: ipList });
      expect(filter.routes[0].match[0].remote_ip.ranges).toEqual(ipList.slice(0, 10));
    });

    it.each([
      [{ enabled: false, ip_list: ['1.2.3.4'] }],
      [{ enabled: true, ip_list: [] }],
      [null],
    ])('adds nothing for %j', (ipFiltering) => {
      expect(handlersOf({ ...base, ip_filtering: ipFiltering })).toHaveLength(1);
    });
  });

  describe('path routing', () => {
    it('proxies each path and answers 404 for everything else', () => {
      const handler = terminal(handlersOf({
        ...base,
        path_routing: {
          enabled: true,
          routes: [
            { path: '/api', upstream_url: 'http://api:3000' },
            { path: '/secure', upstream_url: 'https://secure:8443' },
          ],
        },
      }));
      expect(handler.handler).toBe('subroute');
      expect(handler.routes[0]).toEqual({
        match: [{ path: ['/api'] }],
        handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'api:3000' }] }],
      });
      expect(handler.routes[1].handle[0].transport).toEqual(buildTlsTransport({}));
      expect(handler.routes[2]).toEqual({ handle: [{ handler: 'static_response', status_code: 404 }] });
    });

    it('is ignored when disabled or empty', () => {
      expect(terminal(handlersOf({ ...base, path_routing: { enabled: false, routes: [{ path: '/a', upstream_url: 'x:1' }] } })).handler)
        .toBe('reverse_proxy');
      expect(terminal(handlersOf({ ...base, path_routing: { enabled: true, routes: [] } })).handler)
        .toBe('reverse_proxy');
    });
  });

  describe('reverse proxy options', () => {
    it('load balances over the pool and ignores the single upstream', () => {
      const handler = terminal(handlersOf({
        ...base,
        load_balancing: {
          enabled: true,
          policy: 'least_conn',
          upstreams: [{ url: 'http://a:1' }, { url: 'http://b:2' }],
        },
      }));
      expect(handler.upstreams).toEqual([{ dial: 'a:1' }, { dial: 'b:2' }]);
      expect(handler.load_balancing).toEqual({ selection_policy: { policy: 'least_conn' } });
    });

    it('maps health checks to the uri/fails fields Caddy accepts', () => {
      const handler = terminal(handlersOf({
        ...base,
        health_checks: { enabled: true, path: '/up', max_fails: 2 },
      }));
      expect(handler.health_checks).toEqual({
        active: { uri: '/up', interval: '30s', timeout: '5s', fails: 2 },
      });
    });

    it('sets enabled request and response headers only', () => {
      const handler = terminal(handlersOf({
        ...base,
        headers: [
          { enabled: true, header_type: 'request', header_name: 'X-A', header_value: '1' },
          { enabled: true, header_type: 'response', header_name: 'X-B', header_value: '2' },
          { enabled: false, header_type: 'response', header_name: 'X-C', header_value: '3' },
        ],
      }));
      expect(handler.headers).toEqual({
        request: { set: { 'X-A': ['1'] } },
        response: { set: { 'X-B': ['2'] } },
      });
    });

    it('leaves headers out when none is enabled', () => {
      const handler = terminal(handlersOf({
        ...base,
        headers: [{ enabled: false, header_type: 'request', header_name: 'X-A', header_value: '1' }],
      }));
      expect(handler).not.toHaveProperty('headers');
    });

    it('speaks TLS to https upstreams, honouring skip_tls_verify', () => {
      const secure = terminal(handlersOf({ ...base, upstream_url: 'https://app', skip_tls_verify: true }));
      expect(secure.transport).toEqual({ protocol: 'http', tls: { insecure_skip_verify: true } });
      expect(terminal(handlersOf(base))).not.toHaveProperty('transport');
    });

    it('uses TLS for a pool when any member uses it', () => {
      const handler = terminal(handlersOf({
        ...base,
        load_balancing: { enabled: true, upstreams: [{ url: 'http://a:1' }, { url: 'https://b' }] },
      }));
      expect(handler.transport.tls.insecure_skip_verify).toBe(false);
    });
  });
});

describe('buildSelectionPolicy', () => {
  it('keeps plain round robin and other policies as they are', () => {
    expect(buildSelectionPolicy({ upstreams: [{ url: 'a' }] })).toEqual({ policy: 'round_robin' });
    expect(buildSelectionPolicy({ policy: 'ip_hash', upstreams: [] })).toEqual({ policy: 'ip_hash' });
  });

  it('turns weights into weighted_round_robin, defaulting bad weights to 1', () => {
    expect(buildSelectionPolicy({
      policy: 'round_robin',
      upstreams: [{ url: 'a', weight: 3 }, { url: 'b', weight: 'x' }, { url: 'c' }],
    })).toEqual({ policy: 'weighted_round_robin', weights: [3, 1, 1] });
  });

  it('accepts "weighted" as an alias even without weights', () => {
    expect(buildSelectionPolicy({ policy: 'weighted', upstreams: [{ url: 'a' }] }))
      .toEqual({ policy: 'weighted_round_robin', weights: [1] });
  });
});

describe('shouldUseHTTPSTransport', () => {
  it.each([
    ['https://app', true],
    ['app:443', true],
    ['http://app:8080', false],
  ])('%s -> %s', (url, expected) => {
    expect(shouldUseHTTPSTransport(url)).toBe(expected);
  });
});
