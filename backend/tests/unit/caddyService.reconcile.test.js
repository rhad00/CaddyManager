/**
 * Caddy keeps the routes only in memory. When the container restarts (a crash, or
 * `docker compose up -d` after an .env change) it comes back on the bundled Caddyfile with no
 * proxy routes. Every config the backend loads carries an @id marker; a missing marker means
 * Caddy was reset, and the leader then rebuilds the routes from the database.
 */
const axios = require('axios');

jest.mock('axios');
jest.mock('fs', () => ({
  promises: { access: jest.fn(), readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() },
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));
jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn(), count: jest.fn() },
  Header: {},
  Middleware: {},
  Certificate: { findAll: jest.fn(async () => []) },
  sequelize: {},
}));

const { Proxy } = require('../../src/models');
const { caddyService } = require('../../src/services/caddyService');

const notFound = () => Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });
const refused = () => Object.assign(new Error('connect ECONNREFUSED 172.19.0.2:2019'), { code: 'ECONNREFUSED' });

describe('the @id marker on loaded configs', () => {
  afterEach(() => jest.clearAllMocks());

  test('loadConfig marks the HTTP server so a reset Caddy can be told apart', async () => {
    axios.post.mockResolvedValue({});
    const config = { apps: { http: { servers: { srv0: { listen: [':443'], routes: [] } } } } };

    await caddyService.loadConfig(config);

    const [, payload] = axios.post.mock.calls.find(([url]) => /\/load$/.test(String(url)));
    expect(payload.apps.http.servers.srv0['@id']).toBe('caddymanager');
    expect(payload.apps.http.servers.srv0.listen).toEqual([':443']);
  });

  test('the config passed in is not modified', async () => {
    axios.post.mockResolvedValue({});
    const config = { apps: { http: { servers: { srv0: { listen: [':443'], routes: [] } } } } };

    await caddyService.loadConfig(config);

    expect(config.apps.http.servers.srv0).not.toHaveProperty('@id');
  });

  test('a config without the HTTP server is loaded as it is', async () => {
    axios.post.mockResolvedValue({});
    await caddyService.loadConfig({ apps: {} });
    const [, payload] = axios.post.mock.calls.find(([url]) => /\/load$/.test(String(url)));
    expect(payload).toEqual({ apps: {} });
  });
});

describe('reconcileCaddy', () => {
  let rebuild;
  let warn;

  beforeEach(() => {
    rebuild = jest.spyOn(caddyService, 'rebuildConfigFromDatabase').mockResolvedValue(undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    caddyService.reconcileOutage = false;
    Proxy.count.mockResolvedValue(2);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('does nothing while the marker is there', async () => {
    axios.get.mockResolvedValue({ data: { listen: [':443'] } });

    await expect(caddyService.reconcileCaddy()).resolves.toBe('ok');

    expect(axios.get.mock.calls[0][0]).toMatch(/\/id\/caddymanager$/);
    expect(rebuild).not.toHaveBeenCalled();
  });

  test('rebuilds from the database when the marker is gone and proxies are active', async () => {
    axios.get.mockRejectedValue(notFound());

    await expect(caddyService.reconcileCaddy()).resolves.toBe('rebuilt');

    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  test('does not rebuild when no proxy is active', async () => {
    axios.get.mockRejectedValue(notFound());
    Proxy.count.mockResolvedValue(0);

    await expect(caddyService.reconcileCaddy()).resolves.toBe('skipped');

    expect(rebuild).not.toHaveBeenCalled();
  });

  test('an unreachable Caddy is not an error and is logged once per outage', async () => {
    axios.get.mockRejectedValue(refused());

    await expect(caddyService.reconcileCaddy()).resolves.toBe('unreachable');
    await expect(caddyService.reconcileCaddy()).resolves.toBe('unreachable');
    expect(rebuild).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);

    axios.get.mockResolvedValue({ data: {} });
    await caddyService.reconcileCaddy();
    axios.get.mockRejectedValue(refused());
    await caddyService.reconcileCaddy();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('other Caddy errors do not trigger a rebuild', async () => {
    axios.get.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }));

    await expect(caddyService.reconcileCaddy()).resolves.toBe('unreachable');

    expect(rebuild).not.toHaveBeenCalled();
  });

  test('a failed rebuild is reported, not thrown', async () => {
    axios.get.mockRejectedValue(notFound());
    rebuild.mockRejectedValue(new Error('load rejected'));

    await expect(caddyService.reconcileCaddy()).resolves.toBe('failed');
  });
});

describe('startReconcileLoop', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('checks Caddy on every interval and does not keep the process alive', async () => {
    const reconcile = jest.spyOn(caddyService, 'reconcileCaddy').mockResolvedValue('ok');

    const timer = caddyService.startReconcileLoop(30);
    expect(reconcile).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30000);
    expect(reconcile).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60000);
    expect(reconcile).toHaveBeenCalledTimes(3);

    expect(timer.hasRef()).toBe(false);
    clearInterval(timer);
  });

  test('a tick does not start while the previous one is still running', async () => {
    let finish;
    const reconcile = jest.spyOn(caddyService, 'reconcileCaddy').mockImplementation(
      () => new Promise((resolve) => { finish = () => resolve('rebuilt'); }),
    );

    const timer = caddyService.startReconcileLoop(30);
    await jest.advanceTimersByTimeAsync(90000);
    expect(reconcile).toHaveBeenCalledTimes(1);

    finish();
    await jest.advanceTimersByTimeAsync(30000);
    expect(reconcile).toHaveBeenCalledTimes(2);
    clearInterval(timer);
  });
});
