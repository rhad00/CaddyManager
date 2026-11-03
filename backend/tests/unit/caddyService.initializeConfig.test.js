/**
 * Startup: with proxies in the database the routes are always rebuilt from it, on top of the
 * config Caddy is running now. The saved backup file is a disaster-recovery copy and is not
 * loaded back: it would put back settings that were baked in when it was written (trusted
 * proxies, client IP headers) over the current .env, and Caddy would ignore edits to them.
 */
jest.mock('axios');
jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: {},
  Middleware: {},
  Certificate: { findAll: jest.fn(async () => []) },
  sequelize: {},
}));
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  },
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

const fs = require('fs');
const { Proxy } = require('../../src/models');
const { caddyService } = require('../../src/services/caddyService');

describe('initializeConfig', () => {
  let loadConfig;
  let rebuild;
  let getConfig;
  let backup;

  beforeEach(() => {
    loadConfig = jest.spyOn(caddyService, 'loadConfig').mockResolvedValue(undefined);
    rebuild = jest.spyOn(caddyService, 'rebuildConfigFromDatabase').mockResolvedValue(undefined);
    getConfig = jest.spyOn(caddyService, 'getConfig').mockResolvedValue({ apps: { http: { servers: {} } } });
    backup = jest.spyOn(caddyService, 'backupCurrentConfig').mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    fs.promises.access.mockResolvedValue(undefined); // a saved backup exists
    fs.promises.readFile.mockResolvedValue('{"apps":{}}');
    Proxy.findAll.mockResolvedValue([{ id: 'p1' }]);
  });
  afterEach(() => jest.restoreAllMocks());

  test('rebuilds from the database when there are proxies, even if a saved config exists', async () => {
    await caddyService.initializeConfig();

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(fs.promises.readFile).not.toHaveBeenCalled();
    expect(loadConfig).not.toHaveBeenCalled();
  });

  test('rebuilds when there is no saved config either', async () => {
    fs.promises.access.mockRejectedValue(new Error('ENOENT'));

    await caddyService.initializeConfig();

    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  test('with no proxies it loads the running config once, so Caddy carries the marker, and backs it up', async () => {
    Proxy.findAll.mockResolvedValue([]);

    await caddyService.initializeConfig();

    expect(rebuild).not.toHaveBeenCalled();
    expect(fs.promises.readFile).not.toHaveBeenCalled();
    expect(getConfig).toHaveBeenCalledTimes(1);
    expect(loadConfig).toHaveBeenCalledWith({ apps: { http: { servers: {} } } });
    expect(backup).toHaveBeenCalledTimes(1);
  });
});
