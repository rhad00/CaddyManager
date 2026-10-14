/**
 * Header rules and the headers Caddy itself adds or trusts, observed at the origin and at the
 * client, against a real Caddy.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const { startStack, describeIfCaddy } = require('./helpers/stack');
const { createOrigin, rawHeaderPairs } = require('./helpers/echoOrigin');
const { DEFAULT_SECURITY_HEADERS } = require('../../src/services/securityHeadersService');

const HOST = 'app.example.test';

describeIfCaddy('headers', () => {
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

  const open = (extra = {}) => stack.createProxy({ domains: HOST, upstream, ...extra });
  const get = (options = {}) => stack.send({ host: HOST, path: '/', ...options });
  const seen = () => origin.lastRequest.headers;
  const req = (header_name, header_value) => ({ header_type: 'request', header_name, header_value });
  const resp = (header_name, header_value) => ({ header_type: 'response', header_name, header_value });

  describe('request headers', () => {
    test('a custom request header reaches the origin', async () => {
      await open({ headers: [req('X-Custom', 'hello')] });
      await get();
      expect(seen()['x-custom']).toBe('hello');
    });

    test('placeholders are resolved per request', async () => {
      await open({
        headers: [
          req('X-Path', '{http.request.uri.path}'),
          req('X-Query', '{http.request.uri.query}'),
          req('X-Method', '{http.request.method}'),
          req('X-Client', '{http.request.remote.host}'),
          req('X-UA', '{http.request.header.User-Agent}'),
        ],
      });
      await get({ path: '/p/q?z=1', method: 'POST', body: 'b', headers: { 'User-Agent': 'probe/1' } });
      expect(seen()).toMatchObject({ 'x-path': '/p/q', 'x-query': 'z=1', 'x-method': 'POST', 'x-client': '127.0.0.1', 'x-ua': 'probe/1' });
    });

    test('a rule overrides the header the client sent', async () => {
      await open({ headers: [req('X-Env', 'prod')] });
      await get({ headers: { 'X-Env': 'attacker' } });
      expect(seen()['x-env']).toBe('prod');
    });

    test('a Host rule changes the Host the origin sees', async () => {
      await open({ headers: [req('Host', 'internal.service')] });
      await get();
      expect(seen().host).toBe('internal.service');
    });

    test('a disabled rule is not applied', async () => {
      await open({ headers: [{ ...req('X-Off', '1'), enabled: false }] });
      await get();
      expect(seen()).not.toHaveProperty('x-off');
    });

    test('a pure passthrough rule neither adds an empty header nor changes a sent one', async () => {
      await open({ headers: [req('X-Trace', '{http.request.header.X-Trace}')] });
      await get();
      expect(seen()).not.toHaveProperty('x-trace');
      await get({ headers: { 'X-Trace': 'abc' } });
      expect(seen()['x-trace']).toBe('abc');
    });

    test('rules also apply to path-routed requests', async () => {
      await open({
        headers: [req('X-Custom', 'routed')],
        path_routing: { enabled: true, routes: [{ path: '/api/*', upstream_url: upstream }] },
      });
      const res = await get({ path: '/api/x' });
      expect(res.status).toBe(200);
      expect(seen()['x-custom']).toBe('routed');
    });
  });

  describe('forwarding headers added by Caddy', () => {
    test('X-Forwarded-For / Proto / Host describe the client', async () => {
      await open();
      await get();
      expect(seen()).toMatchObject({ 'x-forwarded-for': '127.0.0.1', 'x-forwarded-proto': 'http', 'x-forwarded-host': HOST });
    });

    test('a spoofed X-Forwarded-For is not passed on', async () => {
      await open();
      await get({ headers: { 'X-Forwarded-For': '6.6.6.6', 'X-Forwarded-Proto': 'https' } });
      expect(seen()['x-forwarded-for']).toBe('127.0.0.1');
      expect(seen()['x-forwarded-proto']).toBe('http');
    });

    test('there is exactly one X-Forwarded-For header', async () => {
      await open();
      await get({ headers: { 'X-Forwarded-For': '6.6.6.6' } });
      const names = rawHeaderPairs(origin.lastRequest.rawHeaders).map(([n]) => n.toLowerCase());
      expect(names.filter((n) => n === 'x-forwarded-for')).toHaveLength(1);
    });

    test('the request is forwarded to the origin as HTTP/1.1 with the original path and query', async () => {
      await open();
      await get({ path: '/a%20b/c?d=%2F' });
      expect(origin.lastRequest.httpVersion).toBe('1.1');
      expect(origin.lastRequest.url).toBe('/a%20b/c?d=%2F');
    });
  });

  describe('response headers', () => {
    test('the security headers reach the client', async () => {
      const proxy = await open();
      const { applySecurityHeaders } = require('../../src/services/securityHeadersService');
      await applySecurityHeaders(proxy.id, stack.models.Header);
      await stack.caddyService.updateProxy(await stack.models.Proxy.findByPk(proxy.id, {
        include: [{ model: stack.models.Header, as: 'headers' }, { model: stack.models.Middleware, as: 'middlewares' }],
      }));

      const res = await get();
      for (const { header_name, header_value } of DEFAULT_SECURITY_HEADERS) {
        expect({ [header_name]: res.headers[header_name.toLowerCase()] }).toEqual({ [header_name]: header_value });
      }
    });

    test('a custom response header is added and overrides the origin', async () => {
      origin.respond = () => ({ status: 200, headers: { 'X-Frame-Options': 'ALLOWALL', 'X-Origin-Only': 'yes' }, body: 'ok' });
      await open({ headers: [resp('X-Frame-Options', 'DENY'), resp('X-Served-By', 'caddymanager')] });
      const res = await get();
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-served-by']).toBe('caddymanager');
      expect(res.headers['x-origin-only']).toBe('yes');
    });

    test('origin headers pass through: ETag, Content-Disposition, Cache-Control, Content-Range', async () => {
      origin.respond = () => ({
        status: 206,
        headers: {
          ETag: '"abc123"', 'Content-Disposition': 'attachment; filename="résumé.pdf"',
          'Cache-Control': 'private, max-age=60', 'Content-Range': 'bytes 0-1/10', 'Content-Type': 'application/pdf',
        },
        body: 'ab',
      });
      await open();
      const res = await get({ headers: { Range: 'bytes=0-1' } });
      expect(res.status).toBe(206);
      expect(res.headers).toMatchObject({
        etag: '"abc123"', 'cache-control': 'private, max-age=60', 'content-range': 'bytes 0-1/10', 'content-type': 'application/pdf',
      });
      expect(res.headers['content-disposition']).toContain('filename=');
    });

    test('several Set-Cookie headers stay separate', async () => {
      origin.respond = () => ({ status: 200, headers: { 'Set-Cookie': ['a=1; Path=/', 'b=2; Path=/; HttpOnly'] }, body: 'ok' });
      await open();
      const res = await get();
      expect(res.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/; HttpOnly']);
    });

    test('the origin status and body pass through for errors', async () => {
      origin.respond = () => ({ status: 503, headers: { 'Retry-After': '30' }, body: 'maintenance' });
      await open();
      const res = await get();
      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('30');
      expect(res.text()).toBe('maintenance');
    });

    test('a redirect from the origin keeps its Location untouched', async () => {
      origin.respond = () => ({ status: 302, headers: { Location: 'https://elsewhere.example/x' }, body: '' });
      await open();
      const res = await get();
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://elsewhere.example/x');
    });
  });

  describe('compression', () => {
    const big = 'compressible '.repeat(2000);
    const textOrigin = () => { origin.respond = () => ({ status: 200, headers: { 'Content-Type': 'text/plain', 'Content-Length': String(big.length) }, body: big }); };

    test('compresses ordinary responses for clients that accept gzip', async () => {
      textOrigin();
      await open({ compression_enabled: true });
      const res = await get({ headers: { 'Accept-Encoding': 'gzip' } });
      expect(res.headers['content-encoding']).toBe('gzip');
      expect(require('zlib').gunzipSync(res.body).toString()).toBe(big);
    });

    test('leaves responses alone when compression is off', async () => {
      textOrigin();
      await open({ compression_enabled: false });
      const res = await get({ headers: { 'Accept-Encoding': 'gzip' } });
      expect(res.headers).not.toHaveProperty('content-encoding');
      expect(res.text()).toBe(big);
    });

    test('does not compress HEAD responses (Content-Length stays truthful)', async () => {
      textOrigin();
      await open({ compression_enabled: true });
      const res = await get({ method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } });
      expect(res.headers).not.toHaveProperty('content-encoding');
      expect(Number(res.headers['content-length'])).toBe(big.length);
    });

    test('does not compress S3-signed requests', async () => {
      textOrigin();
      await open({ compression_enabled: true });
      const res = await get({
        headers: { 'Accept-Encoding': 'gzip', Authorization: 'AWS4-HMAC-SHA256 Credential=a/20260101/us-east-1/s3/aws4_request' },
      });
      expect(res.headers).not.toHaveProperty('content-encoding');
    });

    test('does not compress presigned URL requests', async () => {
      textOrigin();
      await open({ compression_enabled: true });
      const res = await get({ path: '/b/k?X-Amz-Signature=abc', headers: { 'Accept-Encoding': 'gzip' } });
      expect(res.headers).not.toHaveProperty('content-encoding');
    });
  });
});
