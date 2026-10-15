/**
 * Every default template, applied the way the API applies it, against a real Caddy: the origin
 * must receive exactly the headers the template promises, and a client must not be able to
 * forge the headers an origin trusts.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const bcrypt = require('bcrypt');
const { startStack, describeIfCaddy } = require('./helpers/stack');
const { createOrigin } = require('./helpers/echoOrigin');

const HOST = 'app.example.test';

describeIfCaddy('default templates', () => {
  let stack;
  let origin;
  let upstream;

  beforeAll(async () => {
    stack = await startStack();
    origin = createOrigin({ name: 'app' });
    upstream = `127.0.0.1:${await origin.start()}`;
  });
  afterAll(async () => { await origin.stop(); await stack.stop(); });
  afterEach(async () => { await stack.reset(); origin.reset(); });

  const open = (template, extra = {}) => stack.createProxy({ domains: HOST, upstream, template, ...extra });
  const get = (options = {}) => stack.send({ host: HOST, path: '/', ...options });
  const seen = () => origin.lastRequest.headers;

  test('Authelia forwards the original request description', async () => {
    await open('Authelia');
    await get({ path: '/secure?a=1', method: 'GET' });
    expect(seen()).toMatchObject({
      'x-original-uri': '/secure?a=1',
      'x-forwarded-method': 'GET',
      'x-forwarded-proto': 'http',
      'x-forwarded-host': HOST,
      'x-forwarded-uri': '/secure?a=1',
    });
  });

  test('Authelia reports the method of a POST, not GET', async () => {
    await open('Authelia');
    await get({ method: 'POST', body: 'x' });
    expect(seen()['x-forwarded-method']).toBe('POST');
  });

  test('Authelia: a client cannot forge the forwarded description', async () => {
    await open('Authelia');
    await get({ path: '/real', headers: { 'X-Original-URI': '/admin', 'X-Forwarded-Method': 'DELETE', 'X-Forwarded-Host': 'evil.test' } });
    expect(seen()).toMatchObject({ 'x-original-uri': '/real', 'x-forwarded-method': 'GET', 'x-forwarded-host': HOST });
  });

  test('Keycloak forwards proto, host and the real client address', async () => {
    await open('Keycloak');
    await get({ headers: { 'X-Real-IP': '6.6.6.6' } });
    expect(seen()).toMatchObject({ 'x-forwarded-proto': 'http', 'x-forwarded-host': HOST, 'x-real-ip': '127.0.0.1' });
  });

  test('Amazon S3 rewrites nothing: Host (with port) and signing headers arrive untouched', async () => {
    await open('Amazon S3');
    await get({
      host: `${HOST}:9000`,
      headers: { Authorization: 'AWS4-HMAC-SHA256 Credential=a/20260101/us-east-1/s3/aws4_request', 'X-Amz-Date': '20260101T000000Z' },
    });
    expect(seen().host).toBe(`${HOST}:9000`);
    expect(seen().authorization).toMatch(/^AWS4-HMAC-SHA256/);
    expect(seen()['x-amz-date']).toBe('20260101T000000Z');
    expect(seen()).not.toHaveProperty('content-md5');
    expect(seen()).not.toHaveProperty('x-amz-acl');
  });

  test('Nextcloud forwards proto and host, and the real address replaces a forged one', async () => {
    await open('Nextcloud');
    await get({ headers: { 'X-Forwarded-For': '6.6.6.6' } });
    expect(seen()).toMatchObject({ 'x-forwarded-proto': 'http', 'x-forwarded-host': HOST, 'x-forwarded-for': '127.0.0.1' });
  });

  test('Nextcloud applies its rate limit when the module is built in', async () => {
    if (!stack.modules.has('http.handlers.rate_limit')) return; // stock Caddy: nothing to assert
    await open('Nextcloud');
    const res = await get();
    expect(res.status).toBe(200);
    const config = JSON.stringify(await stack.runningConfig());
    expect(config).toContain('rate_limit');
  });

  test('Cloudflare Tunnel exposes the client address as cf-connecting-ip and x-real-ip', async () => {
    await open('Cloudflare Tunnel');
    await get({ headers: { 'CF-Connecting-IP': '6.6.6.6' } });
    expect(seen()).toMatchObject({ 'cf-connecting-ip': '127.0.0.1', 'x-real-ip': '127.0.0.1' });
  });

  describe('Grafana', () => {
    test('with basic auth the signed-in user is forwarded', async () => {
      await open('Grafana', {
        basic_auth: { enabled: true, username: 'alice', hashed_password: await bcrypt.hash('pw', 4) },
      });
      const authorization = `Basic ${Buffer.from('alice:pw').toString('base64')}`;
      const res = await get({ headers: { Authorization: authorization } });
      expect(res.status).toBe(200);
      expect(seen()).toMatchObject({ 'x-webauth-user': 'alice', 'x-forwarded-user': 'alice', 'x-forwarded-host': HOST });
    });

    test('without auth no placeholder text is sent as the user', async () => {
      await open('Grafana');
      await get();
      expect(seen()).not.toHaveProperty('x-webauth-user');
      expect(seen()).not.toHaveProperty('x-forwarded-user');
      expect(seen()['x-forwarded-host']).toBe(HOST);
    });

    test('without auth a client cannot pass a user header to the origin', async () => {
      await open('Grafana');
      await get({ headers: { 'X-WebAuth-User': 'admin', 'X-Forwarded-User': 'admin' } });
      expect(seen()).not.toHaveProperty('x-webauth-user');
      expect(seen()).not.toHaveProperty('x-forwarded-user');
    });

    test('with basic auth a client cannot override the user either', async () => {
      await open('Grafana', {
        basic_auth: { enabled: true, username: 'alice', hashed_password: await bcrypt.hash('pw', 4) },
      });
      await get({ headers: { Authorization: `Basic ${Buffer.from('alice:pw').toString('base64')}`, 'X-WebAuth-User': 'admin' } });
      expect(seen()['x-webauth-user']).toBe('alice');
    });
  });

  describe('Kibana', () => {
    test('forwards proto, host and address', async () => {
      await open('Kibana');
      await get({ path: '/app/kibana' });
      expect(seen()).toMatchObject({ 'x-forwarded-proto': 'http', 'x-forwarded-host': HOST, 'x-forwarded-for': '127.0.0.1' });
    });

    test('redirects the root to /app/kibana without bothering the origin', async () => {
      await open('Kibana');
      const res = await get({ path: '/' });
      expect([301, 302, 307, 308]).toContain(res.status);
      expect(res.headers.location).toBe('/app/kibana');
      expect(origin.requests).toHaveLength(0);
    });

    test('other paths are proxied, not redirected', async () => {
      await open('Kibana');
      const res = await get({ path: '/api/status' });
      expect(res.status).toBe(200);
      expect(origin.requests).toHaveLength(1);
    });
  });

  test('every default template can be applied and leaves the proxy answering', async () => {
    const names = (await stack.models.Template.findAll()).map((t) => t.name);
    expect(names).toHaveLength(7);
    for (const name of names) {
      if (name === 'Nextcloud' && !stack.modules.has('http.handlers.rate_limit')) continue;
      await stack.reset();
      origin.reset();
      await open(name);
      const res = await get({ path: '/app/kibana' });
      expect({ name, status: res.status }).toEqual({ name, status: 200 });
    }
  });
});
