/**
 * Caddy config writes take the in-process mutex, and in cluster mode also the database lock, so
 * two workers cannot interleave their read-modify-write of the routes.
 */
const mockRelease = jest.fn().mockResolvedValue(undefined);
const mockAcquire = jest.fn();
jest.mock('../../src/utils/dbLock', () => ({ acquireDbLock: (...args) => mockAcquire(...args) }));
jest.mock('../../src/models', () => ({
  Proxy: {}, Header: {}, Middleware: {}, Certificate: {}, sequelize: {},
}));

const { caddyService } = require('../../src/services/caddyService');

beforeEach(() => {
  jest.clearAllMocks();
  mockAcquire.mockResolvedValue(mockRelease);
});
afterEach(() => { delete process.env.CLUSTER_MODE; });

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('a single process uses the in-process mutex only', async () => {
  const release = await caddyService.acquireConfigLock();
  release();
  expect(mockAcquire).not.toHaveBeenCalled();
});

test('cluster mode also takes the database lock and releases both', async () => {
  process.env.CLUSTER_MODE = 'true';

  const release = await caddyService.acquireConfigLock();
  expect(mockAcquire).toHaveBeenCalledWith('caddy-config');
  release();
  await flush();

  expect(mockRelease).toHaveBeenCalledTimes(1);
  // and the in-process mutex is free again
  const again = await caddyService.acquireConfigLock();
  again();
});

test('when the database lock cannot be had, the in-process mutex is not left held', async () => {
  process.env.CLUSTER_MODE = 'true';
  mockAcquire.mockRejectedValueOnce(new Error('Timed out waiting for lock'));

  await expect(caddyService.acquireConfigLock()).rejects.toThrow(/Timed out/);

  process.env.CLUSTER_MODE = 'false';
  const release = await caddyService.acquireConfigLock();
  release();
});

test('a failing database release does not become an unhandled rejection', async () => {
  process.env.CLUSTER_MODE = 'true';
  mockRelease.mockRejectedValueOnce(new Error('db gone'));

  const release = await caddyService.acquireConfigLock();
  release();
  await flush();
  // reaching this line without Jest reporting an unhandled rejection is the assertion
  expect(mockRelease).toHaveBeenCalled();
});
