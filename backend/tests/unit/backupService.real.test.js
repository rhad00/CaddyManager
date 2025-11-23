const fs = require('fs');
const path = require('path');

jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Template: { findAll: jest.fn() },
  Backup: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() },
  Header: { destroy: jest.fn() },
  Middleware: { destroy: jest.fn() },
  User: { findOne: jest.fn() },
  sequelize: { transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }) }
}));

const { Proxy, Template, Backup } = require('../../src/models');
const backupService = require('../../src/services/backupService');

describe('BackupService.createBackup', () => {
  const tmpBackupDir = path.join(__dirname, '../../temp-backups');

  beforeAll(() => {
    // Ensure we don't actually write to the repo backups dir
    process.env.BACKUP_DIR = tmpBackupDir;
    if (!fs.existsSync(tmpBackupDir)) fs.mkdirSync(tmpBackupDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up temp files
    try {
      fs.rmdirSync(tmpBackupDir, { recursive: true });
    } catch (e) {}
  });

  afterEach(() => jest.clearAllMocks());

  test('creates a backup file and backup record', async () => {
    const fakeProxy = { toJSON: () => ({ id: 'p1', name: 'p1' }), headers: [], middlewares: [] };
    const fakeTemplate = { toJSON: () => ({ name: 't1' }) };
    Proxy.findAll.mockResolvedValue([fakeProxy]);
    Template.findAll.mockResolvedValue([fakeTemplate]);
    Backup.create.mockResolvedValue({ id: 'b1', filename: 'f', size: 10 });

    const res = await backupService.createBackup({ id: 'u1' }, 'manual');
    expect(res.success).toBe(true);
    expect(res.backup).toBeDefined();
    expect(Backup.create).toHaveBeenCalled();
    expect(fs.existsSync(res.filePath)).toBe(true);
  });
});
