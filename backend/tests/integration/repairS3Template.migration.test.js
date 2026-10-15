/**
 * The "Amazon S3" template used to rewrite Host and pass the SigV4 headers through itself, which
 * broke signatures against strict origins. The migration repairs the stored template and the
 * rules proxies copied from it, and leaves everything the user changed alone.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const { sequelize, Proxy, Header, Template } = require('../../src/models');
const migration = require('../../src/migrations/20261014-repair-amazon-s3-template');
const { LEGACY_S3_HEADERS, S3_TEMPLATE_DESCRIPTION } = require('../../src/utils/s3Template');

const proxyData = (name) => ({
  name, domains: [`${name}.example.com`], upstream_url: 'http://s3:9000', ssl_type: 'none',
});
const legacyRows = (proxy_id) => LEGACY_S3_HEADERS.map((h) => ({ ...h, proxy_id, enabled: true }));

beforeAll(async () => { await sequelize.sync({ force: true }); });
afterAll(async () => { try { await sequelize.close(); } catch { /* already closed */ } });
beforeEach(async () => {
  await Header.destroy({ where: {} });
  await Proxy.destroy({ where: {} });
  await Template.destroy({ where: {} });
});

test('replaces the legacy header list of the stored template', async () => {
  await Template.create({
    name: 'Amazon S3', description: 'old', headers: [...LEGACY_S3_HEADERS], middleware: [],
  });

  await migration.up();

  const template = await Template.findOne({ where: { name: 'Amazon S3' } });
  expect(template.headers).toEqual([]);
  expect(template.description).toBe(S3_TEMPLATE_DESCRIPTION);
});

test('keeps a template the user customised', async () => {
  const custom = [...LEGACY_S3_HEADERS, { header_type: 'response', header_name: 'X-Mine', header_value: '1' }];
  await Template.create({ name: 'Amazon S3', description: 'mine', headers: custom, middleware: [] });

  await migration.up();

  const template = await Template.findOne({ where: { name: 'Amazon S3' } });
  expect(template.headers).toEqual(custom);
  expect(template.description).toBe('mine');
});

test('removes the legacy rules from proxies that got all of them', async () => {
  const proxy = await Proxy.create(proxyData('s3'));
  await Header.bulkCreate([
    ...legacyRows(proxy.id),
    { proxy_id: proxy.id, header_type: 'response', header_name: 'X-Mine', header_value: '1', enabled: true },
  ]);

  await migration.up();

  const left = await Header.findAll({ where: { proxy_id: proxy.id } });
  expect(left.map((h) => h.header_name)).toEqual(['X-Mine']);
});

test('leaves proxies that only share a few ordinary rules', async () => {
  const proxy = await Proxy.create(proxyData('partial'));
  await Header.bulkCreate(legacyRows(proxy.id).slice(2, 4)); // Content-Type, Content-Length

  await migration.up();

  expect(await Header.count({ where: { proxy_id: proxy.id } })).toBe(2);
});

test('cleans a partly edited S3 proxy that still has the Host rewrite and a signing header', async () => {
  const proxy = await Proxy.create(proxyData('half'));
  await Header.bulkCreate([
    ...legacyRows(proxy.id).slice(0, 2), // Host, Authorization
    { proxy_id: proxy.id, header_type: 'request', header_name: 'X-Mine', header_value: '1', enabled: true },
  ]);

  await migration.up();

  const left = await Header.findAll({ where: { proxy_id: proxy.id } });
  expect(left.map((h) => h.header_name)).toEqual(['X-Mine']);
});

test('asks for the Caddy config to be rebuilt', () => {
  expect(migration.rebuildsCaddyConfig).toBe(true);
});

test('is safe to run twice', async () => {
  const proxy = await Proxy.create(proxyData('twice'));
  await Header.bulkCreate(legacyRows(proxy.id));

  await migration.up();
  await migration.up();

  expect(await Header.count({ where: { proxy_id: proxy.id } })).toBe(0);
});
