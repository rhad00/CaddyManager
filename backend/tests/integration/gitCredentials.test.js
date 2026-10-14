/**
 * Git credentials and secrets (MODERNIZATION.md 0.23b):
 * - the access token never lands in the clone's .git/config (it is sent per command);
 * - each provider gets the username its token auth expects;
 * - the Git export carries no basic-auth password hashes, and syncing such an export
 *   keeps the hash stored for the proxy.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-gitcred-'));
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.GIT_REPO_DIR = path.join(TMP, 'work');

jest.mock('../../src/services/caddyService', () => ({ rebuildConfigFromDatabase: jest.fn(), getCaddyConfig: jest.fn(async () => ({})) }));

const bcrypt = require('bcrypt');
const { simpleGit } = require('simple-git');
const { sequelize, Proxy, GitRepository } = require('../../src/models');
const { gitService } = require('../../src/services/gitService');

const REMOTE = path.join(TMP, 'remote.git');
const TOKEN = 'glpat-SECRET-TOKEN-1234';
const HASH = bcrypt.hashSync('correct horse', 4);

async function pushProxies(proxies) {
  const seed = path.join(TMP, `seed-${Date.now()}`);
  await simpleGit().clone(REMOTE, seed);
  const git = simpleGit(seed);
  await git.addConfig('user.name', 'test');
  await git.addConfig('user.email', 'test@example.com');
  fs.mkdirSync(path.join(seed, 'config'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'config/proxies.json'), JSON.stringify(proxies));
  await git.add('.');
  await git.commit(`proxies ${Date.now()}`);
  await git.push('origin', 'main');
}

beforeAll(async () => {
  await simpleGit().raw(['init', '--bare', '-b', 'main', REMOTE]);
  await pushProxies([{ name: 'app', domains: ['app.example.com'], upstream_url: 'http://app:80' }]);
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
  fs.rmSync(TMP, { recursive: true, force: true });
});

let counter = 0;
const makeRepo = (overrides = {}) => {
  counter += 1;
  return GitRepository.create({
    name: `repo-${counter}`,
    provider: 'gitlab',
    repository_url: `file://${REMOTE}`,
    branch: 'main',
    enabled: true,
    access_token: gitService.encrypt(TOKEN),
    ...overrides,
  });
};
const gitConfigOf = (repo) => fs.readFileSync(path.join(gitService.getRepoPath(repo.id), '.git/config'), 'utf8');

describe('access token', () => {
  test('is not written to the clone\'s .git/config', async () => {
    const repo = await makeRepo();
    await gitService.syncFromGit(repo.id);

    expect(gitConfigOf(repo)).not.toContain(TOKEN);
    expect(gitConfigOf(repo)).toContain(`url = file://${REMOTE}`);
  });

  test('is removed from clones made by older versions on the next update', async () => {
    const repo = await makeRepo();
    await gitService.syncFromGit(repo.id);
    // What older versions left behind: the token inside origin's URL
    const clone = simpleGit(gitService.getRepoPath(repo.id));
    await clone.remote(['set-url', 'origin', `https://${TOKEN}:x-oauth-basic@example.com/r.git`]);

    await gitService.cloneOrUpdateRepo(repo);

    expect(gitConfigOf(repo)).not.toContain(TOKEN);
    expect(gitConfigOf(repo)).toContain(`url = file://${REMOTE}`);
  });
});

describe('provider credentials', () => {
  test.each([
    ['github', 'x-access-token'],
    ['gitlab', 'oauth2'],
    ['gitea', 'oauth2'],
    ['bitbucket', 'x-token-auth'],
  ])('%s uses basic auth %s:<token>', async (provider, username) => {
    const env = gitService.authEnv({ provider, access_token: gitService.encrypt(TOKEN) });

    expect(env.GIT_CONFIG_KEY_0).toBe('http.extraHeader');
    const encoded = env.GIT_CONFIG_VALUE_0.replace('Authorization: Basic ', '');
    expect(Buffer.from(encoded, 'base64').toString()).toBe(`${username}:${TOKEN}`);
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  test('a repository without a token sends no credentials', () => {
    expect(gitService.authEnv({ provider: 'github', access_token: null })).not.toHaveProperty('GIT_CONFIG_COUNT');
  });
});

describe('password hashes', () => {
  test('the Git export leaves basic-auth hashes out', async () => {
    await Proxy.destroy({ where: {} });
    await Proxy.create({
      name: 'secure', domains: ['secure.example.com'], upstream_url: 'http://app:80',
      basic_auth: { enabled: true, username: 'admin', hashed_password: HASH },
    });
    const dir = path.join(TMP, 'export');
    fs.mkdirSync(dir, { recursive: true });

    await gitService.exportConfigToFile(dir);

    const exported = fs.readFileSync(path.join(dir, 'config/proxies.json'), 'utf8');
    expect(exported).not.toContain(HASH);
    expect(JSON.parse(exported)[0].basic_auth).toEqual({ enabled: true, username: 'admin' });
  });

  test('syncing an export without hashes keeps the stored hash of the same proxy', async () => {
    await Proxy.destroy({ where: {} });
    await Proxy.create({
      name: 'secure', domains: ['secure.example.com'], upstream_url: 'http://app:80',
      basic_auth: { enabled: true, username: 'admin', hashed_password: HASH },
    });
    await pushProxies([{ name: 'secure', domains: ['secure.example.com'], upstream_url: 'http://app:8080', basic_auth: { enabled: true, username: 'admin' } }]);
    const repo = await makeRepo({ access_token: null });

    await gitService.syncFromGit(repo.id);

    const [secure] = await Proxy.findAll();
    expect(secure.upstream_url).toBe('http://app:8080');
    expect(secure.basic_auth.hashed_password).toBe(HASH);
  });
});
