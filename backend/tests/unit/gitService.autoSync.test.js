/**
 * Auto-sync is one loop owned by the leader that reads the repositories from the database, so a
 * repository created, edited, disabled or deleted through any worker is picked up (or dropped)
 * on the next tick. It used to start a never-stopped interval per create/update call.
 */
jest.mock('simple-git', () => ({ simpleGit: jest.fn() }));
jest.mock('../../src/models', () => ({
  GitRepository: { findAll: jest.fn() },
  ConfigChange: {},
  Proxy: {}, Header: {}, Middleware: {},
  sequelize: {},
}));
jest.mock('../../src/services/caddyService', () => ({ caddyService: {} }));

const { GitRepository } = require('../../src/models');
const { gitService } = require('../../src/services/gitService');

const repo = (over = {}) => ({ id: 'r1', name: 'infra', sync_interval: 300, enabled: true, auto_sync: true, ...over });

describe('gitService.runDueSyncs', () => {
  let sync;

  beforeEach(() => {
    jest.clearAllMocks();
    gitService.autoSyncLastRun.clear();
    sync = jest.spyOn(gitService, 'syncFromGit').mockResolvedValue({ synced: false });
    GitRepository.findAll.mockResolvedValue([repo()]);
  });
  afterEach(() => jest.restoreAllMocks());

  test('only asks for enabled auto-sync repositories', async () => {
    await gitService.runDueSyncs(1000);
    expect(GitRepository.findAll).toHaveBeenCalledWith({ where: { enabled: true, auto_sync: true } });
  });

  test('syncs a repository the first time it is seen', async () => {
    await gitService.runDueSyncs(1000);
    expect(sync).toHaveBeenCalledWith('r1');
  });

  test('waits for the repository interval before syncing again', async () => {
    await gitService.runDueSyncs(0);
    await gitService.runDueSyncs(299 * 1000);
    expect(sync).toHaveBeenCalledTimes(1);

    await gitService.runDueSyncs(300 * 1000);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  test('uses the interval as currently stored, not the one from when it was created', async () => {
    await gitService.runDueSyncs(0);
    GitRepository.findAll.mockResolvedValue([repo({ sync_interval: 60 })]);
    await gitService.runDueSyncs(61 * 1000);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  test('a failing repository does not stop the others and is retried after its interval', async () => {
    GitRepository.findAll.mockResolvedValue([repo({ id: 'bad' }), repo({ id: 'good' })]);
    sync.mockImplementation(async (id) => { if (id === 'bad') throw new Error('network'); return { synced: true }; });

    await gitService.runDueSyncs(0);

    expect(sync).toHaveBeenCalledWith('bad');
    expect(sync).toHaveBeenCalledWith('good');
    await gitService.runDueSyncs(10 * 1000);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  test('forgets repositories that are gone', async () => {
    await gitService.runDueSyncs(0);
    GitRepository.findAll.mockResolvedValue([]);
    await gitService.runDueSyncs(1000);
    expect(gitService.autoSyncLastRun.size).toBe(0);
  });
});

describe('gitService auto-sync loop', () => {
  afterEach(() => { gitService.stopAutoSync(); jest.useRealTimers(); jest.restoreAllMocks(); });

  test('starts once however often it is asked to, and stops', () => {
    jest.useFakeTimers();
    const due = jest.spyOn(gitService, 'runDueSyncs').mockResolvedValue(undefined);

    gitService.startAutoSync(1000);
    gitService.startAutoSync(1000);
    jest.advanceTimersByTime(3000);
    expect(due).toHaveBeenCalledTimes(3);

    gitService.stopAutoSync();
    jest.advanceTimersByTime(3000);
    expect(due).toHaveBeenCalledTimes(3);
  });
});
