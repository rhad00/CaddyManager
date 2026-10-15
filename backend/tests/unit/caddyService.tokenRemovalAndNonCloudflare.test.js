const axios = require('axios');

jest.mock('axios');
jest.mock('fs', () => ({ promises: { writeFile: jest.fn(), mkdir: jest.fn() } }));
jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: { destroy: jest.fn(), create: jest.fn() },
  Middleware: { destroy: jest.fn(), create: jest.fn() },
  // loadConfig merges custom certificates from the database
  Certificate: { findAll: jest.fn(async () => []) },
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) }
}));

const { Proxy } = require('../../src/models');
const { caddyService } = require('../../src/services/caddyService');

const cloudflarePolicies = (payload) => (payload?.apps?.tls?.automation?.policies || [])
  .filter(p => p.issuers?.some(i => i.challenges?.dns?.provider?.name === 'cloudflare'));

describe('CaddyService Cloudflare policy scope', () => {
  const originalToken = process.env.CF_API_TOKEN;

  beforeEach(() => {
    caddyService.verifyTlsForDomains = jest.fn().mockResolvedValue({ ok: true, results: [] });
    axios.post.mockResolvedValue({});
  });

  afterEach(() => {
    process.env.CF_API_TOKEN = originalToken;
    jest.clearAllMocks();
  });

  test('a proxy switched from Cloudflare to ACME leaves the DNS-01 policy', async () => {
    process.env.CF_API_TOKEN = 'token-set-in-backend';
    const liveConfig = caddyService.setCloudflarePolicy(
      { apps: { http: { servers: { srv0: { routes: [{}, {}] } } } } },
      ['switch.example.com', 'stays.example.com']
    );
    axios.get.mockResolvedValue({ data: liveConfig });
    // DB after the switch: only the other proxy still uses Cloudflare
    Proxy.findAll.mockResolvedValue([{ domains: ['stays.example.com'] }]);

    const proxy = { id: 'p', caddy_route_index: 1, domains: ['switch.example.com'], upstream_url: 'http://u', ssl_type: 'acme', update: jest.fn() };
    await caddyService.updateProxy(proxy);

    const payload = axios.post.mock.calls.find(c => String(c[0]).includes('/load'))[1];
    expect(cloudflarePolicies(payload)[0].subjects).toEqual(['stays.example.com']);
  });

  test('addProxy/updateProxy add no DNS-01 policy for non-Cloudflare proxies, even with a token set', async () => {
    process.env.CF_API_TOKEN = 'token-set-in-backend';
    axios.get.mockResolvedValue({ data: { apps: { http: { servers: { srv0: { routes: [] } } } } } });
    Proxy.findAll.mockResolvedValue([]); // no Cloudflare proxies in the DB

    const proxy = { domains: ['plain.example.com'], upstream_url: 'http://u', ssl_type: 'acme', update: jest.fn().mockResolvedValue(true) };
    const res = await caddyService.addProxy(proxy);
    expect(res.success).toBe(true);
    for (const [url, payload] of axios.post.mock.calls) {
      if (String(url).includes('/load')) expect(cloudflarePolicies(payload)).toHaveLength(0);
    }

    axios.post.mockClear();
    axios.get.mockResolvedValue({ data: { apps: { http: { servers: { srv0: { routes: [{}, {}] } } } } } });
    const up = { id: 'p', caddy_route_index: 1, domains: ['plain.example.com'], upstream_url: 'http://u', ssl_type: 'custom', update: jest.fn().mockResolvedValue(true) };
    await caddyService.updateProxy(up);
    const loadCall = axios.post.mock.calls.find(c => String(c[0]).includes('/load'));
    expect(cloudflarePolicies(loadCall[1])).toHaveLength(0);
  });
});
