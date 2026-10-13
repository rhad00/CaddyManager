/**
 * Contract tests: every config CaddyService generates must be accepted by a real Caddy.
 *
 * Unit tests mock axios, so they cannot tell whether Caddy actually accepts the JSON
 * we push to /load. A single invalid handler makes Caddy reject the whole config,
 * which silently breaks every proxy. These tests close that gap.
 *
 * Run locally:  CADDY_IMAGE=caddymanager-caddy npm run test:contract
 */
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
// caddy validate provisions the log writer; point it at a writable path
process.env.CADDY_ACCESS_LOG = path.join(os.tmpdir(), 'caddymanager-contract-access.log');

const caddyService = require('../../src/services/caddyService');
const { createValidator } = require('./caddyValidator');

const validator = createValidator();

if (!validator.available && process.env.CADDY_CONTRACT_REQUIRED === 'true') {
  throw new Error(`Caddy contract tests are required but ${validator.describeLabel}`);
}

// e.g. CADDY_REQUIRED_MODULES=http.handlers.rate_limit,dns.providers.cloudflare
const requiredModules = (process.env.CADDY_REQUIRED_MODULES || '').split(',').map((m) => m.trim()).filter(Boolean);
if (validator.available && !validator.hasModules(requiredModules)) {
  throw new Error(`Caddy (${validator.describeLabel}) is missing required modules: ${requiredModules.join(', ')}`);
}

// Caddy's http_basic provider verifies bcrypt hashes by default
const BCRYPT_SECRET = require('bcrypt').hashSync('secret', 10);

const baseProxy = (overrides = {}) => ({
  name: 'contract-proxy',
  domains: ['app.example.com'],
  upstream_url: 'app:8080',
  ssl_type: 'acme',
  status: 'active',
  headers: [],
  ...overrides,
});

/**
 * Build a full config the same way rebuildConfigFromDatabase does, minus the HTTP calls.
 */
function buildConfig(proxies, { cloudflare = false } = {}) {
  const config = {};
  const server = caddyService.ensureHttpServer(config);
  server.routes = proxies.map((p) => caddyService.createRouteFromProxy(p));
  caddyService.ensureAccessLogging(config);
  if (cloudflare) {
    const domains = proxies.flatMap((p) => p.domains);
    caddyService.ensureCloudflarePolicy(config, domains, true);
  }
  return config;
}

/** Collect every reverse_proxy upstream dial address in a config, including subroutes. */
function collectDials(handlers = []) {
  return handlers.flatMap((h) => [
    ...(h.handler === 'reverse_proxy' ? (h.upstreams || []).map((u) => u.dial) : []),
    ...(h.routes || []).flatMap((r) => collectDials(r.handle)),
  ]);
}

// host:port, [ipv6]:port, or a Caddy placeholder. No scheme, no path.
const DIAL_PATTERN = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+|\{[^}]+\}):\d+$/;

function expectValid(config) {
  // `caddy validate` does not parse dial addresses (they may contain placeholders and are
  // resolved per request), so a URL such as "http://app:8080" passes validation but every
  // request then fails with "too many colons in address". Check them structurally.
  const routes = Object.values(config.apps.http.servers).flatMap((s) => s.routes);
  const badDials = routes.flatMap((r) => collectDials(r.handle)).filter((d) => !DIAL_PATTERN.test(d));
  if (badDials.length > 0) {
    throw new Error(`Invalid upstream dial address(es): ${badDials.join(', ')}`);
  }

  const result = validator.validate(config);
  if (!result.valid) {
    throw new Error(`Caddy rejected config:\n${result.output}\n${JSON.stringify(config, null, 2)}`);
  }
}

const describeIfCaddy = validator.available ? describe : describe.skip;

