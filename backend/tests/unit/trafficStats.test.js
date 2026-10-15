/**
 * Per-host request and error counts from the Caddy access log (MODERNIZATION.md 0.20).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hostTrafficSince } = require('../../src/services/trafficStats');

const NOW = 1_800_000_000; // unix seconds
const line = (ts, host, status) => JSON.stringify({
  level: 'info', ts, logger: 'http.log.access.access', status, request: { host, method: 'GET', uri: '/' },
});

let dir;
const writeLog = (lines) => {
  const file = path.join(dir, 'access.log');
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
};

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-traffic-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('counts requests and 5xx per host since the given time, ignoring ports and case', async () => {
  const file = writeLog([
    line(NOW - 3600, 'app.example.com', 500), // before the window
    line(NOW - 60, 'app.example.com', 200),
    line(NOW - 50, 'App.Example.com:443', 502),
    line(NOW - 40, 'app.example.com', 404), // 4xx is not a server error
    line(NOW - 30, 'other.example.com', 503),
    'not json',
  ]);

  const stats = await hostTrafficSince(NOW - 600, file);

  expect(stats.available).toBe(true);
  expect(stats.coversWindow).toBe(true);
  expect(stats.byHost.get('app.example.com')).toEqual({ total: 3, errors: 1 });
  expect(stats.byHost.get('other.example.com')).toEqual({ total: 1, errors: 1 });
});

test('reports a log that starts inside the window as not covering it', async () => {
  const file = writeLog([line(NOW - 60, 'app.example.com', 200)]);

  const stats = await hostTrafficSince(NOW - 600, file);

  expect(stats.coversWindow).toBe(false);
});

test('reports a missing log as unavailable', async () => {
  const stats = await hostTrafficSince(NOW - 600, path.join(dir, 'missing.log'));

  expect(stats).toMatchObject({ available: false, coversWindow: false });
  expect(stats.byHost.size).toBe(0);
});
