/**
 * S3 through the reverse proxy, with an origin as strict as radosgw about SigV4.
 *
 * Why this exists: nginx-based proxies (Nginx Proxy Manager) break S3 clients that sign
 * their requests with AWS Signature V4, because the signature covers the Host header, the
 * path and the query exactly as the origin will read them, and every signed header. The
 * proxy must be invisible to all of that. Each scenario runs against four proxy setups and
 * two Host styles (signed with and without the port a client on a non-standard port uses).
 *
 * The origin (helpers/s3Origin.js) verifies the signature from what ARRIVES, so a rewritten
 * Host, a merged slash, a re-encoded path, an emptied header or a damaged body fails here
 * the way it fails against radosgw.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const crypto = require('crypto');
const { startStack, describeIfCaddy } = require('./helpers/stack');
const { createS3Origin } = require('./helpers/s3Origin');
const {
  signRequest, presign, chunkedBody, sha256Hex, STREAMING_PAYLOAD, UNSIGNED_PAYLOAD,
} = require('./helpers/sigv4');

const DOMAIN = 's3.example.test';

const CONFIGS = [
  { name: 'default proxy (compression on, no template)', proxy: {} },
  { name: 'Amazon S3 template', proxy: { template: 'Amazon S3' } },
  { name: 'compression off', proxy: { compression_enabled: false } },
  { name: 'Amazon S3 template, compression off', proxy: { template: 'Amazon S3', compression_enabled: false } },
];

const HOST_STYLES = [
  { name: 'Host signed with the port', withPort: true },
  { name: 'Host signed without the port', withPort: false },
];

/** An error that says what the origin complained about */
function describeFailure(res) {
  const debugHost = res.headers['x-debug-host'];
  const canonical = res.headers['x-debug-canonical'] ? Buffer.from(res.headers['x-debug-canonical'], 'base64').toString() : '';
  return `HTTP ${res.status}: ${res.text().slice(0, 400)}${debugHost ? `\n  host the origin saw: ${debugHost}` : ''}${canonical ? `\n  canonical request at the origin:\n${canonical}` : ''}`;
}

function expectStatus(res, status) {
  if (res.status !== status) throw new Error(`expected HTTP ${status}, got ${describeFailure(res)}`);
}

