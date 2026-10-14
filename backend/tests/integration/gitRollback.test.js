/**
 * GitOps rollback applies the configuration of the chosen commit and stays applied
 * (MODERNIZATION.md 0.22). Uses a real local Git repository (file:// remote) and SQLite.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-gitops-'));
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.GIT_REPO_DIR = path.join(TMP, 'work');

jest.mock('../../src/services/caddyService', () => ({ rebuildConfigFromDatabase: jest.fn(), getCaddyConfig: jest.fn(async () => ({})) }));

const simpleGit = require('simple-git');
const { sequelize, Proxy, GitRepository } = require('../../src/models');
const gitService = require('../../src/services/gitService');

const REMOTE = path.join(TMP, 'remote.git');
const SEED = path.join(TMP, 'seed');
const proxiesFile = (name) => JSON.stringify([{ name, domains: [`${name}.example.com`], upstream_url: 'http://app:80' }]);

let sha1;
let sha2;

async function commitConfig(git, name) {
  fs.mkdirSync(path.join(SEED, 'config'), { recursive: true });
  fs.writeFileSync(path.join(SEED, 'config/proxies.json'), proxiesFile(name));
  await git.add('.');
  await git.commit(`config ${name}`);
  return (await git.revparse(['HEAD'])).trim();
}

beforeAll(async () => {
  await simpleGit().raw(['init', '--bare', '-b', 'main', REMOTE]);
  fs.mkdirSync(SEED);
  const seed = simpleGit(SEED);
  await seed.raw(['init', '-b', 'main']);
  await seed.addConfig('user.name', 'test');
  await seed.addConfig('user.email', 'test@example.com');
  sha1 = await commitConfig(seed, 'version-one');
  sha2 = await commitConfig(seed, 'version-two');
  await seed.addRemote('origin', REMOTE);
  await seed.push('origin', 'main');
  // A commit that is not on the tracked branch
  await seed.checkoutLocalBranch('elsewhere');
  await commitConfig(seed, 'other-branch');
  await seed.push('origin', 'elsewhere');

  await sequelize.sync({ force: true });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
  fs.rmSync(TMP, { recursive: true, force: true });
});

let counter = 0;
async function makeRepo(autoCommit) {
  counter += 1;
  return GitRepository.create({
    name: `repo-${counter}`,
    provider: 'gitea',
    repository_url: `file://${REMOTE}`,
    branch: 'main',
    enabled: true,
    auto_commit: autoCommit,
  });
}

const proxyNames = async () => (await Proxy.findAll()).map((p) => p.name);

test('rollback applies the chosen commit and the next sync does not undo it', async () => {
  const repo = await makeRepo(false);
  await gitService.syncFromGit(repo.id);
  expect(await proxyNames()).toEqual(['version-two']);

  const result = await gitService.rollbackToCommit(repo.id, sha1.slice(0, 7));

  expect(result).toMatchObject({ success: true, commit: sha1, proxies: 1 });
  expect(await proxyNames()).toEqual(['version-one']);
  await repo.reload();
  expect(repo.last_commit_sha).toBe(sha2); // recorded as seen, so auto-sync leaves it
  expect(await gitService.syncFromGit(repo.id)).toMatchObject({ synced: false });
  expect(await proxyNames()).toEqual(['version-one']);
});

test('with auto-commit, the rollback is committed and pushed so Git matches the database', async () => {
  const repo = await makeRepo(true);
  await gitService.syncFromGit(repo.id);

  const result = await gitService.rollbackToCommit(repo.id, sha1);

  const remote = simpleGit(REMOTE);
  const head = (await remote.revparse(['main'])).trim();
  expect(result.recorded_as).toBe(head);
  expect((await remote.raw(['log', '-1', '--format=%s', 'main']))).toMatch(/Rollback to/);
  const restored = JSON.parse(await remote.show([`${head}:config/proxies.json`]));
  expect(restored.map((p) => p.name)).toEqual(['version-one']);
});

test.each([
  ['an unknown commit', 'deadbeefdeadbeef'],
  ['a commit that is not on the branch', null],
  ['an option instead of a SHA', '--output=/tmp/x'],
])('refuses %s without changing anything', async (_label, sha) => {
  const repo = await makeRepo(false);
  await gitService.syncFromGit(repo.id);
  const target = sha ?? (await simpleGit(REMOTE).revparse(['elsewhere'])).trim();
  const before = await proxyNames();

  await expect(gitService.rollbackToCommit(repo.id, target)).rejects.toMatchObject({ name: 'GitRollbackError' });
  expect(await proxyNames()).toEqual(before);
});
