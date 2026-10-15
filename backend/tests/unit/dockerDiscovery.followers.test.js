/**
 * In cluster mode only the leader watches Docker, but any worker can answer a request: a
 * follower connects to Docker on demand instead of answering "not initialized".
 */
const mockPing = jest.fn();
const mockInspect = jest.fn();
jest.mock('dockerode', () => jest.fn(() => ({
  ping: mockPing,
  getContainer: () => ({ inspect: mockInspect }),
  listContainers: jest.fn().mockResolvedValue([]),
})));
jest.mock('../../src/models', () => ({
  DiscoveredService: { findOne: jest.fn(), create: jest.fn() },
  Proxy: {}, Template: {}, Header: {}, Middleware: {},
}));
jest.mock('../../src/services/caddyService', () => ({ caddyService: {} }));
jest.mock('../../src/services/securityHeadersService', () => ({}));

const { DockerDiscoveryService } = require('../../src/services/dockerDiscoveryService');

describe('ensureInitialized', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPing.mockResolvedValue('OK');
    service = new DockerDiscoveryService();
  });
  afterEach(() => { delete process.env.ENABLE_DOCKER_DISCOVERY; });

  test('connects on demand when discovery is enabled', async () => {
    process.env.ENABLE_DOCKER_DISCOVERY = 'true';
    expect(service.initialized).toBe(false);

    expect(await service.ensureInitialized()).toBe(true);
    expect(service.initialized).toBe(true);
    expect(service.eventStream).toBeNull(); // the watcher stays with the leader
  });

  test('connects once', async () => {
    process.env.ENABLE_DOCKER_DISCOVERY = 'true';
    await service.ensureInitialized();
    await service.ensureInitialized();
    expect(mockPing).toHaveBeenCalledTimes(1);
  });

  test('stays off when discovery is disabled', async () => {
    expect(await service.ensureInitialized()).toBe(false);
    expect(mockPing).not.toHaveBeenCalled();
  });

  test('reports a Docker that cannot be reached', async () => {
    process.env.ENABLE_DOCKER_DISCOVERY = 'true';
    mockPing.mockRejectedValue(new Error('no socket'));
    expect(await service.ensureInitialized()).toBe(false);
  });

  test('syncContainer works on a worker that did not start the watcher', async () => {
    process.env.ENABLE_DOCKER_DISCOVERY = 'true';
    mockInspect.mockResolvedValue({ Id: 'abc', Name: '/x', State: { Running: true }, Config: { Labels: {} } });
    // it gets as far as reading the labels, i.e. past "Docker not initialized"
    await expect(service.syncContainer('abc')).rejects.toThrow(/caddymanager.enable/);
  });
});