describeIfCaddy('S3 SigV4 through the proxy', () => {
  let stack;
  const origin = createS3Origin({ dnsName: DOMAIN });
  let originPort;
  let counter = 0;
  const uniqueKey = (name) => { counter += 1; return `${counter}-${name}`; };

  beforeAll(async () => {
    stack = await startStack();
    originPort = await origin.start();
  });

  afterAll(async () => {
    await origin.stop();
    await stack.stop();
  });

  describe.each(CONFIGS)('$name', ({ proxy }) => {
    beforeAll(async () => {
      await stack.createProxy({
        name: 's3',
        domains: [DOMAIN, `*.${DOMAIN}`],
        upstream: `127.0.0.1:${originPort}`,
        ...proxy,
      });
    });

    afterAll(() => stack.reset());

    describe.each(HOST_STYLES)('$name', ({ withPort }) => {
      const hostFor = (bucket) => `${bucket ? `${bucket}.` : ''}${DOMAIN}${withPort ? `:${stack.caddy.httpPort}` : ''}`;

      /** Sign and send an S3 request; bucket style is path-style unless `bucket` is given */
      async function s3(options) {
        const { bucket, hostBucket, signedHeaders, ...rest } = options;
        const signedHost = hostFor(hostBucket);
        const signed = signRequest({
          host: signedHost, accessKey: origin.accessKey, secretKey: origin.secretKey, ...rest,
        });
        const { host, ...headers } = signed.headers;
        const path = signed.query ? `${signed.path}?${signed.query}` : signed.path;
        const res = await stack.send({ host, method: signed.method, path, headers, body: signed.body.length || rest.body !== undefined ? signed.body : undefined });
        return { res, signed, path, host };
      }
      const key = (name) => `bkt/${uniqueKey(name)}`;

      async function put(objectKey, body, extra = {}) {
        const out = await s3({ method: 'PUT', key: objectKey, body, ...extra });
        expectStatus(out.res, 200);
        return out;
      }

      test('PUT then GET returns the object, and the origin saw the client\'s Host header', async () => {
        const objectKey = key('hello.txt');
        const { host } = await put(objectKey, 'hello s3');

        const { res } = await s3({ method: 'GET', key: objectKey });

        expectStatus(res, 200);
        expect(res.text()).toBe('hello s3');
        expect(res.headers.etag).toBe(`"${crypto.createHash('md5').update('hello s3').digest('hex')}"`);
        expect(origin.lastRequest.headers.host).toBe(host);
      });

      test('HEAD answers with the headers and no body', async () => {
        const objectKey = key('head.txt');
        await put(objectKey, 'twelve bytes');

        const { res } = await s3({ method: 'HEAD', key: objectKey });

        expectStatus(res, 200);
        expect(res.headers['content-length']).toBe('12');
        expect(res.headers['accept-ranges']).toBe('bytes');
        expect(res.body.length).toBe(0);
      });

      test.each([
        ['spaces and plus', 'dir/sub dir/file name+1.txt'],
        ['tilde and dots', 'a~b/.hidden/..dots..'],
        ['unicode', 'ünï/日本語.txt'],
        ['double slashes', 'a//double///slash.txt'],
        ['a literal percent', '100%/real%25.txt'],
        ['reserved characters', "special!$&'()*,;=:@.txt"],
        ['a trailing slash', 'folder/'],
      ])('the key path survives untouched: %s', async (_label, name) => {
        const objectKey = `bkt/${uniqueKey('k')}/${name}`;

        const stored = await put(objectKey, `data for ${name}`);
        const fetched = await s3({ method: 'GET', key: objectKey });

        expectStatus(fetched.res, 200);
        expect(fetched.res.text()).toBe(`data for ${name}`);
        // What the origin got on the wire is what the client sent, byte for byte
        expect(origin.lastRequest.url).toBe(fetched.path);
        expect(stored.path).toBe(fetched.path);
      });

      test.each([
        ['a list with prefix and delimiter', 'GET', '', 'list-type=2&prefix=dir%2F&delimiter=%2F'],
        ['a bare subresource', 'GET', 'bkt/acl-target', 'acl'],
        ['encoded characters in values', 'GET', '', 'list-type=2&prefix=a%20b%2Bc~d'],
        ['repeated parameters', 'GET', '', 'list-type=2&x=2&x=1'],
        ['a plus sign in a value', 'GET', '', 'list-type=2&prefix=a+b'],
      ])('the query string survives: %s', async (_label, method, objectKey, query) => {
        if (objectKey) await put(objectKey, 'x');

        const { res, path } = await s3({ method, key: objectKey || 'bkt/', query });

        expectStatus(res, 200);
        expect(origin.lastRequest.url).toBe(path);
      });

      test('a Range request is answered with 206 and the exact slice', async () => {
        const objectKey = key('range.bin');
        const data = crypto.randomBytes(5000);
        await put(objectKey, data);

        const { res } = await s3({ method: 'GET', key: objectKey, headers: { range: 'bytes=100-299' } });

        expectStatus(res, 206);
        expect(res.headers['content-range']).toBe('bytes 100-299/5000');
        expect(res.body.equals(data.subarray(100, 300))).toBe(true);
      });

      test('If-None-Match with the current ETag is a 304', async () => {
        const objectKey = key('cond.txt');
        const { res: putRes } = await put(objectKey, 'conditional');

        const { res } = await s3({ method: 'GET', key: objectKey, headers: { 'if-none-match': putRes.headers.etag } });

        expectStatus(res, 304);
      });

      test('Content-MD5, Content-Type, ACL, storage class and user metadata reach the origin intact', async () => {
        const objectKey = key('meta.json');
        const body = JSON.stringify({ a: 1 });

        await put(objectKey, body, {
          headers: {
            'content-type': 'application/json',
            'content-md5': crypto.createHash('md5').update(body).digest('base64'),
            'x-amz-acl': 'public-read',
            'x-amz-storage-class': 'STANDARD_IA',
            'x-amz-meta-my_key': 'with_underscore',
            'x-amz-meta-Mixed-Case': 'Value 1',
          },
        });

        const received = origin.lastRequest.headers;
        expect(received['content-type']).toBe('application/json');
        expect(received['content-md5']).toBe(crypto.createHash('md5').update(body).digest('base64'));
        expect(received['x-amz-acl']).toBe('public-read');
        expect(received['x-amz-meta-my_key']).toBe('with_underscore');
        const { res } = await s3({ method: 'HEAD', key: objectKey });
        expect(res.headers['x-amz-meta-my_key']).toBe('with_underscore');
        expect(res.headers['content-type']).toBe('application/json');
      });

      test('headers the client did not send are not invented (no empty Content-MD5 or x-amz-acl)', async () => {
        const objectKey = key('plain.txt');

        await put(objectKey, 'no extra headers');

        const names = Object.keys(origin.lastRequest.headers);
        for (const header of ['content-md5', 'x-amz-acl', 'x-amz-storage-class']) {
          expect(names).not.toContain(header);
        }
        const emptied = Object.entries(origin.lastRequest.headers).filter(([, value]) => value === '');
        expect(emptied).toEqual([]);
      });

      test('an 8 MiB upload and download are byte-identical', async () => {
        const objectKey = key('big.bin');
        const data = crypto.randomBytes(8 * 1024 * 1024);

        await put(objectKey, data);
        const { res } = await s3({ method: 'GET', key: objectKey });

        expectStatus(res, 200);
        expect(sha256Hex(res.body)).toBe(sha256Hex(data));
        expect(origin.objects.get(objectKey).body.equals(data)).toBe(true);
      });

      test('an UNSIGNED-PAYLOAD upload is accepted', async () => {
        const objectKey = key('unsigned.bin');
        const data = crypto.randomBytes(300000);

        await put(objectKey, data, { payloadHash: UNSIGNED_PAYLOAD });

        expect(origin.objects.get(objectKey).body.equals(data)).toBe(true);
      });

      test('a multipart upload completes', async () => {
        const objectKey = key('multi.bin');
        const parts = [crypto.randomBytes(200000), crypto.randomBytes(150000)];

        const init = await s3({ method: 'POST', key: objectKey, query: 'uploads', body: '' });
        expectStatus(init.res, 200);
        const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(init.res.text())[1];
        for (const [index, part] of parts.entries()) {
          const uploaded = await s3({ method: 'PUT', key: objectKey, query: `partNumber=${index + 1}&uploadId=${uploadId}`, body: part });
          expectStatus(uploaded.res, 200);
        }
        const done = await s3({ method: 'POST', key: objectKey, query: `uploadId=${uploadId}`, body: '<CompleteMultipartUpload/>' });

        expectStatus(done.res, 200);
        expect(origin.objects.get(objectKey).body.equals(Buffer.concat(parts))).toBe(true);
      });

      test('an aws-chunked (streaming SigV4) upload verifies chunk by chunk', async () => {
        const objectKey = key('streamed.bin');
        const data = crypto.randomBytes(200000);
        const seedHost = hostFor();
        const seed = signRequest({
          method: 'PUT', host: seedHost, key: objectKey, payloadHash: STREAMING_PAYLOAD, body: Buffer.alloc(0),
          accessKey: origin.accessKey, secretKey: origin.secretKey,
          headers: { 'content-encoding': 'aws-chunked', 'x-amz-decoded-content-length': String(data.length) },
        });
        const scope = `${seed.headers['x-amz-date'].slice(0, 8)}/us-east-1/s3/aws4_request`;
        const body = chunkedBody({ data, chunkSize: 65536, seedSignature: seed.signature, amzDate: seed.headers['x-amz-date'], scope, secretKey: origin.secretKey });
        const { host, ...headers } = seed.headers;

        const res = await stack.send({ host, method: 'PUT', path: seed.path, headers, body });

        expectStatus(res, 200);
        expect(origin.objects.get(objectKey).body.equals(data)).toBe(true);
      });

      test('a presigned GET URL verifies', async () => {
        const objectKey = key('presigned.txt');
        await put(objectKey, 'via presigned url');
        const url = presign({ host: hostFor(), key: objectKey, accessKey: origin.accessKey, secretKey: origin.secretKey });

        const res = await stack.send({ host: url.headers.host, path: `${url.path}?${url.query}` });

        expectStatus(res, 200);
        expect(res.text()).toBe('via presigned url');
      });

      test('virtual-hosted style: the bucket is in the Host header (wildcard domain)', async () => {
        const name = uniqueKey('vhost.txt');
        const stored = await s3({ method: 'PUT', hostBucket: 'mybucket', key: name, body: 'virtual hosted' });
        expectStatus(stored.res, 200);

        const { res, host } = await s3({ method: 'GET', hostBucket: 'mybucket', key: name });

        expectStatus(res, 200);
        expect(res.text()).toBe('virtual hosted');
        expect(origin.lastRequest.headers.host).toBe(host);
        expect(origin.lastRequest.target.bucket).toBe('mybucket');
      });

      test('Expect: 100-continue uploads complete', async () => {
        const objectKey = key('expect.bin');
        const data = crypto.randomBytes(100000);

        await put(objectKey, data, { headers: { expect: '100-continue' } });

        expect(origin.objects.get(objectKey).body.equals(data)).toBe(true);
      });

      test('an S3 error from the origin reaches the client unchanged', async () => {
        const { res } = await s3({ method: 'GET', key: key('missing.txt') });

        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toBe('application/xml');
        expect(res.headers['x-amz-request-id']).toMatch(/^[0-9a-f]{16}$/);
        expect(res.text()).toContain('<Code>NoSuchKey</Code>');
      });

      test('a wrong signature is still refused (the proxy does not paper over bad credentials)', async () => {
        const objectKey = key('forged.txt');

        const out = await s3({ method: 'PUT', key: objectKey, body: 'x', secretKey: 'not-the-secret' });

        expect(out.res.status).toBe(403);
        expect(out.res.text()).toContain('SignatureDoesNotMatch');
      });

      test('DELETE removes the object', async () => {
        const objectKey = key('delete.txt');
        await put(objectKey, 'bye');

        const { res } = await s3({ method: 'DELETE', key: objectKey });

        expectStatus(res, 204);
        expect(origin.objects.has(objectKey)).toBe(false);
      });

      test('a client that accepts gzip still gets the object, byte for byte, with its ETag', async () => {
        const objectKey = key('compressible.txt');
        const text = 'The quick brown fox jumps over the lazy dog. '.repeat(5000);
        const { res: putRes } = await put(objectKey, text, { headers: { 'content-type': 'text/plain' } });

        const { res } = await s3({ method: 'GET', key: objectKey, headers: { 'accept-encoding': 'gzip, zstd' } });

        expectStatus(res, 200);
        // An S3 download must not be transformed: clients verify the ETag/MD5 and the length
        expect(res.headers['content-encoding']).toBeUndefined();
        expect(res.headers.etag).toBe(putRes.headers.etag);
        expect(res.text()).toBe(text);
      });
    });
  });
});
