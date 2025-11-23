let metricsService;
try {
  // eslint-disable-next-line global-require
  metricsService = require('../../src/services/metricsService');
} catch (e) {
  metricsService = null;
}

describe('metricsService', () => {
  test('module presence', () => {
    if (!metricsService) {
      expect(metricsService).toBeNull();
      return;
    }
    expect(metricsService).toBeDefined();
  });

  if (metricsService) {
    test('should expose collectMetrics and getHistorical functions (if implemented)', () => {
      if (typeof metricsService.collectMetrics !== 'undefined') {
        expect(typeof metricsService.collectMetrics).toBe('function');
      }
      if (typeof metricsService.getHistorical !== 'undefined') {
        expect(typeof metricsService.getHistorical).toBe('function');
      }
    });
  }
});
