jest.mock('axios');
const axios = require('axios');
const dns = require('../../src/services/cloudflareDnsService');

const ok = (result) => Promise.resolve({ data: { success: true, result } });
const IP = '203.0.113.7';

beforeEach(() => {
  jest.resetAllMocks();
  dns._resetIpCache();
  process.env.CF_API_TOKEN = 'tok';
  process.env.PUBLIC_IP = IP;
  delete process.env.CF_DNS_PROXIED;
  delete process.env.CF_DNS_AUTO;
});

describe('findZone', () => {
  test('walks up the labels until Cloudflare knows the zone', async () => {
    axios.get.mockImplementation((url, cfg) => {
      if (url.endsWith('/zones') && cfg.params.name === 'example.com') return ok([{ id: 'z1', name: 'example.com' }]);
      return ok([]);
    });
    await expect(dns.findZone('app.sub.example.com')).resolves.toEqual({ id: 'z1', name: 'example.com' });
    const tried = axios.get.mock.calls.map((c) => c[1].params.name);
    expect(tried).toEqual(['app.sub.example.com', 'sub.example.com', 'example.com']);
  });

  test('strips a wildcard prefix', async () => {
    axios.get.mockImplementation(() => ok([{ id: 'z1', name: 'example.com' }]));
    await dns.findZone('*.example.com');
    expect(axios.get.mock.calls[0][1].params.name).toBe('example.com');
  });

  test('returns null when no zone matches', async () => {
    axios.get.mockImplementation(() => ok([]));
    await expect(dns.findZone('app.example.org')).resolves.toBeNull();
  });
});

describe('ensureARecord', () => {
  const zone = { id: 'z1', name: 'example.com' };

  test('creates the record when missing, DNS-only by default', async () => {
    axios.get.mockImplementation(() => ok([]));
    axios.post.mockImplementation(() => ok({ id: 'r1' }));
    const r = await dns.ensureARecord(zone, 'app.example.com', IP);
    expect(r.status).toBe('created');
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/zones/z1/dns_records'),
      { type: 'A', name: 'app.example.com', content: IP, ttl: 1, proxied: false },
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    );
  });

  test('CF_DNS_PROXIED=true turns the Cloudflare proxy on', async () => {
    process.env.CF_DNS_PROXIED = 'true';
    axios.get.mockImplementation(() => ok([]));
    axios.post.mockImplementation(() => ok({ id: 'r1' }));
    await dns.ensureARecord(zone, 'app.example.com', IP);
    expect(axios.post.mock.calls[0][1].proxied).toBe(true);
  });

  test('is idempotent: an identical record is left alone', async () => {
    axios.get.mockImplementation(() => ok([{ id: 'r1', type: 'A', content: IP }]));
    const r = await dns.ensureARecord(zone, 'app.example.com', IP);
    expect(r.status).toBe('exists');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('never overwrites a record that points elsewhere', async () => {
    axios.get.mockImplementation(() => ok([{ id: 'r1', type: 'A', content: '198.51.100.1' }]));
    const r = await dns.ensureARecord(zone, 'app.example.com', IP);
    expect(r.status).toBe('conflict');
    expect(r.message).toContain('198.51.100.1');
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('ensureRecordsForDomains', () => {
  test('reports skipped without a token and calls nothing', async () => {
    delete process.env.CF_API_TOKEN;
    const results = await dns.ensureRecordsForDomains(['app.example.com']);
    expect(results).toEqual([{ domain: 'app.example.com', status: 'skipped', message: expect.stringMatching(/CF_API_TOKEN/) }]);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('skips IP literals and localhost', async () => {
    const results = await dns.ensureRecordsForDomains(['10.0.0.1', 'localhost']);
    expect(results.map((r) => r.status)).toEqual(['skipped', 'skipped']);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('reports no_zone when the token cannot see the domain', async () => {
    axios.get.mockImplementation(() => ok([]));
    const [r] = await dns.ensureRecordsForDomains(['app.example.org']);
    expect(r.status).toBe('no_zone');
  });

  test('turns a Cloudflare API error into a failed result instead of throwing', async () => {
    axios.get.mockRejectedValue({ response: { status: 403, data: { errors: [{ message: 'Authentication error' }] } }, message: 'x' });
    const [r] = await dns.ensureRecordsForDomains(['app.example.com']);
    expect(r.status).toBe('failed');
    expect(r.message).toContain('Authentication error');
  });

  test('CF_DNS_AUTO=false disables it', async () => {
    process.env.CF_DNS_AUTO = 'false';
    const [r] = await dns.ensureRecordsForDomains(['app.example.com']);
    expect(r.status).toBe('skipped');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('detects the server IP when PUBLIC_IP is unset', async () => {
    delete process.env.PUBLIC_IP;
    axios.get.mockImplementation((url) => {
      if (url.includes('ipify')) return Promise.resolve({ data: '198.51.100.9' });
      if (url.endsWith('/zones')) return ok([{ id: 'z1', name: 'example.com' }]);
      return ok([]);
    });
    axios.post.mockImplementation(() => ok({ id: 'r1' }));
    const [r] = await dns.ensureRecordsForDomains(['app.example.com']);
    expect(r.status).toBe('created');
    expect(axios.post.mock.calls[0][1].content).toBe('198.51.100.9');
  });
});
