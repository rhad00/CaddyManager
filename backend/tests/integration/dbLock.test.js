/**
 * The lock that serializes Caddy config writes across cluster workers (each worker is a
 * separate process, so the in-process mutex cannot).
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const { sequelize, ConfigLock } = require('../../src/models');
const { acquireDbLock } = require('../../src/utils/dbLock');

beforeAll(async () => { await sequelize.sync({ force: true }); });
afterAll(async () => { try { await sequelize.close(); } catch { /* already closed */ } });
beforeEach(async () => { await ConfigLock.destroy({ where: {} }); });

const fast = { retryMs: 5, timeoutMs: 1000, ttlMs: 60000 };

test('a second holder waits until the first releases', async () => {
  const order = [];
  const first = await acquireDbLock('caddy-config', fast);

  const secondDone = acquireDbLock('caddy-config', fast).then(async (release) => {
    order.push('second');
    await release();
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  order.push('first releases');
  await first();
  await secondDone;

  expect(order).toEqual(['first releases', 'second']);
});

test('different names do not block each other', async () => {
  const a = await acquireDbLock('a', fast);
  const b = await acquireDbLock('b', fast);
  await a();
  await b();
});

test('gives up with an error after the timeout', async () => {
  const held = await acquireDbLock('caddy-config', fast);

  await expect(acquireDbLock('caddy-config', { ...fast, timeoutMs: 40 })).rejects.toThrow(/timed out/i);

  await held();
});

test('takes over a lock whose holder died (expired)', async () => {
  await ConfigLock.create({ name: 'caddy-config', owner: 'dead-worker', expires_at: new Date(Date.now() - 1000) });

  const release = await acquireDbLock('caddy-config', fast);
  await release();

  expect(await ConfigLock.count()).toBe(0);
});

test('releasing twice, or after a takeover, does not free someone else\'s lock', async () => {
  const slow = await acquireDbLock('caddy-config', { ...fast, ttlMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const taker = await acquireDbLock('caddy-config', fast); // expired, taken over

  await slow(); // the old holder wakes up late

  expect(await ConfigLock.count()).toBe(1);
  await taker();
  await taker();
  expect(await ConfigLock.count()).toBe(0);
});

test('many contenders run one at a time', async () => {
  let inside = 0;
  let maxInside = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    const release = await acquireDbLock('caddy-config', { ...fast, timeoutMs: 5000 });
    inside += 1;
    maxInside = Math.max(maxInside, inside);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inside -= 1;
    await release();
  }));
  expect(maxInside).toBe(1);
});
