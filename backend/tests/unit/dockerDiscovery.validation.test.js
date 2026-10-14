/**
 * Docker discovery (MODERNIZATION.md 0.16): label values are validated, and labels can
 * no longer retarget a proxy an admin already approved without a new review.
 */
jest.mock('dockerode', () => jest.fn());
jest.mock('../../src/models', () => ({
  DiscoveredService: { findOne: jest.fn(), create: jest.fn() },
  Proxy: { findByPk: jest.fn(), create: jest.fn() },
  Template: { findOne: jest.fn() },
}));
jest.mock('../../src/services/caddyService', () => ({ rebuildConfigFromDatabase: jest.fn() }));

const { DiscoveredService, Proxy } = require('../../src/models');
const caddyService = require('../../src/services/caddyService');
const discovery = require('../../src/services/dockerDiscoveryService');

const container = (labels = {}) => ({
  Id: 'abcdef1234567890',
  Names: ['/web'],
  State: 'running',
  Labels: { 'caddymanager.enable': 'true', 'caddymanager.domain': 'web.example.com', 'caddymanager.port': '3000', ...labels },
  NetworkSettings: { Networks: { app: { NetworkID: 'n1', IPAddress: '172.18.0.5' } } },
});

const handle = (c) => discovery.createOrUpdateProxy(c, discovery.parseContainerLabels(c));

beforeEach(() => {
  jest.clearAllMocks();
  DiscoveredService.findOne.mockResolvedValue(null);
  DiscoveredService.create.mockImplementation(async (data) => ({ ...data, save: jest.fn() }));
  Proxy.create.mockResolvedValue({ id: 'p-new' });
});

describe('label validation', () => {
  test.each([
    ['an invalid domain', { 'caddymanager.domain': 'bad domain' }],
    ['a non-numeric port', { 'caddymanager.port': '80/admin' }],
    ['a port out of range', { 'caddymanager.port': '70000' }],
    ['an unknown ssl type', { 'caddymanager.ssl': 'letsencrypt' }],
  ])('skips a container with %s', async (_label, labels) => {
    await handle(container(labels));

    expect(DiscoveredService.create).not.toHaveBeenCalled();
    expect(Proxy.create).not.toHaveBeenCalled();
  });

  test('creates a disabled proxy for valid labels', async () => {
    await handle(container());

    expect(Proxy.create).toHaveBeenCalledWith(expect.objectContaining({
      domains: ['web.example.com'],
      upstream_url: 'http://web:3000',
      status: 'disabled',
    }));
  });
});

describe('label changes on an approved proxy', () => {
  const approved = (overrides = {}) => ({
    id: 'p1',
    domains: ['web.example.com'],
    upstream_url: 'http://web:3000',
    status: 'active',
    compression_enabled: true, // the model default
    save: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    DiscoveredService.findOne.mockResolvedValue({ proxy_id: 'p1', save: jest.fn() });
  });

  test('a new domain sends the proxy back to review instead of going live', async () => {
    const proxy = approved();
    Proxy.findByPk.mockResolvedValue(proxy);

    await handle(container({ 'caddymanager.domain': 'bank.example.com' }));

    expect(proxy.domains).toEqual(['bank.example.com']);
    expect(proxy.status).toBe('disabled');
    expect(proxy.save).toHaveBeenCalled();
    expect(caddyService.rebuildConfigFromDatabase).toHaveBeenCalled();
  });

  test('a new port (upstream) also needs a new review', async () => {
    const proxy = approved();
    Proxy.findByPk.mockResolvedValue(proxy);

    await handle(container({ 'caddymanager.port': '8080' }));

    expect(proxy.status).toBe('disabled');
  });

  test('unchanged domain and upstream keep the proxy active', async () => {
    const proxy = approved();
    Proxy.findByPk.mockResolvedValue(proxy);

    await handle(container({ 'caddymanager.compression': 'false' }));

    expect(proxy.status).toBe('active');
    expect(proxy.compression_enabled).toBe(false);
  });
});
