/**
 * Proxy middlewares (MODERNIZATION.md 0.29). They were stored and shown but never reached
 * Caddy, and applying a template copied its headers only, so the shipped rate-limit and
 * redirect templates did nothing.
 */
jest.mock('../../src/models', () => ({
  Proxy: {}, Header: { destroy: jest.fn(), create: jest.fn() }, Certificate: {},
  Middleware: { destroy: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn('tx')) },
}));

const { Header, Middleware } = require('../../src/models');
const { validateMiddlewares, middlewareHandlers } = require('../../src/utils/proxyMiddlewares');
const { validateProxyInput } = require('../../src/utils/proxyValidation');
const caddyService = require('../../src/services/caddyService');

const rateLimit = (configuration, extra = {}) => ({ middleware_type: 'rate_limit', configuration, enabled: true, order: 0, ...extra });
const redirect = (configuration, extra = {}) => ({ middleware_type: 'redirect', configuration, enabled: true, order: 0, ...extra });

describe('validateMiddlewares', () => {
  test.each([
    ['a rate limit', [rateLimit({ rate: 100, unit: 'second' })]],
    ['a rate limit without a unit', [rateLimit({ rate: 5 })]],
    ['a redirect to a path', [redirect({ from: '/', to: '/app/kibana' })]],
    ['a redirect to a URL with a status code', [redirect({ from: '/old', to: 'https://example.com/new', code: 301 })]],
    ['nothing', undefined],
  ])('accepts %s', (_label, list) => {
    expect(validateMiddlewares(list)).toEqual({ valid: true });
  });

  test.each([
    ['an unknown type', [{ middleware_type: 'compression', configuration: {} }], /middleware_type/],
    ['ip_filter, which has its own setting', [{ middleware_type: 'ip_filter', configuration: {} }], /ip_filtering/],
    ['basic_auth, which has its own setting', [{ middleware_type: 'basic_auth', configuration: {} }], /basic_auth/],
    ['a rate of zero', [rateLimit({ rate: 0 })], /rate/],
    ['a huge rate', [rateLimit({ rate: 1000000 })], /rate/],
    ['a fractional rate', [rateLimit({ rate: 1.5 })], /rate/],
    ['an unknown unit', [rateLimit({ rate: 5, unit: 'fortnight' })], /unit/],
    ['a redirect source without a leading slash', [redirect({ from: 'old', to: '/new' })], /from/],
    ['a redirect target that is neither a path nor an http(s) URL', [redirect({ from: '/', to: 'javascript:alert(1)' })], /to/],
    ['a redirect target with a line break', [redirect({ from: '/', to: '/a\r\nSet-Cookie: x=1' })], /to/],
    ['a redirect with an odd status code', [redirect({ from: '/', to: '/x', code: 200 })], /code/],
    ['a list that is not an array', 'rate_limit', /array/],
    ['an entry without configuration', [{ middleware_type: 'redirect' }], /configuration/],
  ])('rejects %s', (_label, list, message) => {
    const result = validateMiddlewares(list);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(message);
  });

  test('is part of the proxy input validation', () => {
    const body = { name: 'app', domains: ['app.example.com'], upstream_url: 'http://app:80', middlewares: [rateLimit({ rate: 0 })] };
    expect(validateProxyInput(body).valid).toBe(false);
  });
});

