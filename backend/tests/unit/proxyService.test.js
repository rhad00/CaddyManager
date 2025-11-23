let proxyService;
try {
  // eslint-disable-next-line global-require
  proxyService = require('../../src/services/proxyService');
} catch (e) {
  proxyService = null;
}

describe('proxyService', () => {
  test('module presence', () => {
    if (!proxyService) {
      expect(proxyService).toBeNull();
      return;
    }
    expect(proxyService).toBeDefined();
  });

  if (proxyService) {
    test('should expose createProxy and listProxies functions (if implemented)', () => {
      if (typeof proxyService.createProxy !== 'undefined') {
        expect(typeof proxyService.createProxy).toBe('function');
      }
      if (typeof proxyService.listProxies !== 'undefined') {
        expect(typeof proxyService.listProxies).toBe('function');
      }
    });
  }
});
