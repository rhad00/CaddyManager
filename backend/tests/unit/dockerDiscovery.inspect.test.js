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
  Middleware: { bulkCreate: jest.fn() },
}));
jest.mock('../../src/services/caddyService', () => ({ caddyService: { rebuildConfigFromDatabase: jest.fn() } }));
jest.mock('../../src/services/securityHeadersService', () => ({ applySecurityHeaders: jest.fn(), removeSecurityHeaders: jest.fn() }));

const { DiscoveredService, Proxy, Template, Header, Middleware } = require('../../src/models');
const securityHeadersService = require('../../src/services/securityHeadersService');
const { dockerDiscoveryService: discovery } = require('../../src/services/dockerDiscoveryService');

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
      'caddymanager.security_headers': 'true',
    }));

    expect(Proxy.create).toHaveBeenCalledWith(expect.objectContaining({
      rate_limit: { enabled: true, requests_per_second: 50 },
      ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.0.0.0/8', '192.168.1.10'] },
      path_routing: null,
      security_headers_enabled: true,
    }));
    expect(securityHeadersService.applySecurityHeaders).toHaveBeenCalledWith('p-new', Header);
  });

  test('a path prefix proxies only that path', async () => {
    await handle(inspected({ 'caddymanager.path_prefix': '/api/' }));

    expect(Proxy.create).toHaveBeenCalledWith(expect.objectContaining({
      path_routing: { enabled: true, routes: [
        { path: '/api', upstream_url: 'http://web:3000' },
        { path: '/api/*', upstream_url: 'http://web:3000' },
      ] },
    }));
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

  test('a template label copies the template middlewares too', async () => {
    Template.findOne.mockResolvedValue({
      headers: [],
      middleware: [{ middleware_type: 'redirect', configuration: { from: '/', to: '/app' }, order: 2 }],
    });
    DiscoveredService.create.mockResolvedValue({ proxy_id: null, save: jest.fn() });

    await handle(inspected({ 'caddymanager.template': 'kibana' }));

    expect(Middleware.bulkCreate).toHaveBeenCalledWith([
      { proxy_id: 'p-new', middleware_type: 'redirect', configuration: { from: '/', to: '/app' }, order: 2, enabled: true },
    ]);
  });

  test('removing an access-control label from an approved proxy sends it back to review', async () => {
    const proxy = {
      id: 'p1', domains: ['web.example.com'], upstream_url: 'http://web:3000', status: 'active',
      ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.0.0.0/8'] }, save: jest.fn(),
    };
    DiscoveredService.findOne.mockResolvedValue({
      proxy_id: 'p1', upstream_url: 'http://web:3000', save: jest.fn(),
      labels: inspected({ 'caddymanager.ip_filter': '10.0.0.0/8' }).Config.Labels,
    });
    Proxy.findByPk.mockResolvedValue(proxy);

    await handle(inspected()); // no ip_filter label any more

    expect(proxy.status).toBe('disabled');
    expect(proxy.ip_filtering).toBeNull();
  });
});