describe('middlewareHandlers', () => {
  test('a rate limit becomes a rate_limit handler for its window', () => {
    expect(middlewareHandlers([rateLimit({ rate: 100, unit: 'minute' })])).toEqual([{
      handler: 'rate_limit',
      rate_limits: { middleware_0: { key: '{http.request.remote.host}', window: '1m', max_events: 100 } },
    }]);
  });

  test('a redirect answers only its path, with the status code and Location', () => {
    expect(middlewareHandlers([redirect({ from: '/', to: '/app/kibana' })])).toEqual([{
      handler: 'subroute',
      routes: [{
        match: [{ path: ['/'] }],
        handle: [{ handler: 'static_response', status_code: 302, headers: { Location: ['/app/kibana'] } }],
      }],
    }]);
    expect(middlewareHandlers([redirect({ from: '/a', to: '/b', code: 308 })])[0].routes[0].handle[0].status_code).toBe(308);
  });

  test('disabled middlewares are skipped and the rest keep their order', () => {
    const handlers = middlewareHandlers([
      redirect({ from: '/late', to: '/x' }, { order: 2 }),
      redirect({ from: '/off', to: '/x' }, { order: 1, enabled: false }),
      redirect({ from: '/early', to: '/x' }, { order: 0 }),
    ]);
    expect(handlers.map((h) => h.routes[0].match[0].path[0])).toEqual(['/early', '/late']);
  });

  test('a rate limit middleware yields to the proxy rate limit setting', () => {
    expect(middlewareHandlers([rateLimit({ rate: 5 })], { hasRateLimit: true })).toEqual([]);
  });

  test('two rate limits get their own zones', () => {
    const handlers = middlewareHandlers([rateLimit({ rate: 5 }, { order: 0 }), rateLimit({ rate: 9 }, { order: 1 })]);
    expect(handlers.map((h) => Object.keys(h.rate_limits)[0])).toEqual(['middleware_0', 'middleware_1']);
  });

  test('stored data that no longer validates is skipped, not sent to Caddy', () => {
    expect(middlewareHandlers([redirect({ from: '/', to: 'javascript:alert(1)' }), { middleware_type: 'compression', configuration: {} }])).toEqual([]);
  });

  test('knows nothing about undefined input', () => {
    expect(middlewareHandlers(undefined)).toEqual([]);
  });
});

describe('createRouteFromProxy', () => {
  const proxy = (extra = {}) => ({
    domains: ['app.example.com'], upstream_url: 'http://app:80', compression_enabled: false, ...extra,
  });
  const handlerNames = (route) => route.handle.map((h) => h.handler);

  test('applies the middlewares of the proxy, before the reverse proxy', () => {
    const route = caddyService.createRouteFromProxy(proxy({
      middlewares: [rateLimit({ rate: 100 }), redirect({ from: '/', to: '/app/kibana' })],
    }));

    expect(handlerNames(route)).toEqual(['rate_limit', 'subroute', 'reverse_proxy']);
  });

  test('puts a redirect after the access controls, so it cannot bypass them', () => {
    const route = caddyService.createRouteFromProxy(proxy({
      ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.0.0.0/8'] },
      middlewares: [redirect({ from: '/', to: '/x' })],
    }));

    const kinds = route.handle.map((h) => h.routes?.[0]?.handle?.[0]?.status_code);
    expect(kinds).toEqual([403, 302, undefined]); // IP filter, redirect, reverse proxy
  });

  test('does not stack a rate limit middleware on the rate limit setting', () => {
    const route = caddyService.createRouteFromProxy(proxy({
      rate_limit: { enabled: true, requests_per_second: 7 },
      middlewares: [rateLimit({ rate: 100 })],
    }));

    expect(handlerNames(route).filter((name) => name === 'rate_limit')).toHaveLength(1);
  });
});

describe('applyTemplate', () => {
  test('gives the proxy the template middlewares as well as its headers', async () => {
    const reload = jest.fn();
    const target = { id: 'p1', caddy_route_index: 0, reload };
    jest.spyOn(caddyService, 'getConfig').mockResolvedValue({});
    jest.spyOn(caddyService, 'ensureHttpServer').mockReturnValue({ routes: [{}] });
    const update = jest.spyOn(caddyService, 'updateProxy').mockResolvedValue({ updated: true });

    await caddyService.applyTemplate(target, {
      headers: [{ header_type: 'request', header_name: 'x-a', header_value: '1' }],
      middleware: [{ middleware_type: 'redirect', configuration: { from: '/', to: '/app' }, order: 3 }],
    });

    expect(Middleware.destroy).toHaveBeenCalledWith({ where: { proxy_id: 'p1' }, transaction: 'tx' });
    expect(Middleware.create).toHaveBeenCalledWith(
      { proxy_id: 'p1', middleware_type: 'redirect', configuration: { from: '/', to: '/app' }, order: 3, enabled: true },
      { transaction: 'tx' }
    );
    expect(Header.create).toHaveBeenCalledTimes(1);
    // the reload must bring the middlewares along or the Caddy update would drop them
    const include = reload.mock.calls[0][0].include;
    expect(include.map((i) => i.as).sort()).toEqual(['headers', 'middlewares']);
    expect(update).toHaveBeenCalledWith(target);
  });
});
