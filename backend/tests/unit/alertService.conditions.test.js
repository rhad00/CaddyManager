/**
 * Alert conditions (MODERNIZATION.md 0.20): error_rate and no_traffic come from the access
 * log, upstream_down probes the upstreams, cert_expiry refreshes a stale TLS status.
 */
jest.mock('../../src/services/trafficStats', () => ({
  hostTrafficSince: jest.fn(),
  trafficForDomains: jest.requireActual('../../src/services/trafficStats').trafficForDomains,
}));
jest.mock('../../src/utils/upstreamProbe', () => ({ unreachableUpstreams: jest.fn() }));
jest.mock('../../src/services/caddyService', () => ({ caddyService: { verifyTlsForDomains: jest.fn() } }));

const { hostTrafficSince } = require('../../src/services/trafficStats');
const { unreachableUpstreams } = require('../../src/utils/upstreamProbe');
const { caddyService } = require('../../src/services/caddyService');
const { checkCondition, createRunContext } = require('../../src/services/alertService');

const HOUR = 60 * 60 * 1000;
const proxy = (overrides = {}) => ({
  id: 'p1',
  name: 'app',
  domains: ['app.example.com'],
  upstream_url: 'http://app:80',
  ssl_type: 'acme',
  status: 'active',
  createdAt: new Date(Date.now() - 48 * HOUR),
  update: jest.fn(async function update(values) { Object.assign(this, values); }),
  ...overrides,
});
const traffic = (entries, { coversWindow = true } = {}) => ({
  available: true,
  coversWindow,
  byHost: new Map(Object.entries(entries)),
});

beforeEach(() => jest.clearAllMocks());

describe('error_rate', () => {
  const rule = { condition_type: 'error_rate', threshold: 5 };

  test('fires above the threshold percentage of 5xx responses', async () => {
    hostTrafficSince.mockResolvedValue(traffic({ 'app.example.com': { total: 100, errors: 12 } }));

    const result = await checkCondition(rule, proxy(), createRunContext());

    expect(result).toEqual({ rate: '12.0', errors: 12, total: 100, windowMinutes: 15 });
  });

  test('stays quiet below the threshold or with too few requests to judge', async () => {
    hostTrafficSince.mockResolvedValue(traffic({ 'app.example.com': { total: 100, errors: 3 } }));
    expect(await checkCondition(rule, proxy(), createRunContext())).toBeNull();

    hostTrafficSince.mockResolvedValue(traffic({ 'app.example.com': { total: 5, errors: 5 } }));
    expect(await checkCondition(rule, proxy(), createRunContext())).toBeNull();
  });
});

describe('no_traffic', () => {
  const rule = { condition_type: 'no_traffic', threshold: 60 };

  test('fires when the log covers the window and no domain got a request', async () => {
    hostTrafficSince.mockResolvedValue(traffic({ 'other.example.com': { total: 9, errors: 0 } }));

    expect(await checkCondition(rule, proxy(), createRunContext())).toEqual({ minutes: 60 });
  });

  test('stays quiet with traffic, with a log that does not cover the window, or for a new proxy', async () => {
    hostTrafficSince.mockResolvedValue(traffic({ 'app.example.com': { total: 1, errors: 0 } }));
    expect(await checkCondition(rule, proxy(), createRunContext())).toBeNull();

    hostTrafficSince.mockResolvedValue(traffic({}, { coversWindow: false }));
    expect(await checkCondition(rule, proxy(), createRunContext())).toBeNull();

    hostTrafficSince.mockResolvedValue(traffic({}));
    expect(await checkCondition(rule, proxy({ createdAt: new Date() }), createRunContext())).toBeNull();
  });

  test('reads the log once per window in a run', async () => {
    hostTrafficSince.mockResolvedValue(traffic({}));
    const ctx = createRunContext();

    await checkCondition(rule, proxy(), ctx);
    await checkCondition(rule, proxy({ id: 'p2' }), ctx);

    expect(hostTrafficSince).toHaveBeenCalledTimes(1);
  });
});

describe('upstream_down', () => {
  const rule = { condition_type: 'upstream_down' };

  test('fires with the upstreams that refuse connections', async () => {
    unreachableUpstreams.mockResolvedValue(['app:80']);
    expect(await checkCondition(rule, proxy(), createRunContext())).toEqual({ unreachable: ['app:80'] });
  });

  test('stays quiet when every upstream answers', async () => {
    unreachableUpstreams.mockResolvedValue([]);
    expect(await checkCondition(rule, proxy(), createRunContext())).toBeNull();
  });
});

describe('cert_expiry', () => {
  const rule = { condition_type: 'cert_expiry', threshold: 14 };
  const soon = new Date(Date.now() + 3 * 24 * HOUR).toUTCString();

  test('refreshes a stale TLS status before deciding', async () => {
    caddyService.verifyTlsForDomains.mockResolvedValue({ ok: true, results: [{ domain: 'app.example.com', ok: true, validTo: soon }] });
    const stale = proxy({ tls_status: { ok: true, results: [] }, tls_checked_at: new Date(Date.now() - 24 * HOUR) });

    const result = await checkCondition(rule, stale, createRunContext());

    expect(caddyService.verifyTlsForDomains).toHaveBeenCalledWith(['app.example.com'], expect.any(Number));
    expect(stale.update).toHaveBeenCalledWith(expect.objectContaining({ tls_checked_at: expect.any(Date) }));
    expect(result).toMatchObject({ domain: 'app.example.com', validTo: soon });
  });

  test('uses a recent TLS status as is', async () => {
    const fresh = proxy({ tls_status: { ok: true, results: [{ domain: 'app.example.com', ok: true, validTo: soon }] }, tls_checked_at: new Date() });

    expect(await checkCondition(rule, fresh, createRunContext())).toMatchObject({ domain: 'app.example.com' });
    expect(caddyService.verifyTlsForDomains).not.toHaveBeenCalled();
  });

  test('skips proxies without TLS', async () => {
    expect(await checkCondition(rule, proxy({ ssl_type: 'none' }), createRunContext())).toBeNull();
    expect(caddyService.verifyTlsForDomains).not.toHaveBeenCalled();
  });
});
