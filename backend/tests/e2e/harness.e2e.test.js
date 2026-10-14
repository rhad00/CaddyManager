/**
 * The e2e harness itself: a proxy created through the real services answers through a real
 * Caddy, and the origin sees the request.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const { startStack, describeIfCaddy } = require('./helpers/stack');
const { createOrigin } = require('./helpers/echoOrigin');

describeIfCaddy('harness', () => {
  let stack;
  let origin;
  let originPort;

  beforeAll(async () => {
    stack = await startStack();
    origin = createOrigin({ name: 'plain' });
    originPort = await origin.start();
  });

  afterAll(async () => {
    await origin.stop();
    await stack.stop();
  });

  afterEach(async () => {
    await stack.reset();
    origin.reset();
  });

  test('a proxy created through the services answers through Caddy', async () => {
    await stack.createProxy({ domains: 'app.example.test', upstream: `127.0.0.1:${originPort}` });

    const res = await stack.send({ host: 'app.example.test', path: '/hello?x=1' });

    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ origin: 'plain', method: 'GET', url: '/hello?x=1' });
    expect(origin.lastRequest.headers.host).toBe('app.example.test');
  });

  test('a host without a proxy gets nothing from the origin', async () => {
    await stack.createProxy({ domains: 'app.example.test', upstream: `127.0.0.1:${originPort}` });

    const res = await stack.send({ host: 'other.example.test' });

    expect(origin.requests).toHaveLength(0);
    expect([404, 200]).toContain(res.status);
  });

  test('the default templates are in the database', async () => {
    const names = (await stack.models.Template.findAll()).map((t) => t.name).sort();

    expect(names).toEqual(['Amazon S3', 'Authelia', 'Cloudflare Tunnel', 'Grafana', 'Keycloak', 'Kibana', 'Nextcloud']);
  });
});
