/**
 * The caddymanager.template label names a template; "grafana" must find "Grafana".
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const { sequelize, Proxy, Header, Template } = require('../../src/models');
const { dockerDiscoveryService } = require('../../src/services/dockerDiscoveryService');

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await Template.create({
    name: 'Grafana',
    description: 'd',
    headers: [{ header_type: 'request', header_name: 'X-A', header_value: '1' }],
    middleware: [],
  });
});
afterAll(async () => { try { await sequelize.close(); } catch { /* already closed */ } });

test.each(['Grafana', 'grafana', 'GRAFANA'])('applies the template named %s', async (label) => {
  const proxy = await Proxy.create({
    name: `p-${label}`, domains: [`${label}.example.com`], upstream_url: 'http://app:3000', ssl_type: 'none',
  });

  await dockerDiscoveryService.applyTemplate(proxy.id, label, 'c');

  expect(await Header.count({ where: { proxy_id: proxy.id } })).toBe(1);
});

test('an unknown template changes nothing', async () => {
  const proxy = await Proxy.create({
    name: 'p-none', domains: ['none.example.com'], upstream_url: 'http://app:3000', ssl_type: 'none',
  });

  await dockerDiscoveryService.applyTemplate(proxy.id, 'nope', 'c');

  expect(await Header.count({ where: { proxy_id: proxy.id } })).toBe(0);
});