describeIfCaddy(`Caddy config contract (${validator.describeLabel})`, () => {
  afterAll(() => validator.cleanup && validator.cleanup());

  test('minimal ACME proxy', () => {
    expectValid(buildConfig([baseProxy()]));
  });

  // Regression for MODERNIZATION.md 0.6: URL-form upstreams used to be copied verbatim into dial
  test('upstream given as an http:// URL, as the API requires', () => {
    expectValid(buildConfig([baseProxy({ upstream_url: 'http://app:8080' })]));
  });

  test('URL-form upstreams in load balancing and path routing, including https', () => {
    expectValid(buildConfig([
      baseProxy({
        domains: ['lb.example.com'],
        load_balancing: { enabled: true, policy: 'round_robin', upstreams: [{ url: 'https://app1' }, { url: 'https://app2:8443' }] },
      }),
      baseProxy({
        domains: ['paths.example.com'],
        path_routing: { enabled: true, routes: [{ path: '/api/*', upstream_url: 'https://api' }, { path: '/*', upstream_url: 'http://web:3000' }] },
      }),
    ]));
  });

  test('multiple domains, compression and request/response headers', () => {
    expectValid(buildConfig([baseProxy({
      domains: ['a.example.com', 'b.example.com'],
      compression_enabled: true,
      headers: [
        { header_type: 'request', header_name: 'X-Forwarded-Proto', header_value: '{http.request.scheme}', enabled: true },
        { header_type: 'response', header_name: 'Strict-Transport-Security', header_value: 'max-age=31536000', enabled: true },
      ],
    })]));
  });

  test('HTTPS upstream with TLS verification disabled', () => {
    expectValid(buildConfig([baseProxy({ upstream_url: 'secure-app:443', skip_tls_verify: true })]));
  });

  test.each(['allow', 'deny'])('IP filtering in %s mode', (mode) => {
    expectValid(buildConfig([baseProxy({
      ip_filtering: { enabled: true, mode, ip_list: ['10.0.0.0/8', '192.168.1.10'] },
    })]));
  });

  test('path-based routing', () => {
    expectValid(buildConfig([baseProxy({
      path_routing: {
        enabled: true,
        routes: [{ path: '/api/*', upstream_url: 'api:3000' }, { path: '/static/*', upstream_url: 'cdn:80' }],
      },
    })]));
  });

  test.each(['round_robin', 'least_conn', 'ip_hash', 'random', 'first'])(
    'load balancing with %s policy',
    (policy) => {
      expectValid(buildConfig([baseProxy({
        load_balancing: { enabled: true, policy, upstreams: [{ url: 'app1:8080' }, { url: 'app2:8080' }] },
      })]));
    }
  );

  // Known broken (see MODERNIZATION.md 0.9): "weighted" is not a Caddy selection policy
  test.failing('load balancing with weighted policy', () => {
    expectValid(buildConfig([baseProxy({
      load_balancing: {
        enabled: true,
        policy: 'weighted',
        upstreams: [{ url: 'app1:8080', weight: 3 }, { url: 'app2:8080', weight: 1 }],
      },
    })]));
  });

  // Known broken (see MODERNIZATION.md 0.8): "max_fails" is not an active health check field
  test.failing('active health checks', () => {
    expectValid(buildConfig([baseProxy({
      health_checks: { enabled: true, path: '/healthz', interval: '10s', timeout: '2s', max_fails: 3 },
    })]));
  });

  // Known broken (see MODERNIZATION.md 0.7): "basic_auth" is a Caddyfile directive, not a JSON handler
  test.failing('basic authentication', () => {
    expectValid(buildConfig([baseProxy({
      basic_auth: { enabled: true, username: 'admin', hashed_password: BCRYPT_SECRET },
    })]));
  });

  const rateLimitTest = validator.hasModules(['http.handlers.rate_limit']) ? test : test.skip;
  rateLimitTest('rate limiting (requires caddy-ratelimit plugin)', () => {
    expectValid(buildConfig([baseProxy({
      rate_limit: { enabled: true, requests_per_second: 10, burst: 20 },
    })]));
  });

  const cloudflareTest = validator.hasModules(['dns.providers.cloudflare']) ? test : test.skip;
  cloudflareTest('Cloudflare DNS-01 automation policy (requires caddy-dns/cloudflare)', () => {
    expectValid(buildConfig([baseProxy({ ssl_type: 'cloudflare' })], { cloudflare: true }));
  });

  test('several proxies in one config', () => {
    expectValid(buildConfig([
      baseProxy({ name: 'one', domains: ['one.example.com'] }),
      baseProxy({ name: 'two', domains: ['two.example.com'], compression_enabled: true }),
      baseProxy({ name: 'three', domains: ['three.example.com'], ip_filtering: { enabled: true, mode: 'deny', ip_list: ['1.2.3.4'] } }),
    ]));
  });
});
