/**
 * Proxies imported from Git or a backup meet the same rules as the API (MODERNIZATION.md 0.16).
 */
const bcrypt = require('bcrypt');
const { prepareImportedProxies, ProxyImportError } = require('../../src/utils/proxyImport');

const HASH = bcrypt.hashSync('correct horse', 4);

// Shape written by gitService.exportConfigToFile and backupService (proxy.toJSON())
const exported = (overrides = {}) => ({
  id: 'b3f2c1d0-0000-4000-8000-000000000001',
  name: 'app',
  domains: ['app.example.com'],
  upstream_url: 'http://app:8080',
  ssl_type: 'acme',
  status: 'active',
  compression_enabled: true,
  load_balancing: null,
  basic_auth: { enabled: true, username: 'admin', hashed_password: HASH },
  caddy_route_index: 4,
  tls_status: { ok: true },
  created_by: 'someone-else',
  createdAt: '2026-01-01T00:00:00.000Z',
  headers: [{ id: 'h1', proxy_id: 'old', header_type: 'request', header_name: 'X-App', header_value: 'one', enabled: true }],
  middlewares: [{ id: 'm1', proxy_id: 'old', middleware_type: 'compression', configuration: {}, enabled: true, order: 1 }],
  ...overrides,
});

describe('prepareImportedProxies', () => {
  test('keeps only the fields the API accepts, for the proxy and its headers and middlewares', async () => {
    const [prepared] = await prepareImportedProxies([exported()]);

    expect(prepared.fields).toEqual({
      name: 'app',
      domains: ['app.example.com'],
      upstream_url: 'http://app:8080',
      ssl_type: 'acme',
      status: 'active',
      compression_enabled: true,
      load_balancing: null,
      basic_auth: { enabled: true, username: 'admin', hashed_password: HASH },
    });
    expect(prepared.headers).toEqual([{ header_type: 'request', header_name: 'X-App', header_value: 'one', enabled: true }]);
    expect(prepared.middlewares).toEqual([{ middleware_type: 'compression', configuration: {}, enabled: true, order: 1 }]);
  });

  test('hashes a plaintext basic auth password written by hand in the repository', async () => {
    const [prepared] = await prepareImportedProxies([
      exported({ basic_auth: { enabled: true, username: 'admin', password: 'correct horse' } }),
    ]);

    expect(prepared.fields.basic_auth.password).toBeUndefined();
    await expect(bcrypt.compare('correct horse', prepared.fields.basic_auth.hashed_password)).resolves.toBe(true);
  });

  test.each([
    ['a restricted upstream', { upstream_url: 'http://169.254.169.254' }, /restricted address/],
    ['an upstream with a path', { upstream_url: 'http://app:8080/admin' }, /path/i],
    ['an invalid domain', { domains: ['not a domain'] }, /Invalid domain/],
    ['an unknown ssl_type', { ssl_type: 'letsencrypt' }, /ssl_type/],
    ['a restricted path-routing upstream', { path_routing: { enabled: true, routes: [{ path: '/api', upstream_url: 'http://127.0.0.1:9000' }] } }, /restricted/],
    ['a malformed password hash', { basic_auth: { enabled: true, username: 'admin', hashed_password: 'not-a-hash' } }, /bcrypt/],
    ['a missing upstream', { upstream_url: undefined }, /upstream_url/],
  ])('rejects %s', async (_label, overrides, message) => {
    await expect(prepareImportedProxies([exported(overrides)])).rejects.toThrow(message);
  });

  test('reports every invalid entry at once, naming each', async () => {
    const error = await prepareImportedProxies([
      exported({ name: 'good' }),
      exported({ name: 'bad-upstream', upstream_url: 'http://10.0.0.1' }),
      exported({ name: 'bad-domain', domains: ['not a domain'] }),
    ]).catch((e) => e);

    expect(error).toBeInstanceOf(ProxyImportError);
    expect(error.errors).toHaveLength(2);
    expect(error.message).toMatch(/#2 "bad-upstream"/);
    expect(error.message).toMatch(/#3 "bad-domain"/);
  });

  test('rejects two entries that share a domain, as the API would', async () => {
    await expect(prepareImportedProxies([
      exported({ name: 'first', domains: ['shared.example.com'] }),
      exported({ name: 'second', domains: ['other.example.com', 'shared.example.com'] }),
    ])).rejects.toThrow(/#2 "second".*shared\.example\.com.*#1/);
  });

  // Our own exports write basic_auth: null for proxies without it; they must re-import
  test('treats basic_auth: null (as exported for proxies without it) as not set', async () => {
    const [prepared] = await prepareImportedProxies([exported({ basic_auth: null })]);
    expect(prepared.fields).not.toHaveProperty('basic_auth');
  });

  test('rejects a basic_auth that is not an object', async () => {
    await expect(prepareImportedProxies([exported({ basic_auth: 'admin:secret' })])).rejects.toThrow(/basic_auth must be an object/);
  });

  test('rejects input that is not a list of objects', async () => {
    await expect(prepareImportedProxies({ name: 'x' })).rejects.toThrow(/list/);
    await expect(prepareImportedProxies([null])).rejects.toThrow(/object/);
  });
});