// Review of 0.24: restarts must not wipe what an admin configured by hand
describe('rescans keep admin changes', () => {
  const rescan = async (labels, proxy, previousLabels = {}) => {
    const previous = inspected(previousLabels).Config.Labels;
    DiscoveredService.findOne.mockResolvedValue({
      proxy_id: 'p1', labels: previous, upstream_url: 'http://web:3000', save: jest.fn(),
    });
    Proxy.findByPk.mockResolvedValue(proxy);
    await handle(inspected(labels));
  };
  const adminProxy = (extra = {}) => ({
    id: 'p1', domains: ['web.example.com'], upstream_url: 'http://web:3000', status: 'active',
    rate_limit: null, ip_filtering: null, path_routing: null, security_headers_enabled: false,
    compression_enabled: true, save: jest.fn(), ...extra,
  });

  test('a restart with unchanged labels leaves an admin-set IP filter, rate limit and status alone', async () => {
    const proxy = adminProxy({
      ip_filtering: { enabled: true, mode: 'deny', ip_list: ['203.0.113.0/24'] },
      rate_limit: { enabled: true, requests_per_second: 5 },
      security_headers_enabled: true,
      compression_enabled: false,
    });

    await rescan({}, proxy);

    expect(proxy.status).toBe('active');
    expect(proxy.ip_filtering).toEqual({ enabled: true, mode: 'deny', ip_list: ['203.0.113.0/24'] });
    expect(proxy.rate_limit).toEqual({ enabled: true, requests_per_second: 5 });
    expect(proxy.security_headers_enabled).toBe(true);
    expect(proxy.compression_enabled).toBe(false);
    expect(securityHeadersService.removeSecurityHeaders).not.toHaveBeenCalled();
  });

  test('a changed label still applies, and sends an active proxy back to review', async () => {
    const proxy = adminProxy();

    await rescan({ 'caddymanager.rate_limit': '20' }, proxy);

    expect(proxy.rate_limit).toEqual({ enabled: true, requests_per_second: 20 });
    expect(proxy.status).toBe('disabled');
  });

  test('a changed label does not overwrite a value the admin set by hand', async () => {
    const proxy = adminProxy({ rate_limit: { enabled: true, requests_per_second: 5 } });

    await rescan({ 'caddymanager.rate_limit': '20' }, proxy, { 'caddymanager.rate_limit': '50' });

    expect(proxy.rate_limit).toEqual({ enabled: true, requests_per_second: 5 });
    expect(proxy.status).toBe('active');
  });

  test('a removed label removes the feature it had enabled', async () => {
    const proxy = adminProxy({ security_headers_enabled: true });

    await rescan({}, proxy, { 'caddymanager.security_headers': 'true' });

    expect(proxy.security_headers_enabled).toBe(false);
    expect(securityHeadersService.removeSecurityHeaders).toHaveBeenCalledWith('p1', Header);
    expect(proxy.status).toBe('disabled');
  });
});

describe('label combinations and values', () => {
  test.each([
    ['path_prefix with security_headers', { 'caddymanager.path_prefix': '/api', 'caddymanager.security_headers': 'true' }],
    ['path_prefix with a template', { 'caddymanager.path_prefix': '/api', 'caddymanager.template': 'authelia' }],
    ['a path prefix with ..', { 'caddymanager.path_prefix': '/api/../admin' }],
    ['a path prefix with //', { 'caddymanager.path_prefix': '//api' }],
    ['an IPv6 zone in ip_filter', { 'caddymanager.ip_filter': 'fe80::1%eth0' }],
  ])('skips %s', async (_label, labels) => {
    await handle(inspected(labels));
    expect(Proxy.create).not.toHaveBeenCalled();
  });

  test('accepts IPv6 addresses and ranges', async () => {
    await handle(inspected({ 'caddymanager.ip_filter': '2001:db8::/32, ::1' }));
    expect(Proxy.create).toHaveBeenCalled();
  });
});

describe('reconcileServices', () => {
  const service = (id) => ({ source_id: id, status: 'active', proxy_id: `p-${id}`, auto_managed: true, save: jest.fn() });

  test('refreshes services whose container still runs and removes only the missing ones', async () => {
    const running = service('aaa');
    const gone = service('bbb');
    DiscoveredService.findAll = jest.fn().mockResolvedValue([running, gone]);
    discovery.docker = { listContainers: jest.fn().mockResolvedValue([{ Id: 'aaa' }]) };
    const destroy = jest.fn();
    Proxy.findByPk.mockResolvedValue({ name: 'Auto: gone', destroy });

    await discovery.reconcileServices();

    expect(running.status).toBe('active');
    expect(running.last_seen).toBeInstanceOf(Date);
    expect(gone.status).toBe('removed');
    expect(Proxy.findByPk).toHaveBeenCalledTimes(1);
    expect(Proxy.findByPk).toHaveBeenCalledWith('p-bbb');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test('removes nothing when Docker cannot be listed', async () => {
    const stale = service('ccc');
    DiscoveredService.findAll = jest.fn().mockResolvedValue([stale]);
    discovery.docker = { listContainers: jest.fn().mockRejectedValue(new Error('socket closed')) };

    await discovery.reconcileServices();

    expect(stale.status).toBe('active');
    expect(Proxy.findByPk).not.toHaveBeenCalled();
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
