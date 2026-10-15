/**
 * Uploading a backup file: it is validated like a restore would, stored as a normal backup of
 * this installation (re-encrypted with the local key if one is set) and can then be restored.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-upload-'));
process.env.BACKUP_UPLOAD_MAX_MB = '1';
delete process.env.BACKUP_ENCRYPTION_KEY;

jest.mock('../../src/services/caddyService', () => ({ caddyService: { rebuildConfigFromDatabase: jest.fn() } }));
// the allowance is not under test here; the limiter would only count this file's requests
jest.mock('express-rate-limit', () => ({ rateLimit: () => (_req, _res, next) => next() }));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: null, role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { sequelize, Proxy, Backup } = require('../../src/models');
const { backupService } = require('../../src/services/backupService');
const { router } = require('../../src/api/backups/routes');

const app = express();
app.use(express.json());
app.use('/api/backups', router);

const proxy = { name: 'uploaded-app', domains: ['up.example.com'], upstream_url: 'http://app:8080', ssl_type: 'none', status: 'active' };
const backupJson = (over = {}) => JSON.stringify({ version: '1.0', proxies: [proxy], templates: [], ...over });
const upload = (content, filename = 'backup.json') => request(app).post('/api/backups/upload').attach('file', Buffer.from(content), filename);

beforeAll(async () => { await sequelize.sync({ force: true }); });
afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
  fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true });
});
beforeEach(async () => {
  await Backup.destroy({ where: {} });
  await Proxy.destroy({ where: {} });
  for (const f of fs.readdirSync(process.env.BACKUP_DIR)) fs.rmSync(path.join(process.env.BACKUP_DIR, f));
  delete process.env.BACKUP_ENCRYPTION_KEY;
});

test('a valid backup becomes a stored backup that can be restored', async () => {
  const res = await upload(backupJson());

  expect(res.status).toBe(201);
  expect(res.body.backup).toMatchObject({ status: 'complete', backup_type: 'manual' });
  expect(fs.existsSync(path.join(process.env.BACKUP_DIR, res.body.backup.filename))).toBe(true);
  // the stored name is generated here, never taken from the upload
  expect(res.body.backup.filename).toMatch(/^backup-[\w-]+\.json$/);

  await backupService.restoreBackup(res.body.backup.id, { id: null });
  expect((await Proxy.findAll()).map((p) => p.name)).toEqual(['uploaded-app']);
});

test('a client-chosen file name cannot reach the file system', async () => {
  const res = await upload(backupJson(), '../../etc/evil.json');

  expect(res.status).toBe(201);
  expect(res.body.backup.filename).not.toMatch(/[\\/]/);
  expect(fs.readdirSync(process.env.BACKUP_DIR)).toEqual([res.body.backup.filename]);
});

test.each([
  ['not JSON', 'this is not json'],
  ['without proxies', JSON.stringify({ version: '1.0', templates: [] })],
  ['without a version', JSON.stringify({ proxies: [], templates: [] })],
])('rejects a file that is %s', async (_name, content) => {
  const res = await upload(content);

  expect(res.status).toBe(400);
  expect(await Backup.count()).toBe(0);
  expect(fs.readdirSync(process.env.BACKUP_DIR)).toEqual([]);
});

test('rejects proxies that fail the API validation, with the reasons', async () => {
  const res = await upload(backupJson({ proxies: [{ ...proxy, upstream_url: 'ftp://nope' }] }));

  expect(res.status).toBe(400);
  expect(res.body.errors).toBeDefined();
  expect(await Backup.count()).toBe(0);
});

test('answers 400 when no file is sent', async () => {
  const res = await request(app).post('/api/backups/upload');
  expect(res.status).toBe(400);
});

test('answers 413 when the file is larger than the limit', async () => {
  const res = await upload('x'.repeat(2 * 1024 * 1024));
  expect(res.status).toBe(413);
});

describe('encrypted backups', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const encrypt = (plain, hexKey) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv);
    const body = Buffer.concat([cipher.update(Buffer.from(plain)), cipher.final()]);
    return Buffer.concat([Buffer.from('CMEK'), iv, cipher.getAuthTag(), body]);
  };

  test('is accepted with the matching key and stored encrypted again', async () => {
    process.env.BACKUP_ENCRYPTION_KEY = key;
    const res = await request(app).post('/api/backups/upload').attach('file', encrypt(backupJson(), key), 'b.json.enc');

    expect(res.status).toBe(201);
    expect(res.body.backup.filename).toMatch(/\.json\.enc$/);
    await backupService.restoreBackup(res.body.backup.id, { id: null });
    expect(await Proxy.count()).toBe(1);
  });

  test('is refused without the key, saying why', async () => {
    const res = await request(app).post('/api/backups/upload').attach('file', encrypt(backupJson(), key), 'b.json.enc');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/BACKUP_ENCRYPTION_KEY/);
  });

  test('is refused with the wrong key', async () => {
    process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    const res = await request(app).post('/api/backups/upload').attach('file', encrypt(backupJson(), key), 'b.json.enc');

    expect(res.status).toBe(400);
    expect(await Backup.count()).toBe(0);
  });
});
