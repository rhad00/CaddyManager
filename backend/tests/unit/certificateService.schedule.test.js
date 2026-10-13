/**
 * Certificate sync runs on a schedule (MODERNIZATION.md 0.20): it was implemented but never
 * started, so the certificate list and expiry dates only changed on a manual sync.
 */
jest.mock('../../src/models', () => ({ Certificate: {}, Proxy: {}, User: {} }));

const certificateService = require('../../src/services/certificateService');

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('syncs shortly after start and then every interval, surviving failures', async () => {
  const sync = jest.spyOn(certificateService, 'syncCertificates')
    .mockRejectedValueOnce(new Error('Caddy unreachable'))
    .mockResolvedValue({ synced: 0 });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const timer = certificateService.scheduleCertificateSync(6);

  await jest.advanceTimersByTimeAsync(60 * 1000);
  expect(sync).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
  expect(sync).toHaveBeenCalledTimes(2);

  clearInterval(timer);
});
