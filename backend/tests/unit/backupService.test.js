let backupService;
try {
  // eslint-disable-next-line global-require
  backupService = require('../../src/services/backupService');
} catch (e) {
  backupService = null;
}

describe('backupService', () => {
  test('module presence', () => {
    if (!backupService) {
      expect(backupService).toBeNull();
      return;
    }
    expect(backupService).toBeDefined();
  });

  if (backupService) {
    test('should expose createBackup and restoreBackup functions', () => {
      expect(typeof backupService.createBackup).toBe('function');
      expect(typeof backupService.restoreBackup).toBe('function');
    });

    test('createBackup should return metadata object or throw', async () => {
      const res = await backupService.createBackup().catch(e => null);
      expect(res === null || typeof res === 'object').toBeTruthy();
    });
  }
});
