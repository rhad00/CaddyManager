/**
 * Backup restore (MODERNIZATION.md 0.16): restored proxies pass the API's validation,
 * keep every field the API accepts, and are pushed to Caddy.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-backup-'));
delete process.env.BACKUP_ENCRYPTION_KEY;

jest.mock('../../src/services/caddyService', () => ({ rebuildConfigFromDatabase: jest.fn() }));

const bcrypt = require('bcrypt');
const { sequelize, Proxy, Header, Backup } = require('../../src/models');
const caddyService = require('../../src/services/caddyService');
const backupService = require('../../src/services/backupService');

const HASH = bcrypt.hashSync('correct horse', 4);
const user = { id: null };

const fullProxy = {
  name: 'full-app',
  domains: ['full.example.com'],
  upstream_url: 'http://app:8080',
  ssl_type: 'acme',
  status: 'active',
  basic_auth: { enabled: true, username: 'admin', hashed_password: HASH },
  load_balancing: { enabled: true, policy: 'round_robin', upstreams: [{ url: 'http://app1:80' }, { url: 'http://app2:80' }] },
  health_checks: { enabled: true, path: '/healthz', interval: '10s', timeout: '2s' },
};

/** Write a backup file by hand, as someone with access to the backup directory could. */
async function writeBackup(proxies) {
  const filename = `backup-manual-${Date.now()}.json`;
  fs.writeFileSync(path.join(process.env.BACKUP_DIR, filename), JSON.stringify({ version: '1.0', proxies, templates: [] }));
  return Backup.create({ filename, size: 1, backup_type: 'manual', status: 'complete' });
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
  fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  jest.clearAllMocks();
  caddyService.rebuildConfigFromDatabase.mockResolvedValue();
  await Header.destroy({ where: {} });
  await Proxy.destroy({ where: {} });
});

test('a backup round-trip keeps every proxy feature and pushes the result to Caddy', async () => {
  const original = await Proxy.create(fullProxy);
  await Header.create({ proxy_id: original.id, header_type: 'request', header_name: 'X-App', header_value: 'one', enabled: true });
  const { backup } = await backupService.createBackup(user);
  await Proxy.destroy({ where: {} });

  const result = await backupService.restoreBackup(backup.id, user);

  expect(result.success).toBe(true);
  const [restored] = await Proxy.findAll({ include: [{ model: Header, as: 'headers' }] });
  expect(restored.basic_auth).toEqual(fullProxy.basic_auth);
  expect(restored.load_balancing).toEqual(fullProxy.load_balancing);
  expect(restored.health_checks).toEqual(fullProxy.health_checks);
  expect(restored.headers.map((h) => h.header_name)).toEqual(['X-App']);
  expect(caddyService.rebuildConfigFromDatabase).toHaveBeenCalledTimes(1);
});

test('a backup with a restricted upstream is refused and the current proxies stay', async () => {
  await Proxy.create(fullProxy);
  const backup = await writeBackup([{ ...fullProxy, name: 'metadata', upstream_url: 'http://169.254.169.254' }]);

  await expect(backupService.restoreBackup(backup.id, user)).rejects.toThrow(/"metadata".*restricted/);

  expect((await Proxy.findAll()).map((p) => p.name)).toEqual(['full-app']);
  expect(caddyService.rebuildConfigFromDatabase).not.toHaveBeenCalled();
});

test('a Caddy failure after the restore is reported without undoing the restore', async () => {
  const backup = await writeBackup([fullProxy]);
  caddyService.rebuildConfigFromDatabase.mockRejectedValue(new Error('Failed to rebuild configuration: connect ECONNREFUSED'));

  const result = await backupService.restoreBackup(backup.id, user);

  expect(result.success).toBe(true);
  expect(result.caddy).toEqual({ applied: false, error: expect.stringMatching(/ECONNREFUSED/) });
  expect(await Proxy.count()).toBe(1);
});
