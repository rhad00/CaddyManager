const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyseLive, readLiveReport, readTailEntries, LIVE_WINDOW_SECONDS } = require('../../src/services/liveTraffic');

const NOW = 1_800_000_000;
const e = (agoSeconds, over = {}) => ({ ts: NOW - agoSeconds, status: 200, method: 'GET', host: 'a.example.com', uri: '/x', duration: 0.0123, ...over });

describe('analyseLive', () => {
  test('buckets the last five minutes into five second steps', () => {
    const r = analyseLive([e(1), e(2), e(299), e(301)], { nowTs: NOW });
    expect(r.series.requests).toHaveLength(60);
    expect(r.total).toBe(3);
    expect(r.series.requests[59]).toBe(2);
    expect(r.series.requests[0]).toBe(1);
  });
  test('counts server errors and the recent rate', () => {
    const r = analyseLive([e(1, { status: 502 }), e(2), e(3), e(50)], { nowTs: NOW });
    expect(r.series.serverErrors[59]).toBe(1);
    expect(r.rate).toBeCloseTo(0.3);
  });
  test('lists the newest requests first and never returns a query string', () => {
    const r = analyseLive([e(30, { uri: '/old' }), e(2, { uri: '/login?token=secret#frag' })], { nowTs: NOW });
    expect(r.recent.map((x) => x.path)).toEqual(['/login', '/old']);
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(r.recent[0].ms).toBe(12);
  });
  test('ignores lines without a status and entries from the future', () => {
    const r = analyseLive([{ ts: NOW - 1 }, e(-10)], { nowTs: NOW });
    expect(r.total).toBe(0);
  });
  test('limits the recent list', () => {
    expect(analyseLive(Array.from({ length: 50 }, (_, i) => e(i)), { nowTs: NOW }).recent).toHaveLength(15);
  });
});

describe('reading the tail', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-live-'));
  const line = (ago, over = {}) =>
    JSON.stringify({
      level: 'info',
      logger: 'http.log.access',
      ts: NOW - ago,
      request: { host: 'a.example.com', method: 'GET', uri: '/p', remote_ip: '1.2.3.4', headers: {} },
      status: 200,
      duration: 0.01,
      size: 5,
      ...over,
    });

  test('a missing file is unavailable, not an error', async () => {
    const r = await readLiveReport({ file: path.join(dir, 'nope.log'), nowTs: NOW });
    expect(r.available).toBe(false);
  });
  test('reads only the end of a big file and says when it cannot reach the window start', async () => {
    const file = path.join(dir, 'big.log');
    fs.writeFileSync(file, Array.from({ length: 2000 }, () => line(1)).join('\n') + '\n');
    const tail = await readTailEntries(file, 2000);
    expect(tail.reachesStart).toBe(false);
    expect(tail.entries.length).toBeLessThan(2000);
    const r = await readLiveReport({ file, nowTs: NOW, tailBytes: 2000 });
    expect(r.coversWindow).toBe(false);
  });
  test('a small log covers the window', async () => {
    const file = path.join(dir, 'small.log');
    fs.writeFileSync(file, [line(10), line(2)].join('\n') + '\n');
    const r = await readLiveReport({ file, nowTs: NOW });
    expect(r.coversWindow).toBe(true);
    expect(r.total).toBe(2);
    expect(LIVE_WINDOW_SECONDS).toBe(300);
  });
});
