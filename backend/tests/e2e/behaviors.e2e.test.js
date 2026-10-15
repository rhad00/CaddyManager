/**
 * What a proxy does with traffic beyond headers: balancing, path routing, access control,
 * HTTPS and WebSocket upstreams, health checks and a config rebuild, against a real Caddy.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const bcrypt = require('bcrypt');
const { startStack, describeIfCaddy } = require('./helpers/stack');
const { createOrigin } = require('./helpers/echoOrigin');
const { upgrade } = require('./helpers/client');

const HOST = 'app.example.test';
const basic = (user, pw) => `Basic ${Buffer.from(`${user}:${pw}`).toString('base64')}`;

function selfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-e2e-cert-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
    '-days', '1', '-subj', '/CN=upstream.test'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  const pems = { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
  fs.rmSync(dir, { recursive: true, force: true });
  return pems;
}

describeIfCaddy('proxy behaviours', () => {
  let stack;
  const origins = {};
  const ports = {};

  beforeAll(async () => {
    stack = await startStack();
    for (const name of ['a', 'b']) {
      origins[name] = createOrigin({ name });
      ports[name] = await origins[name].start();
    }
    origins.tls = createOrigin({ name: 'tls', tls: selfSignedCert() });
    ports.tls = await origins.tls.start();
  });
  afterAll(async () => {
    await Promise.all(Object.values(origins).map((o) => o.stop()));
    await stack.stop();
  });
  afterEach(async () => {
    await stack.reset();
    Object.values(origins).forEach((o) => o.reset());
  });

  const open = (extra = {}) => stack.createProxy({ domains: HOST, upstream: `127.0.0.1:${ports.a}`, ...extra });
  const get = (options = {}) => stack.send({ host: HOST, path: '/', ...options });

  test('one proxy per domain: each Host reaches its own origin', async () => {
    await open();
    await stack.createProxy({ domains: 'other.example.test', upstream: `127.0.0.1:${ports.b}` });
    expect((await get()).json().origin).toBe('a');
    expect((await stack.send({ host: 'other.example.test' })).json().origin).toBe('b');
  });

  test('a proxy answers on every one of its domains', async () => {
    await open({ domains: [HOST, 'alias.example.test'] });
    expect((await stack.send({ host: 'alias.example.test' })).status).toBe(200);
  });

  describe('load balancing', () => {
    const pool = (policy, weights = []) => ({
      load_balancing: {
        enabled: true,
        policy,
        upstreams: [`127.0.0.1:${ports.a}`, `127.0.0.1:${ports.b}`].map((url, i) => ({ url, weight: weights[i] })),
      },
    });

    test('round robin alternates over both origins', async () => {
      await open(pool('round_robin'));
      const served = [];
      for (let i = 0; i < 6; i += 1) served.push((await get()).json().origin);
      expect(served.filter((o) => o === 'a')).toHaveLength(3);
      expect(served.filter((o) => o === 'b')).toHaveLength(3);
    });

    test('weights shift the share of traffic', async () => {
      await open(pool('round_robin', [3, 1]));
      const served = [];
      for (let i = 0; i < 8; i += 1) served.push((await get()).json().origin);
      expect(served.filter((o) => o === 'a')).toHaveLength(6);
    });

    test('ip_hash sends one client to the same origin every time', async () => {
      await open(pool('ip_hash'));
      const served = new Set();
      for (let i = 0; i < 5; i += 1) served.add((await get()).json().origin);
      expect(served.size).toBe(1);
    });

    test('active health checks take a dead origin out of rotation', async () => {
      await open({
        ...pool('round_robin'),
        health_checks: { enabled: true, path: '/health', interval: '1s', timeout: '1s', max_fails: 1 },
      });
      origins.b.respond = ({ req }) => (req.url === '/health' ? { status: 500, body: 'down' } : null);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const served = [];
      for (let i = 0; i < 6; i += 1) served.push((await get({ path: '/work' })).json().origin);
      expect(new Set(served)).toEqual(new Set(['a']));
    });
  });

  describe('path routing', () => {
    test('each path goes to its upstream and other paths are 404', async () => {
      await open({
        path_routing: {
          enabled: true,
          routes: [
            { path: '/a/*', upstream_url: `127.0.0.1:${ports.a}` },
            { path: '/b/*', upstream_url: `127.0.0.1:${ports.b}` },
          ],
        },
      });
      expect((await get({ path: '/a/x' })).json().origin).toBe('a');
      expect((await get({ path: '/b/x' })).json().origin).toBe('b');
      expect((await get({ path: '/c/x' })).status).toBe(404);
    });
  });

  describe('basic auth', () => {
    const secured = async () => open({
      basic_auth: { enabled: true, username: 'alice', hashed_password: await bcrypt.hash('s3cret', 4) },
    });

    test('refuses a request without credentials and never reaches the origin', async () => {
      await secured();
      const res = await get();
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/i);
      expect(origins.a.requests).toHaveLength(0);
    });

    test('refuses a wrong password', async () => {
      await secured();
      expect((await get({ headers: { Authorization: basic('alice', 'nope') } })).status).toBe(401);
    });

    test('lets the right credentials through', async () => {
      await secured();
      const res = await get({ headers: { Authorization: basic('alice', 's3cret') } });
      expect(res.status).toBe(200);
    });
  });

  describe('IP filtering', () => {
    test('deny mode blocks the listed client', async () => {
      await open({ ip_filtering: { enabled: true, mode: 'deny', ip_list: ['127.0.0.1'] } });
      const res = await get();
      expect(res.status).toBe(403);
      expect(origins.a.requests).toHaveLength(0);
    });

    test('deny mode lets other clients through', async () => {
      await open({ ip_filtering: { enabled: true, mode: 'deny', ip_list: ['10.9.9.9'] } });
      expect((await get()).status).toBe(200);
    });

    test('allow mode admits the listed client', async () => {
      await open({ ip_filtering: { enabled: true, mode: 'allow', ip_list: ['127.0.0.0/8'] } });
      expect((await get()).status).toBe(200);
    });

    test('allow mode blocks everyone else', async () => {
      await open({ ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.9.9.9'] } });
      expect((await get()).status).toBe(403);
    });
  });

  describe('HTTPS upstream', () => {
    test('is refused when the certificate is not trusted', async () => {
      await open({ upstream: `https://127.0.0.1:${ports.tls}`, skip_tls_verify: false });
      expect((await get()).status).toBe(502);
    });

    test('works with skip_tls_verify', async () => {
      await open({ upstream: `https://127.0.0.1:${ports.tls}`, skip_tls_verify: true });
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.json().origin).toBe('tls');
    });
  });

  describe('failures', () => {
    test('answers 502 when the origin is down', async () => {
      await open({ upstream: '127.0.0.1:1' });
      expect((await get()).status).toBe(502);
    });
  });

  test('WebSocket upgrades pass through with their headers', async () => {
    await open();
    const res = await upgrade({ port: stack.caddy.httpPort, host: HOST, path: '/socket' });
    expect(res.status).toBe(101);
    expect(origins.a.upgrades[0].headers).toMatchObject({ upgrade: 'websocket', 'sec-websocket-version': '13' });
    res.socket.destroy();
  });

  test('request bodies of several sizes arrive byte for byte', async () => {
    await open();
    for (const size of [0, 1, 65536, 3 * 1024 * 1024]) {
      const body = Buffer.alloc(size, 'x');
      const res = await get({ method: 'PUT', path: '/upload', body });
      expect(res.json().bodyLength).toBe(size);
    }
  });

  test('rebuilding the config from the database serves the same traffic', async () => {
    await open({ headers: [{ header_type: 'request', header_name: 'X-Keep', header_value: 'yes' }] });
    await stack.createProxy({ domains: 'other.example.test', upstream: `127.0.0.1:${ports.b}`, compression_enabled: true });
    await stack.caddyService.rebuildConfigFromDatabase();

    const first = await get();
    expect(first.status).toBe(200);
    expect(origins.a.lastRequest.headers['x-keep']).toBe('yes');
    expect((await stack.send({ host: 'other.example.test' })).json().origin).toBe('b');
  });

  test('deleting a proxy stops serving its host', async () => {
    const proxy = await open();
    expect((await get()).status).toBe(200);
    await stack.caddyService.deleteProxy(proxy);
    origins.a.reset();
    await get();
    expect(origins.a.requests).toHaveLength(0);
  });
});
