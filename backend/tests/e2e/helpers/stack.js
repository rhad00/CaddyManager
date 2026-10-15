/**
 * The e2e stack: the real CaddyManager services and models (SQLite in memory) driving a real
 * Caddy through its admin API, with origin servers started by the tests.
 *
 * A proxy is created the way the API creates one: a Proxy row with its headers, then
 * caddyService.addProxy (which POSTs the route to Caddy), then, for a template,
 * caddyService.applyTemplate (the code behind POST /templates/:id/apply/:proxyId).
 * What Caddy then does with a request is the system under test.
 *
 * Require this module only after the test file has set NODE_ENV and SQLITE_PATH.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const runner = require('./caddyRunner');
const { request } = require('./client');

const e2eRunner = runner.resolveRunner();
const available = runner.isUsable(e2eRunner);
const describeIfCaddy = available ? describe : describe.skip;

if (!available && process.env.CADDY_E2E_REQUIRED === 'true') {
  throw new Error(`e2e tests are required but ${runner.describeRunner(e2eRunner)}`);
}

async function startStack({ tls = false, trustedProxies = false } = {}) {
  process.env.CADDY_ACCESS_LOG = process.env.CADDY_ACCESS_LOG || '/tmp/cm-e2e-access.log';
  const modules = runner.listModules(e2eRunner);
  const caddy = await runner.startCaddy(e2eRunner, { tls, trustedProxies });

  const { sequelize, Proxy, Header, Middleware, Template } = require('../../../src/models');
  const { caddyService } = require('../../../src/services/caddyService');
  const { templateService } = require('../../../src/services/templateService');

  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-e2e-backup-'));
  caddyService.apiUrl = caddy.adminUrl;
  caddyService.serverName = 'srv0';
  caddyService.configBackupDir = backupDir;
  caddyService.configBackupFile = path.join(backupDir, 'caddy_config_backup.json');

  await sequelize.sync({ force: true });
  await templateService.initializeDefaultTemplates();

  const include = [{ model: Header, as: 'headers' }, { model: Middleware, as: 'middlewares' }];

  /**
   * Create a proxy and put it into Caddy.
   * @param spec  { name, domains, upstream, template, headers, middlewares, ...proxy columns }
   */
  async function createProxy({ name, domains, upstream, template, headers = [], middlewares = [], ...columns }) {
    const proxy = await Proxy.create({
      name: name || `e2e-${Math.random().toString(36).slice(2, 8)}`,
      domains: Array.isArray(domains) ? domains : [domains],
      upstream_url: upstream,
      ssl_type: tls ? 'acme' : 'none',
      status: 'active',
      ...columns,
    });
    for (const header of headers) {
      await Header.create({ proxy_id: proxy.id, header_type: 'request', enabled: true, ...header });
    }
    for (const middleware of middlewares) {
      await Middleware.create({ proxy_id: proxy.id, enabled: true, order: 0, ...middleware });
    }
    await proxy.reload({ include });
    await caddyService.addProxy(proxy);
    if (template) {
      const found = await Template.findOne({ where: { name: template } });
      if (!found) throw new Error(`No template named ${template}`);
      await caddyService.applyTemplate(proxy, found);
    }
    return Proxy.findByPk(proxy.id, { include });
  }

  /** Remove every proxy and rebuild Caddy's routes from the (empty) database */
  async function reset() {
    await Middleware.destroy({ where: {} });
    await Header.destroy({ where: {} });
    await Proxy.destroy({ where: {} });
    await caddyService.rebuildConfigFromDatabase();
  }

  /** A request to Caddy as a client of `host` (Caddy matches routes on the Host header) */
  const send = (options) => request({ port: caddy.httpPort, tls, ...options });

  return {
    caddy,
    modules,
    tls,
    models: { sequelize, Proxy, Header, Middleware, Template },
    caddyService,
    createProxy,
    reset,
    send,
    /** the Caddy config as it is running now */
    runningConfig: async () => (await require('axios').get(`${caddy.adminUrl}/config/`)).data,
    stop: async () => {
      try { await sequelize.close(); } catch { /* already closed */ }
      caddy.stop();
      fs.rmSync(backupDir, { recursive: true, force: true });
    },
  };
}

module.exports = { startStack, describeIfCaddy, available, e2eRunner };
