/**
 * Per-proxy traffic analytics from the Caddy access log: time series, status classes,
 * bandwidth, latency, top paths and clients.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  RANGES,
  isRangeKey,
  aggregateTraffic,
  buildTrafficReport,
  readTrafficReport,
} = require('../../src/services/trafficAnalytics');

const NOW = 1_800_000_000;
const e = (ago, host, status, extra = {}) => ({
  ts: NOW - ago,
  host,
  status,
  uri: extra.uri ?? '/',
  remote_ip: extra.ip ?? '203.0.113.7',
  duration: extra.duration ?? 0.02,
  size: extra.size ?? 100,
});
const opts = { nowTs: NOW, range: '1h' };
const proxies = [
  { id: 'p1', name: 'Grafana', domains: ['grafana.example.com', '*.dash.example.com'], status: 'active' },
  { id: 'p2', name: 'Nextcloud', domains: ['cloud.example.com'], status: 'active' },
];
const report = (entries, extra = {}) =>
  buildTrafficReport({ hosts: aggregateTraffic(entries, opts), proxies, ...opts, available: true, coversWindow: true, ...extra });

describe('ranges', () => {
  test('knows 1h, 6h, 24h and 7d and rejects anything else', () => {
    expect(Object.keys(RANGES)).toEqual(['1h', '6h', '24h', '7d']);
    expect(isRangeKey('24h')).toBe(true);
    expect(isRangeKey('1y')).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
    expect(isRangeKey('__proto__')).toBe(false);
  });
});

describe('buildTrafficReport', () => {
  test('counts requests per proxy by status class, bytes and average latency', () => {
    const r = report([
      e(60, 'grafana.example.com', 200, { size: 1000, duration: 0.01 }),
      e(50, 'grafana.example.com', 302, { size: 0, duration: 0.03 }),
      e(40, 'GRAFANA.example.com:443', 404),
      e(30, 'grafana.example.com', 502, { size: 10, duration: 0.05 }),
      e(20, 'cloud.example.com', 200),
    ]);
    const grafana = r.proxies.find((p) => p.id === 'p1');
    expect(grafana.requests).toBe(4);
    expect(grafana.status).toEqual({ '2xx': 1, '3xx': 1, '4xx': 1, '5xx': 1 });
    expect(grafana.bytes).toBe(1110);
    expect(grafana.avgMs).toBeCloseTo((10 + 30 + 20 + 50) / 4, 5);
    expect(r.proxies.find((p) => p.id === 'p2').requests).toBe(1);
    expect(r.totals.requests).toBe(5);
  });

  test('ignores entries outside the window', () => {
    const r = report([e(7200, 'grafana.example.com', 200), e(10, 'grafana.example.com', 200)]);
    expect(r.totals.requests).toBe(1);
  });

  test('matches wildcard domains, exact domains first, and groups the rest as other hosts', () => {
    const r = report([
      e(10, 'a.dash.example.com', 200),
      e(10, 'cloud.example.com', 200),
      e(10, 'unknown.example.org', 500),
    ]);
    expect(r.proxies.find((p) => p.id === 'p1').requests).toBe(1);
    expect(r.other.requests).toBe(1);
    expect(r.other.hosts).toEqual(['unknown.example.org']);
    expect(r.totals.requests).toBe(3);
  });

  test('an exact domain beats a wildcard that also matches', () => {
    const both = [
      { id: 'w', name: 'Wild', domains: ['*.example.com'] },
      { id: 'x', name: 'Exact', domains: ['api.example.com'] },
    ];
    const r = buildTrafficReport({
      hosts: aggregateTraffic([e(5, 'api.example.com', 200), e(5, 'www.example.com', 200)], opts),
      proxies: both, ...opts, available: true, coversWindow: true,
    });
    expect(r.proxies.find((p) => p.id === 'x').requests).toBe(1);
    expect(r.proxies.find((p) => p.id === 'w').requests).toBe(1);
  });

  test('every proxy is listed, even with no traffic', () => {
    const r = report([]);
    expect(r.proxies.map((p) => p.requests)).toEqual([0, 0]);
    expect(r.proxies[0].avgMs).toBeNull();
    expect(r.proxies[0].p95Ms).toBeNull();
  });

  test('time series have one point per bucket and put each request in its bucket', () => {
    const r = report([e(0, 'cloud.example.com', 200), e(0, 'cloud.example.com', 500), e(3000, 'cloud.example.com', 200)]);
    const s = r.totals.series;
    expect(r.bucketSeconds).toBe(60);
    expect(s.requests.length).toBe(s.ok.length);
    expect(s.requests.length).toBe(s.serverError.length);
    expect(s.requests.reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.serverError.reduce((a, b) => a + b, 0)).toBe(1);
    expect(s.requests[s.requests.length - 1]).toBe(2); // the latest bucket
    expect(s.avgMs.filter((v) => v === null).length).toBeGreaterThan(0); // empty buckets have no latency
    expect(r.series).toBeUndefined();
  });

  test('p50 and p95 come from the latency histogram', () => {
    const entries = [];
    for (let i = 0; i < 95; i++) entries.push(e(10, 'cloud.example.com', 200, { duration: 0.004 }));
    for (let i = 0; i < 5; i++) entries.push(e(10, 'cloud.example.com', 200, { duration: 0.8 }));
    const p = report(entries).proxies.find((x) => x.id === 'p2');
    expect(p.p50Ms).toBeLessThanOrEqual(5);
    expect(p.p95Ms).toBeLessThanOrEqual(5);
    const slow = report([...entries, ...entries.slice(0, 20).map(() => e(10, 'cloud.example.com', 200, { duration: 0.8 }))]);
    expect(slow.proxies.find((x) => x.id === 'p2').p95Ms).toBeGreaterThanOrEqual(500);
  });

  test('top paths drop the query string and top clients are counted', () => {
    const r = report([
      e(5, 'cloud.example.com', 200, { uri: '/a?x=1', ip: '198.51.100.1' }),
      e(5, 'cloud.example.com', 200, { uri: '/a?x=2', ip: '198.51.100.1' }),
      e(5, 'cloud.example.com', 200, { uri: '/b', ip: '198.51.100.2' }),
    ]);
    const p = r.proxies.find((x) => x.id === 'p2');
    expect(p.topPaths).toEqual([{ key: '/a', count: 2 }, { key: '/b', count: 1 }]);
    expect(p.topClients[0]).toEqual({ key: '198.51.100.1', count: 2 });
  });

  test('a flood of distinct paths cannot grow memory without bound', () => {
    const entries = Array.from({ length: 5000 }, (_, i) => e(5, 'cloud.example.com', 200, { uri: `/p${i}` }));
    const p = report(entries).proxies.find((x) => x.id === 'p2');
    expect(p.requests).toBe(5000);
    expect(p.topPaths.length).toBeLessThanOrEqual(8);
  });

  test('keeps the availability flags', () => {
    const r = report([], { available: false, coversWindow: false });
    expect(r.available).toBe(false);
    expect(r.coversWindow).toBe(false);
  });
});

describe('readTrafficReport', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-analytics-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const line = (ago, host, status) => JSON.stringify({
    ts: NOW - ago, level: 'info', logger: 'http.log.access', status, duration: 0.02, size: 5,
    request: { host, method: 'GET', uri: '/x', remote_ip: '203.0.113.9' },
  });

  test('reads the log file and reports whether it covers the window', async () => {
    const file = path.join(dir, 'access.log');
    fs.writeFileSync(file, [line(100, 'cloud.example.com', 200), 'not json', line(50, 'cloud.example.com', 500)].join('\n'));
    const r = await readTrafficReport({ proxies, range: '1h', nowTs: NOW, file });
    expect(r.available).toBe(true);
    expect(r.coversWindow).toBe(false); // the log starts 100 s ago, the window is an hour
    expect(r.proxies.find((p) => p.id === 'p2').requests).toBe(2);
  });

  test('a missing log is unavailable, not empty', async () => {
    const r = await readTrafficReport({ proxies, range: '24h', nowTs: NOW, file: path.join(dir, 'nope.log') });
    expect(r.available).toBe(false);
    expect(r.totals.requests).toBe(0);
  });
});
