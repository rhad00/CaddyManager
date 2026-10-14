/**
 * Docker discovery against what the Docker API really returns (MODERNIZATION.md 0.24):
 * inspect results keep labels in Config.Labels and the name in Name; events (API 1.55)
 * carry Action and Actor.ID, not status and id. Labels map onto proxy features.
 */
jest.mock('dockerode', () => jest.fn());
jest.mock('../../src/models', () => ({
  DiscoveredService: { findOne: jest.fn(), create: jest.fn() },
  Proxy: { findByPk: jest.fn(), create: jest.fn() },
  Template: { findOne: jest.fn() },
  Header: { create: jest.fn(), bulkCreate: jest.fn() },
}));
jest.mock('../../src/services/caddyService', () => ({ rebuildConfigFromDatabase: jest.fn() }));
jest.mock('../../src/services/securityHeadersService', () => ({ applySecurityHeaders: jest.fn() }));

const { DiscoveredService, Proxy, Template, Header } = require('../../src/models');
const securityHeadersService = require('../../src/services/securityHeadersService');
const discovery = require('../../src/services/dockerDiscoveryService');

// Shape of `docker inspect` (trimmed), as returned by Docker API 1.55
const inspected = (labels = {}) => ({
  Id: 'f00dfeedcafe0123456789',
  Name: '/web',
  State: { Status: 'running', Running: true },
  Config: {
    Labels: {
      'caddymanager.enable': 'true',
      'caddymanager.domain': 'web.example.com',
      'caddymanager.port': '3000',
      'org.opencontainers.image.title': 'Web',
      ...labels,
    },
  },
  NetworkSettings: { Networks: { app: { NetworkID: 'n1', IPAddress: '172.18.0.5' } } },
});

const handle = (c) => discovery.createOrUpdateProxy(c, discovery.parseContainerLabels(c));

beforeEach(() => {
  jest.clearAllMocks();
  DiscoveredService.findOne.mockResolvedValue(null);
  DiscoveredService.create.mockImplementation(async (data) => ({ ...data, save: jest.fn() }));
  Proxy.create.mockResolvedValue({ id: 'p-new' });
  Template.findOne.mockResolvedValue(null);
});

describe('inspect results', () => {
  test('labels are read from Config.Labels', () => {
    expect(discovery.parseContainerLabels(inspected())).toMatchObject({ domain: 'web.example.com', port: '3000' });
  });

  test('a discovered container becomes a disabled proxy named after it', async () => {
    await handle(inspected());

    expect(Proxy.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Auto: web',
      domains: ['web.example.com'],
      upstream_url: 'http://web:3000',
      status: 'disabled',
    }));
    expect(Proxy.create.mock.calls[0][0]).not.toHaveProperty('websocket_enabled');
    expect(DiscoveredService.create).toHaveBeenCalledWith(expect.objectContaining({
      source_name: 'web',
      labels: expect.objectContaining({ 'caddymanager.domain': 'web.example.com' }),
      status: 'active',
    }));
  });
});

describe('labels map onto proxy features', () => {
  test('rate limit, IP filter, path prefix and security headers', async () => {
    await handle(inspected({
      'caddymanager.rate_limit': '50',
      'caddymanager.ip_filter': '10.0.0.0/8, 192.168.1.10',
      'caddymanager.path_prefix': '/api',
      'caddymanager.security_headers': 'true',
    }));

    expect(Proxy.create).toHaveBeenCalledWith(expect.objectContaining({
      rate_limit: { enabled: true, requests_per_second: 50 },
      ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.0.0.0/8', '192.168.1.10'] },
      path_routing: { enabled: true, routes: [
        { path: '/api', upstream_url: 'http://web:3000' },
        { path: '/api/*', upstream_url: 'http://web:3000' },
      ] },
      security_headers_enabled: true,
    }));
    expect(securityHeadersService.applySecurityHeaders).toHaveBeenCalledWith('p-new', Header);
  });

  test.each([
    ['a non-numeric rate limit', { 'caddymanager.rate_limit': 'lots' }],
    ['an invalid IP filter entry', { 'caddymanager.ip_filter': '10.0.0.0/8,not-an-ip' }],
    ['a path prefix with odd characters', { 'caddymanager.path_prefix': '/api;rm' }],
  ])('skips a container with %s', async (_label, labels) => {
    await handle(inspected(labels));
    expect(Proxy.create).not.toHaveBeenCalled();
  });

  test('a template label copies the template headers and the proxy is still linked', async () => {
    Template.findOne.mockResolvedValue({ headers: [{ header_type: 'response', header_name: 'X-Frame-Options', header_value: 'DENY' }] });
    const discovered = { proxy_id: null, save: jest.fn() };
    DiscoveredService.create.mockResolvedValue(discovered);

    await handle(inspected({ 'caddymanager.template': 'hardened' }));

    expect(Header.bulkCreate).toHaveBeenCalledWith([
      { proxy_id: 'p-new', header_type: 'response', header_name: 'X-Frame-Options', header_value: 'DENY', enabled: true },
    ]);
    expect(discovered.proxy_id).toBe('p-new');
    expect(discovered.save).toHaveBeenCalled();
  });

  test('removing an access-control label from an approved proxy sends it back to review', async () => {
    const proxy = {
      id: 'p1', domains: ['web.example.com'], upstream_url: 'http://web:3000', status: 'active',
      ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.0.0.0/8'] }, save: jest.fn(),
    };
    DiscoveredService.findOne.mockResolvedValue({ proxy_id: 'p1', save: jest.fn() });
    Proxy.findByPk.mockResolvedValue(proxy);

    await handle(inspected()); // no ip_filter label any more

    expect(proxy.status).toBe('disabled');
    expect(proxy.ip_filtering).toBeNull();
  });
});

describe('events (Docker API 1.55 shape)', () => {
  const event = (Action) => ({ Type: 'container', Action, Actor: { ID: 'f00dfeedcafe0123456789', Attributes: {} }, time: 1 });

  test('a start event inspects the container from Actor.ID and discovers it', async () => {
    const inspect = jest.fn().mockResolvedValue(inspected());
    discovery.docker = { getContainer: jest.fn(() => ({ inspect })) };

    await discovery.handleDockerEvent(event('start'));

    expect(discovery.docker.getContainer).toHaveBeenCalledWith('f00dfeedcafe0123456789');
    expect(Proxy.create).toHaveBeenCalled();
  });

  test('a die event is handled as a stop', async () => {
    const stop = jest.spyOn(discovery, 'handleContainerStop').mockResolvedValue();

    await discovery.handleDockerEvent(event('die'));

    expect(stop).toHaveBeenCalledWith('f00dfeedcafe0123456789');
    stop.mockRestore();
  });
});
