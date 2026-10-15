/**
 * Startup: the saved Caddy config is loaded as it is, unless a migration changed how routes are
 * generated (the S3 repair): then the routes are rebuilt from the database.
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

  beforeEach(() => {
    loadConfig = jest.spyOn(caddyService, 'loadConfig').mockResolvedValue(undefined);
    rebuild = jest.spyOn(caddyService, 'rebuildConfigFromDatabase').mockResolvedValue(undefined);
    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.readFile.mockResolvedValue('{"apps":{}}');
    Proxy.findAll.mockResolvedValue([{ id: 'p1' }]);
  });
  afterEach(() => jest.restoreAllMocks());

  test('loads the saved config when there is one', async () => {
    await caddyService.initializeConfig();
    expect(loadConfig).toHaveBeenCalledWith({ apps: {} });
    expect(rebuild).not.toHaveBeenCalled();
  });

  test('rebuilds from the database instead when a migration asks for it', async () => {
    await caddyService.initializeConfig({ forceRebuild: true });
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(loadConfig).not.toHaveBeenCalled();
  });

  test('a forced rebuild with no proxies falls back to the saved config', async () => {
    Proxy.findAll.mockResolvedValue([]);
    await caddyService.initializeConfig({ forceRebuild: true });
    expect(rebuild).not.toHaveBeenCalled();
    expect(loadConfig).toHaveBeenCalled();
  });
});
