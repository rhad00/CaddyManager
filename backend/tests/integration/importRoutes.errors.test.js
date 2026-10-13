/**
 * A refused import (MODERNIZATION.md 0.16) reaches the admin as a 400 naming the invalid
 * entries, not as a generic 500.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { id: null, role: 'admin' }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));
jest.mock('../../src/services/backupService', () => ({ restoreBackup: jest.fn() }));
jest.mock('../../src/services/gitService', () => ({ syncFromGit: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { sequelize, GitRepository } = require('../../src/models');
const backupService = require('../../src/services/backupService');
const gitService = require('../../src/services/gitService');
const { ProxyImportError } = require('../../src/utils/proxyImport');

const app = express();
app.use(express.json());
app.use('/api/backups', require('../../src/api/backups/routes'));
app.use('/api/git', require('../../src/api/git/routes'));

const refused = () => new ProxyImportError(['#1 "metadata": Upstream URL points to a restricted address']);

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
});

test('backup restore answers 400 with the invalid entries', async () => {
  backupService.restoreBackup.mockRejectedValue(refused());

  const res = await request(app).post('/api/backups/some-id/restore');

  expect(res.status).toBe(400);
  expect(res.body.errors).toEqual(['#1 "metadata": Upstream URL points to a restricted address']);
});

test('backup restore passes on the Caddy outcome in its message', async () => {
  backupService.restoreBackup.mockResolvedValue({
    success: true,
    message: 'Backup restored, but applying it to Caddy failed',
    caddy: { applied: false, error: 'connect ECONNREFUSED' },
  });

  const res = await request(app).post('/api/backups/some-id/restore');

  expect(res.status).toBe(200);
  expect(res.body.message).toBe('Backup restored, but applying it to Caddy failed');
});

test('Git sync answers 400 with the invalid entries', async () => {
  const repo = await GitRepository.create({ name: 'gitops', repository_url: 'https://example.com/r.git', provider: 'generic', auth_type: 'none' })
    .catch(() => null);
  gitService.syncFromGit.mockRejectedValue(refused());

  const res = await request(app).post(`/api/git/repositories/${repo ? repo.id : 'missing'}/sync`);

  expect(repo).not.toBeNull();
  expect(res.status).toBe(400);
  expect(res.body.errors).toHaveLength(1);
});
