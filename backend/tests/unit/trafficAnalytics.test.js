/**
 * Per-proxy traffic analytics from the Caddy access log: time series, status classes, bandwidth,
 * latency, visitors, clients, referrers, protocols, content, paths, and the period before.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  RANGES,
  OTHER_ID,
  isRangeKey,
  analyseTraffic,
  readTrafficReport,
} = require('../../src/services/trafficAnalytics');

const NOW = 1_800_000_000;
const e = (ago, host, status, extra = {}) => ({
  ts: NOW - ago,
  host,
  status,
  uri: extra.uri ?? '/',
  remote_ip: extra.remote ?? '172.16.0.1',
  client_ip: extra.ip ?? '203.0.113.7',
  duration: extra.duration ?? 0.02,
  size: extra.size ?? 100,
  method: extra.method ?? 'GET',
  user_agent: extra.ua ?? 'curl/8.5.0',
  proto: extra.proto ?? 'HTTP/2.0',
  tls_version: 'tls' in extra ? extra.tls : 772,
  tls_cipher: 'cipher' in extra ? extra.cipher : 4865,
  referer: extra.referer,
  content_type: extra.type,
  bytes_read: extra.in ?? 0,
});
const proxies = [
  { id: 'p1', name: 'Grafana', domains: ['grafana.example.com', '*.dash.example.com'], status: 'active' },
  { id: 'p2', name: 'Nextcloud', domains: ['cloud.example.com'], status: 'active' },
];
const run = (entries, extra = {}) => analyseTraffic(entries, { proxies, range: '1h', nowTs: NOW, ...extra });

describe('ranges', () => {
  test('knows 1h, 6h, 24h and 7d and rejects anything else', () => {
    expect(Object.keys(RANGES)).toEqual(['1h', '6h', '24h', '7d']);
    expect(isRangeKey('24h')).toBe(true);
    expect(isRangeKey('1y')).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
    expect(isRangeKey('__proto__')).toBe(false);
  });
});

describe('requests per proxy', () => {
  test('counts requests by status class, bytes in and out, and average latency', () => {
    const r = run([
      e(60, 'grafana.example.com', 200, { size: 1000, duration: 0.01, in: 50 }),
      e(50, 'grafana.example.com', 302, { size: 0, duration: 0.03 }),
      e(40, 'GRAFANA.example.com:443', 404),
      e(30, 'grafana.example.com', 502, { size: 10, duration: 0.05 }),
      e(20, 'cloud.example.com', 200),
    ]);
    const grafana = r.proxies.find((p) => p.id === 'p1');
    expect(grafana.requests).toBe(4);
    expect(grafana.status).toEqual({ '2xx': 1, '3xx': 1, '4xx': 1, '5xx': 1 });
    expect(grafana.bytes).toBe(1110);
    expect(grafana.bytesIn).toBe(50);
    expect(grafana.avgMs).toBeCloseTo((10 + 30 + 20 + 50) / 4, 5);
    expect(r.proxies.find((p) => p.id === 'p2').requests).toBe(1);
    expect(r.totals.requests).toBe(5);
  });

  test('ignores entries before the window and before the period it is compared with', () => {
    const r = run([e(100000, 'grafana.example.com', 200), e(10, 'grafana.example.com', 200)]);
    expect(r.totals.requests).toBe(1);
    expect(r.totals.previous.requests).toBe(0);
  });

  test('matches wildcard domains, exact first, and groups the rest as other hosts', () => {
    const r = run([
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
    const r = analyseTraffic([e(5, 'api.example.com', 200), e(5, 'www.example.com', 200)], { proxies: both, range: '1h', nowTs: NOW });
    expect(r.proxies.find((p) => p.id === 'x').requests).toBe(1);
    expect(r.proxies.find((p) => p.id === 'w').requests).toBe(1);
  });

  test('every proxy is listed, even with no traffic', () => {
    const r = run([]);
    expect(r.proxies.map((p) => p.requests)).toEqual([0, 0]);
    expect(r.proxies[0].avgMs).toBeNull();
    expect(r.proxies[0].p95Ms).toBeNull();
    expect(r.other).toBeNull();
  });

  test('time series have one point per bucket and put each request in its bucket', () => {
    const r = run([e(0, 'cloud.example.com', 200), e(0, 'cloud.example.com', 500), e(3000, 'cloud.example.com', 200)]);
    const s = r.totals.series;
    expect(r.bucketSeconds).toBe(60);
    expect(s.requests.reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.serverError.reduce((a, b) => a + b, 0)).toBe(1);
    expect(s.requests[s.requests.length - 1]).toBe(2);
    expect(s.avgMs.filter((v) => v === null).length).toBeGreaterThan(0);
  });

  test('p50 and p95 come from the latency histogram', () => {
    const entries = [];
    for (let i = 0; i < 95; i++) entries.push(e(10, 'cloud.example.com', 200, { duration: 0.004 }));
    for (let i = 0; i < 5; i++) entries.push(e(10, 'cloud.example.com', 200, { duration: 0.8 }));
    const p = run(entries).proxies.find((x) => x.id === 'p2');
    expect(p.p50Ms).toBeLessThanOrEqual(5);
    expect(p.p95Ms).toBeLessThanOrEqual(5);
    const slow = run([...entries, ...entries.slice(0, 20).map(() => e(10, 'cloud.example.com', 200, { duration: 0.8 }))]);
    expect(slow.proxies.find((x) => x.id === 'p2').p95Ms).toBeGreaterThanOrEqual(500);
  });

  test('keeps the availability flags', () => {
    const r = run([], { available: false });
    expect(r.available).toBe(false);
    expect(r.coversWindow).toBe(false);
    expect(r.previousCovered).toBe(false);
  });
});

describe('detail is only built for the total and the requested proxy', () => {
  const entries = [e(5, 'grafana.example.com', 200), e(5, 'cloud.example.com', 200)];

  test('no scope: only the total has detail', () => {
    const r = run(entries);
    expect(r.totals.detail).toBeDefined();
    expect(r.proxies.every((p) => p.detail === undefined)).toBe(true);
  });

  test('a proxy scope adds detail for that proxy only', () => {
    const r = run(entries, { scope: 'p2' });
    expect(r.scope).toBe('p2');
    expect(r.proxies.find((p) => p.id === 'p2').detail.topPaths).toEqual([{ key: '/', count: 1 }]);
    expect(r.proxies.find((p) => p.id === 'p1').detail).toBeUndefined();
  });

  test('the other-hosts scope adds detail for the unmatched hosts', () => {
    const r = run([...entries, e(5, 'x.example.org', 404)], { scope: OTHER_ID });
    expect(r.other.detail.errorPaths[0]).toMatchObject({ key: '/', errors4xx: 1 });
  });
});

describe('visitors', () => {
  test('counts distinct clients, once even across a proxy\'s hosts', () => {
    const r = run([
      e(5, 'grafana.example.com', 200, { ip: '198.51.100.1' }),
      e(5, 'a.dash.example.com', 200, { ip: '198.51.100.1' }),
      e(5, 'grafana.example.com', 200, { ip: '198.51.100.2' }),
    ], { scope: 'p1' });
    expect(r.proxies.find((p) => p.id === 'p1').detail.visitors).toBe(2);
    expect(r.totals.detail.visitors).toBe(2);
  });

  test('uses the client behind trusted proxies, not the proxy address', () => {
    const r = run([e(5, 'cloud.example.com', 200, { ip: '198.51.100.9', remote: '172.16.0.1' }), e(5, 'cloud.example.com', 200, { ip: '198.51.100.10', remote: '172.16.0.1' })]);
    expect(r.totals.detail.visitors).toBe(2);
    expect(r.totals.detail.topClients.map((c) => c.key).sort()).toEqual(['198.51.100.10', '198.51.100.9']);
  });

  test('a series gives the visitors of each bucket', () => {
    const r = run([e(0, 'cloud.example.com', 200, { ip: '198.51.100.1' }), e(0, 'cloud.example.com', 200, { ip: '198.51.100.2' }), e(1800, 'cloud.example.com', 200, { ip: '198.51.100.1' })]);
    const series = r.totals.detail.visitorsSeries;
    expect(series[series.length - 1]).toBe(2);
    expect(series.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('breakdowns', () => {
  const detail = (entries) => run(entries).totals.detail;
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const phone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

  test('browsers, systems, devices and the kind of client', () => {
    const d = detail([
      e(5, 'cloud.example.com', 200, { ua: chrome }),
      e(5, 'cloud.example.com', 200, { ua: chrome }),
      e(5, 'cloud.example.com', 200, { ua: phone }),
      e(5, 'cloud.example.com', 200, { ua: 'Googlebot/2.1' }),
      e(5, 'cloud.example.com', 200, { ua: 'curl/8.5.0' }),
    ]);
    expect(d.browsers[0]).toEqual({ key: 'Chrome', count: 2 });
    expect(d.systems.find((s) => s.key === 'iOS').count).toBe(1);
    expect(d.devices).toEqual(expect.arrayContaining([{ key: 'desktop', count: 2 }, { key: 'mobile', count: 1 }]));
    expect(Object.fromEntries(d.clientKinds.map((k) => [k.key, k.count]))).toEqual({ browser: 3, bot: 1, tool: 1 });
  });

  test('referrers are hosts only, never a path or query, and never the site itself', () => {
    const d = detail([
      e(5, 'cloud.example.com', 200, { referer: 'https://news.example.org/post?token=secret' }),
      e(5, 'cloud.example.com', 200, { referer: 'https://news.example.org/other' }),
      e(5, 'cloud.example.com', 200, { referer: 'https://cloud.example.com/page' }),
      e(5, 'cloud.example.com', 200, {}),
    ]);
    expect(d.referrers).toEqual([{ key: 'news.example.org', count: 2 }]);
    expect(JSON.stringify(d)).not.toContain('secret');
  });

  test('HTTP versions, TLS versions and ciphers, with plain HTTP told apart', () => {
    const d = detail([
      e(5, 'cloud.example.com', 200, { proto: 'HTTP/2.0' }),
      e(5, 'cloud.example.com', 200, { proto: 'HTTP/1.1', tls: 771, cipher: 49199 }),
      e(5, 'cloud.example.com', 200, { proto: 'HTTP/1.1', tls: undefined, cipher: undefined }),
      e(5, 'cloud.example.com', 200, { proto: 'HTTP/3.0' }),
    ]);
    expect(d.protocols.map((p) => p.key).sort()).toEqual(['HTTP/1.1', 'HTTP/2', 'HTTP/3']);
    expect(d.tls).toEqual(expect.arrayContaining([
      { key: 'TLS 1.3', count: 2 }, { key: 'TLS 1.2', count: 1 }, { key: 'No TLS (plain HTTP)', count: 1 },
    ]));
    expect(d.ciphers.map((c) => c.key)).toEqual(expect.arrayContaining(['TLS_AES_128_GCM_SHA256', 'ECDHE-RSA-AES128-GCM-SHA256']));
  });

  test('methods and content types', () => {
    const d = detail([
      e(5, 'cloud.example.com', 200, { method: 'GET', type: 'text/html; charset=utf-8' }),
      e(5, 'cloud.example.com', 200, { method: 'POST', type: 'application/json' }),
      e(5, 'cloud.example.com', 204, { method: 'POST' }),
    ]);
    expect(d.methods).toEqual([{ key: 'POST', count: 2 }, { key: 'GET', count: 1 }]);
    expect(Object.fromEntries(d.contentTypes.map((c) => [c.key, c.count]))).toEqual({ HTML: 1, JSON: 1, None: 1 });
  });

  test('top paths drop the query string', () => {
    const d = detail([
      e(5, 'cloud.example.com', 200, { uri: '/a?x=1' }),
      e(5, 'cloud.example.com', 200, { uri: '/a?x=2' }),
      e(5, 'cloud.example.com', 200, { uri: '/b' }),
    ]);
    expect(d.topPaths).toEqual([{ key: '/a', count: 2 }, { key: '/b', count: 1 }]);
  });

  test('slow paths are ranked by p95 and need a few requests; error paths by 5xx then 4xx', () => {
    const entries = [];
    for (let i = 0; i < 6; i++) entries.push(e(5, 'cloud.example.com', 200, { uri: '/slow', duration: 0.9 }));
    for (let i = 0; i < 6; i++) entries.push(e(5, 'cloud.example.com', 200, { uri: '/fast', duration: 0.002 }));
    entries.push(e(5, 'cloud.example.com', 200, { uri: '/once', duration: 9 }));
    for (let i = 0; i < 3; i++) entries.push(e(5, 'cloud.example.com', 500, { uri: '/broken' }));
    for (let i = 0; i < 5; i++) entries.push(e(5, 'cloud.example.com', 404, { uri: '/missing' }));
    const d = detail(entries);
    expect(d.slowPaths[0].key).toBe('/slow');
    expect(d.slowPaths.map((p) => p.key)).not.toContain('/once');
    expect(d.errorPaths.map((p) => p.key)).toEqual(['/broken', '/missing']);
    expect(d.errorPaths[0]).toMatchObject({ errors5xx: 3, errors4xx: 0 });
  });

  test('blocked and limited requests are counted from 401, 403 and 429', () => {
    const d = detail([e(5, 'cloud.example.com', 401), e(5, 'cloud.example.com', 403), e(5, 'cloud.example.com', 403), e(5, 'cloud.example.com', 429)]);
    expect(d.blocked).toEqual({ unauthorized: 1, forbidden: 2, rateLimited: 1 });
  });

  test('a flood of distinct paths cannot grow memory without bound', () => {
    const entries = Array.from({ length: 5000 }, (_, i) => e(5, 'cloud.example.com', 200, { uri: `/p${i}` }));
    const r = run(entries);
    expect(r.totals.requests).toBe(5000);
    expect(r.totals.detail.topPaths.length).toBeLessThanOrEqual(8);
  });

  test('hourly counts start on an hour boundary, for the heatmap', () => {
    const d = detail([e(0, 'cloud.example.com', 200), e(3700, 'cloud.example.com', 200)]);
    expect(d.hourlyFrom % 3600).toBe(0);
    expect(d.hourly.reduce((a, b) => a + b, 0)).toBe(1); // only the first is inside the 1 hour window
  });
});

describe('the period before', () => {
  test('the totals of the previous period are returned when the log reaches back that far', () => {
    const r = run([
      e(8000, 'cloud.example.com', 200), // older than the compared period: it only shows the log reaches back that far
      e(3600 + 600, 'cloud.example.com', 200),
      e(3600 + 300, 'cloud.example.com', 500, { ip: '198.51.100.5' }),
      e(60, 'cloud.example.com', 200),
    ]);
    expect(r.previousCovered).toBe(true);
    expect(r.totals.previous).toMatchObject({ requests: 2, errors5xx: 1 });
    expect(r.totals.previous.visitors).toBeGreaterThan(0);
    expect(r.proxies.find((p) => p.id === 'p2').previous.requests).toBe(2);
  });

  test('without enough log history there is no comparison, not a comparison with zero', () => {
    const r = run([e(60, 'cloud.example.com', 200)]);
    expect(r.previousCovered).toBe(false);
    expect(r.totals.previous).toBeNull();
    expect(r.proxies[0].previous).toBeNull();
  });
});

describe('readTrafficReport', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-analytics-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const line = (ago, host, status) => JSON.stringify({
    ts: NOW - ago, level: 'info', logger: 'http.log.access', status, duration: 0.02, size: 5, bytes_read: 3,
    request: { host, method: 'GET', uri: '/x', remote_ip: '203.0.113.9', client_ip: '198.51.100.3', proto: 'HTTP/2.0', headers: { 'User-Agent': ['curl/8.5.0'] }, tls: { version: 772, cipher_suite: 4865 } },
    resp_headers: { 'Content-Type': ['text/html'] },
  });

  test('reads the log file and reports whether it covers the window', async () => {
    const file = path.join(dir, 'access.log');
    fs.writeFileSync(file, [line(100, 'cloud.example.com', 200), 'not json', line(50, 'cloud.example.com', 500)].join('\n'));
    const r = await readTrafficReport({ proxies, range: '1h', nowTs: NOW, file, scope: 'p2' });
    expect(r.available).toBe(true);
    expect(r.coversWindow).toBe(false);
    expect(r.previousCovered).toBe(false);
    const p = r.proxies.find((x) => x.id === 'p2');
    expect(p.requests).toBe(2);
    expect(p.detail.visitors).toBe(1);
    expect(p.detail.tls[0].key).toBe('TLS 1.3');
  });

  test('a missing log is unavailable, not empty', async () => {
    const r = await readTrafficReport({ proxies, range: '24h', nowTs: NOW, file: path.join(dir, 'nope.log') });
    expect(r.available).toBe(false);
    expect(r.totals.requests).toBe(0);
  });
});
