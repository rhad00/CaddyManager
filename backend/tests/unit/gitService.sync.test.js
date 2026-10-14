/**
 * GitOps sync must push the synced proxies to Caddy (MODERNIZATION.md 0.18): it used to
 * call a non-existent caddyService.updateCaddyConfig(), so nothing reached Caddy.
 */
jest.mock('simple-git', () => jest.fn(() => ({ log: jest.fn().mockResolvedValue({ latest: { hash: 'abc1234' } }) })));
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue(JSON.stringify([{ name: 'from-git', domains: ['git.example.com'], upstream_url: 'http://app:80' }])),
  },
}));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), finished: undefined };
mockTransaction.commit.mockImplementation(async () => { mockTransaction.finished = 'commit'; });
jest.mock('../../src/models', () => ({
  GitRepository: { findByPk: jest.fn() },
  ConfigChange: {},
  Proxy: { destroy: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'p1' }), findAll: jest.fn().mockResolvedValue([]) },
  Header: { create: jest.fn() },
  Middleware: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async () => mockTransaction) },
}));
jest.mock('../../src/services/caddyService', () => ({ rebuildConfigFromDatabase: jest.fn() }));

const { GitRepository } = require('../../src/models');
const caddyService = require('../../src/services/caddyService');
const gitService = require('../../src/services/gitService');

describe('gitService.syncFromGit', () => {
  let repo;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.finished = undefined;
    repo = { id: 'r1', last_commit_sha: 'old', save: jest.fn() };
    GitRepository.findByPk.mockResolvedValue(repo);
    jest.spyOn(gitService, 'cloneOrUpdateRepo').mockResolvedValue('/tmp/repo');
  });

  test('pushes the synced proxies to Caddy and records the commit', async () => {
    const result = await gitService.syncFromGit('r1');

    expect(result).toMatchObject({ synced: true, commit: 'abc1234', proxies: 1 });
    expect(caddyService.rebuildConfigFromDatabase).toHaveBeenCalledTimes(1);
    expect(repo.last_commit_sha).toBe('abc1234');
  });

  // MODERNIZATION.md 0.16: repository content gets the same validation as the API
  test('an invalid proxy in the repository refuses the whole sync before deleting anything', async () => {
    const fs = require('fs').promises;
    fs.readFile.mockResolvedValueOnce(JSON.stringify([
      { name: 'ok', domains: ['ok.example.com'], upstream_url: 'http://app:80' },
      { name: 'metadata', domains: ['meta.example.com'], upstream_url: 'http://169.254.169.254' },
    ]));
    const { Proxy } = require('../../src/models');

    await expect(gitService.syncFromGit('r1')).rejects.toThrow(/#2 "metadata".*restricted/);
    expect(Proxy.destroy).not.toHaveBeenCalled();
    expect(caddyService.rebuildConfigFromDatabase).not.toHaveBeenCalled();
    expect(repo.last_commit_sha).toBe('old');
  });

  test('creates proxies from the whitelisted fields only', async () => {
    const fs = require('fs').promises;
    fs.readFile.mockResolvedValueOnce(JSON.stringify([
      { id: 'forced-id', created_by: 'attacker', caddy_route_index: 0, name: 'app', domains: ['app.example.com'], upstream_url: 'http://app:80' },
    ]));
    const { Proxy } = require('../../src/models');

    await gitService.syncFromGit('r1');

    expect(Proxy.create).toHaveBeenCalledWith(
      { name: 'app', domains: ['app.example.com'], upstream_url: 'http://app:80' },
      expect.anything()
    );
  });

  test('a Caddy failure surfaces its own error and leaves the commit to be retried', async () => {
    caddyService.rebuildConfigFromDatabase.mockRejectedValue(new Error('Failed to rebuild configuration: invalid handler'));

    await expect(gitService.syncFromGit('r1')).rejects.toThrow(/invalid handler/);
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
    expect(repo.last_commit_sha).toBe('old');
  });
});
