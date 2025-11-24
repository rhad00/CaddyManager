const axios = require('axios');

jest.mock('axios');
jest.mock('fs', () => ({ promises: { writeFile: jest.fn(), mkdir: jest.fn() } }));

jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: { destroy: jest.fn(), create: jest.fn() },
  Middleware: { destroy: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) }
}));

const { Proxy } = require('../../src/models');
const caddyService = require('../../src/services/caddyService');

describe('CaddyService add/update load payload assertions', () => {
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;

  afterEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = originalToken;
    jest.clearAllMocks();
  });

  test('addProxy leads to load payload containing Cloudflare policy', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'itoken';

    const baseConfig = { apps: { http: { servers: { srv0: { routes: [] } } } } };
    axios.get.mockResolvedValue({ data: baseConfig });
    axios.post.mockResolvedValue({});

    // Mock verifyTlsForDomains to avoid network
    caddyService.verifyTlsForDomains = jest.fn().mockResolvedValue({ ok: true, results: [] });

    const proxy = { domains: ['add.example.com'], upstream_url: 'http://u', ssl_type: 'cloudflare', update: jest.fn().mockResolvedValue(true) };
    const res = await caddyService.addProxy(proxy);
    expect(res.success).toBe(true);

    // Find a /load call
    const loadCall = axios.post.mock.calls.find(c => String(c[0]).includes('/load'));
    expect(loadCall).toBeDefined();
    const payload = loadCall[1];
    expect(payload.apps.tls.automation.policies.some(p=>p.subjects && p.subjects.includes('add.example.com'))).toBe(true);
  });

  test('updateProxy leads to load payload containing Cloudflare policy', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'itoken';

    const baseConfig = { apps: { http: { servers: { srv0: { routes: [ {}, {} ] } } } } };
    axios.get.mockResolvedValue({ data: baseConfig });
    axios.post.mockResolvedValue({});

    // Mock verifyTlsForDomains
    caddyService.verifyTlsForDomains = jest.fn().mockResolvedValue({ ok: true, results: [] });

    const proxy = { id: 'p', caddy_route_index: 1, domains: ['update-load.example.com'], upstream_url: 'http://u', ssl_type: 'cloudflare', update: jest.fn().mockResolvedValue(true) };
    const res = await caddyService.updateProxy(proxy);
    expect(res).toHaveProperty('success');

    // Find a /load call
    const loadCall = axios.post.mock.calls.find(c => String(c[0]).includes('/load'));
    expect(loadCall).toBeDefined();
    const payload = loadCall[1];
    expect(payload.apps.tls.automation.policies.some(p=>p.subjects && p.subjects.includes('update-load.example.com'))).toBe(true);
  });
});
