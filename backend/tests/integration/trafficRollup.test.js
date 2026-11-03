/**
 * Hourly traffic rollups: what is written, what is not, and how it reads back as days.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sequelize, Proxy, User, TrafficRollup } = require('../../src/models');
const { rollupEntries, runRollup, pruneRollups, readHistory, isHistoryRange } = require('../../src/services/trafficRollup');

const HOUR = 3600;
const DAY = 86400;
// 2026-11-03 12:30 UTC
const NOW = Date.UTC(2026, 10, 3, 12, 30) / 1000;
const hourOf = (ts) => Math.floor(ts / HOUR) * HOUR;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-rollup-'));
const logFile = path.join(dir, 'access.log');

const entry = (ts, host, status = 200, over = {}) => ({ ts, host, status, size: 100, bytes_read: 10, duration: 0.05, ...over });
const line = (e) => JSON.stringify({
  ts: e.ts, level: 'info', logger: 'http.log.access', status: e.status, duration: e.duration, size: e.size,
  request: { host: e.host, method: 'GET', uri: '/', remote_ip: '203.0.113.1', headers: {} },
});

let proxy;
beforeAll(async () => {
  await sequelize.sync({ force: true });
  const user = await User.create({ email: 'a@example.com', password_hash: 'x'.repeat(60), role: 'admin' });
  proxy = await Proxy.create({ name: 'Cloud', domains: ['cloud.example.com'], upstream_url: 'http://cloud:80', ssl_type: 'acme', created_by: user.id });
});
afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(async () => { await TrafficRollup.destroy({ where: {} }); });

describe('rollupEntries', () => {
  const refs = [{ id: 'p1', domains: ['cloud.example.com'] }];
  const t = hourOf(NOW) - 3 * HOUR;

  test('counts each entry for the total and for its proxy, or "other"', () => {
    const rows = rollupEntries([entry(t + 5, 'cloud.example.com'), entry(t + 6, 'cloud.example.com', 502), entry(t + 7, 'x.example.org', 404)], refs, t, t + HOUR);
    const by = Object.fromEntries(rows.map((r) => [r.scope_id, r]));
    expect(by.total).toMatchObject({ requests: 3, status_2xx: 1, status_5xx: 1, status_4xx: 1, bytes: 300, bytes_in: 30 });
    expect(by.p1).toMatchObject({ requests: 2, status_5xx: 1 });
    expect(by.other).toMatchObject({ requests: 1, status_4xx: 1 });
    expect(by.total.duration_sum_ms).toBeCloseTo(150);
  });

  test('ignores hours outside the range and entries without a host or status', () => {
    const rows = rollupEntries([entry(t - 1, 'cloud.example.com'), entry(t + HOUR, 'cloud.example.com'), { ts: t + 1, host: '' , status: 200 }, { ts: t + 1, host: 'a' }], refs, t, t + HOUR);
    expect(rows).toEqual([]);
  });
});

describe('runRollup', () => {
  test('stores completed hours only, from the first hour the log covers in full', async () => {
    const start = hourOf(NOW) - 4 * HOUR;
    const lines = [
      entry(start + 1800, 'cloud.example.com'),          // log begins mid-hour: that hour is partial
      entry(start + HOUR + 10, 'cloud.example.com'),
      entry(start + 2 * HOUR + 10, 'cloud.example.com', 500),
      entry(hourOf(NOW) + 60, 'cloud.example.com'),      // the hour being lived through
    ];
    fs.writeFileSync(logFile, lines.map(line).join('\n') + '\n');

    const result = await runRollup({ nowTs: NOW, file: logFile });

    const stored = await TrafficRollup.findAll({ where: { scope_id: 'total' }, order: [['hour_ts', 'ASC']], raw: true });
    expect(stored.map((r) => r.hour_ts)).toEqual([start + HOUR, start + 2 * HOUR]);
    expect(result.hours).toBe(3);
    expect(stored[1].status_5xx).toBe(1);
  });

  test('running again adds nothing twice', async () => {
    const start = hourOf(NOW) - 3 * HOUR;
    fs.writeFileSync(logFile, [entry(start - 100, 'cloud.example.com'), entry(start + 5, 'cloud.example.com')].map(line).join('\n') + '\n');
    await runRollup({ nowTs: NOW, file: logFile });
    const before = await TrafficRollup.count();
    await runRollup({ nowTs: NOW, file: logFile });
    expect(await TrafficRollup.count()).toBe(before);
    expect(before).toBeGreaterThan(0);
  });

  test('a missing log writes nothing', async () => {
    expect(await runRollup({ nowTs: NOW, file: path.join(dir, 'none.log') })).toEqual({ hours: 0, rows: 0 });
  });
});

describe('readHistory', () => {
  const day = hourOf(NOW) - (hourOf(NOW) % DAY);
  const row = (hour_ts, scope_id, over = {}) => ({
    hour_ts, scope_id, requests: 10, status_2xx: 8, status_3xx: 0, status_4xx: 1, status_5xx: 1,
    bytes: 1000, bytes_in: 0, duration_sum_ms: 200, duration_count: 10, ...over,
  });

  test('sums hours into UTC days and keeps days without data as zero or unknown', async () => {
    await TrafficRollup.bulkCreate([
      row(day - DAY + 3 * HOUR, 'total'), row(day - DAY + 4 * HOUR, 'total'), row(day + HOUR, 'total'),
      row(day + HOUR, proxy.id, { requests: 4 }),
    ]);
    const all = await readHistory('30d', null, NOW);
    expect(all.series.requests).toHaveLength(30);
    expect(all.series.requests.slice(-2)).toEqual([20, 10]);
    expect(all.series.serverError[28]).toBe(2);
    expect(all.series.avgMs[28]).toBeCloseTo(20);
    expect(all.series.avgMs[0]).toBeNull();
    expect(all.totals).toMatchObject({ requests: 30, serverErrors: 3, bytes: 3000 });
    expect(all.coveredFrom).toBe(day - DAY + 3 * HOUR);

    const one = await readHistory('30d', proxy.id, NOW);
    expect(one.totals.requests).toBe(4);
  });

  test('reports no coverage when nothing is stored', async () => {
    const empty = await readHistory('90d', null, NOW);
    expect(empty.coveredFrom).toBeNull();
    expect(empty.series.requests).toHaveLength(90);
    expect(empty.totals.avgMs).toBeNull();
  });

  test('pruneRollups drops what is older than the retention', async () => {
    await TrafficRollup.bulkCreate([row(NOW - 500 * DAY, 'total'), row(NOW - DAY, 'total')]);
    expect(await pruneRollups(NOW)).toBe(1);
    expect(await TrafficRollup.count()).toBe(1);
  });

  test('isHistoryRange accepts only 30d and 90d', () => {
    expect(isHistoryRange('30d') && isHistoryRange('90d')).toBe(true);
    expect(isHistoryRange('7d') || isHistoryRange('toString') || isHistoryRange(null)).toBe(false);
  });
});
