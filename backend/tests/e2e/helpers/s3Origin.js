/**
 * An in-memory S3 origin that is as strict as radosgw about everything a reverse proxy can
 * damage: the SigV4 signature (Host, path, query and signed headers as they arrive), header
 * values (an empty Content-MD5 or x-amz-acl is rejected, not ignored), the payload digest and
 * aws-chunked bodies. Every request is recorded, so a test can say what the origin saw.
 *
 * Errors are S3 XML. The reason for a rejection is in the body, with the canonical request
 * the origin computed, so a failing test explains itself.
 */
const http = require('http');
const crypto = require('crypto');
const { sha256Hex, verifyRequest, decodeChunkedBody, STREAMING_PAYLOAD, UNSIGNED_PAYLOAD } = require('./sigv4');

const CANNED_ACLS = ['private', 'public-read', 'public-read-write', 'authenticated-read', 'bucket-owner-read', 'bucket-owner-full-control'];

const xml = (body) => `<?xml version="1.0" encoding="UTF-8"?>${body}`;
const errorXml = (code, message, extra = '') => xml(`<Error><Code>${code}</Code><Message>${message}</Message>${extra}</Error>`);
const STATUS = {
  SignatureDoesNotMatch: 403, AccessDenied: 403, InvalidAccessKeyId: 403, InvalidDigest: 400, BadDigest: 400,
  InvalidArgument: 400, InvalidRequest: 400, AuthorizationHeaderMalformed: 400, NoSuchKey: 404, NoSuchBucket: 404,
  PreconditionFailed: 412, NotImplemented: 501, InvalidRange: 416,
};

/**
 * @param options.accessKey / secretKey  the one credential the origin knows
 * @param options.dnsName  the virtual-host domain (radosgw: rgw_dns_name); Host `bucket.<dnsName>` is bucket-style
 */
function createS3Origin({ accessKey = 'AKIAE2ETEST', secretKey = 'e2e-secret-key', dnsName = 's3.example.test' } = {}) {
  const objects = new Map(); // "bucket/key" -> { body, etag, contentType, lastModified, meta }
  const uploads = new Map(); // uploadId -> { key, parts: Map }
  const requests = [];

  function resolveTarget(host, rawPath) {
    const hostName = String(host || '').replace(/:\d+$/, '').toLowerCase();
    const decoded = decodeURIComponent(rawPath);
    if (hostName.endsWith(`.${dnsName}`)) {
      return { bucket: hostName.slice(0, -(dnsName.length + 1)), key: decoded.replace(/^\//, ''), style: 'virtual' };
    }
    const [, bucket = '', ...rest] = decoded.split('/');
    return { bucket, key: rest.join('/'), style: 'path' };
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  function reply(res, status, headers, body = '') {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
    res.writeHead(status, {
      'x-amz-request-id': crypto.randomBytes(8).toString('hex'),
      'content-length': payload.length,
      ...headers,
    });
    res.end(payload);
  }

  function fail(res, code, message, extra = {}) {
    const headers = { 'content-type': 'application/xml', ...(extra.headers || {}) };
    reply(res, STATUS[code] || 400, headers, errorXml(code, message, extra.xml || ''));
  }

  // Header checks radosgw makes before it looks at the body
  function checkHeaders(headers) {
    if ('content-md5' in headers) {
      const md5 = Buffer.from(headers['content-md5'], 'base64');
      if (md5.length !== 16) return ['InvalidDigest', `The Content-MD5 you specified is not valid: "${headers['content-md5']}"`];
    }
    if ('x-amz-acl' in headers && !CANNED_ACLS.includes(headers['x-amz-acl'])) {
      return ['InvalidArgument', `Invalid canned ACL: "${headers['x-amz-acl']}"`];
    }
    if (typeof headers.authorization === 'string' && headers.authorization.includes(',,')) {
      return ['InvalidArgument', 'Malformed Authorization header'];
    }
    return null;
  }

  async function handle(req, res) {
    const rawBody = await readBody(req);
    const record = {
      method: req.method, url: req.url, headers: req.headers, rawHeaders: req.rawHeaders,
      httpVersion: req.httpVersion, remoteAddress: req.socket.remoteAddress, rawBody, verdict: null, status: null,
    };
    requests.push(record);
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = (status, ...rest) => { record.status = status; return originalWriteHead(status, ...rest); };

    const verdict = verifyRequest(req, (key) => (key === accessKey ? secretKey : null));
    record.verdict = verdict;
    if (!verdict.ok) {
      return fail(res, verdict.code, verdict.message, {
        headers: { 'x-debug-host': String(req.headers.host), 'x-debug-canonical': Buffer.from(verdict.canonical || '').toString('base64') },
        xml: `<Host>${req.headers.host}</Host>`,
      });
    }
    const headerProblem = checkHeaders(req.headers);
    if (headerProblem) return fail(res, headerProblem[0], headerProblem[1]);

    // Payload: the body must match the digest that was signed
    let body = rawBody;
    const declared = req.headers['x-amz-content-sha256'];
    if (declared === STREAMING_PAYLOAD) {
      body = decodeChunkedBody(rawBody, { seedSignature: verdict.signature, amzDate: verdict.amzDate, scope: verdict.scope, secret: verdict.secret });
      if (!body) return fail(res, 'SignatureDoesNotMatch', 'A chunk signature does not match');
      if (Number(req.headers['x-amz-decoded-content-length']) !== body.length) {
        return fail(res, 'InvalidRequest', 'x-amz-decoded-content-length does not match the decoded body');
      }
    } else if (declared && declared !== UNSIGNED_PAYLOAD && sha256Hex(rawBody) !== declared) {
      return fail(res, 'BadDigest', 'The x-amz-content-sha256 you specified did not match what we received');
    }
    if (req.headers['content-md5']) {
      const md5 = crypto.createHash('md5').update(body).digest('base64');
      if (md5 !== req.headers['content-md5']) return fail(res, 'BadDigest', 'The Content-MD5 you specified did not match what we received');
    }

    const [rawPath, rawQuery = ''] = req.url.split('?');
    const query = new URLSearchParams(rawQuery);
    const { bucket, key } = resolveTarget(req.headers.host, rawPath);
    const id = `${bucket}/${key}`;
    record.target = { bucket, key };

    // ---- bucket level
    if (!key) {
      if (req.method === 'PUT') return reply(res, 200, {});
      if (req.method === 'GET' && (query.get('list-type') === '2' || !rawQuery || query.has('prefix'))) {
        const prefix = query.get('prefix') || '';
        const keys = [...objects.keys()].filter((k) => k.startsWith(`${bucket}/`)).map((k) => k.slice(bucket.length + 1)).filter((k) => k.startsWith(prefix)).sort();
        return reply(res, 200, { 'content-type': 'application/xml' }, xml(`<ListBucketResult><Name>${bucket}</Name><KeyCount>${keys.length}</KeyCount>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`));
      }
      if (req.method === 'HEAD') return reply(res, 200, {});
    }

    // ---- multipart
    if (req.method === 'POST' && query.has('uploads')) {
      const uploadId = crypto.randomBytes(6).toString('hex');
      uploads.set(uploadId, { id, parts: new Map() });
      return reply(res, 200, { 'content-type': 'application/xml' }, xml(`<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`));
    }
    if (req.method === 'PUT' && query.has('partNumber') && query.has('uploadId')) {
      const upload = uploads.get(query.get('uploadId'));
      if (!upload) return fail(res, 'NoSuchKey', 'NoSuchUpload');
      upload.parts.set(Number(query.get('partNumber')), body);
      return reply(res, 200, { etag: `"${crypto.createHash('md5').update(body).digest('hex')}"` });
    }
    if (req.method === 'POST' && query.has('uploadId')) {
      const upload = uploads.get(query.get('uploadId'));
      if (!upload) return fail(res, 'NoSuchKey', 'NoSuchUpload');
      const whole = Buffer.concat([...upload.parts.entries()].sort((a, b) => a[0] - b[0]).map(([, part]) => part));
      objects.set(upload.id, { body: whole, etag: `"${crypto.createHash('md5').update(whole).digest('hex')}-${upload.parts.size}"`, contentType: 'application/octet-stream', lastModified: new Date(), meta: {} });
      uploads.delete(query.get('uploadId'));
      return reply(res, 200, { 'content-type': 'application/xml' }, xml(`<CompleteMultipartUploadResult><Key>${key}</Key></CompleteMultipartUploadResult>`));
    }
    if (req.method === 'DELETE' && query.has('uploadId')) {
      uploads.delete(query.get('uploadId'));
      return reply(res, 204, {});
    }

    // ---- object level
    if (req.method === 'PUT') {
      const meta = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.startsWith('x-amz-meta-')));
      const etag = `"${crypto.createHash('md5').update(body).digest('hex')}"`;
      objects.set(id, { body, etag, contentType: req.headers['content-type'] || 'binary/octet-stream', lastModified: new Date(), meta });
      return reply(res, 200, { etag });
    }
    if (req.method === 'DELETE') {
      objects.delete(id);
      return reply(res, 204, {});
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const object = objects.get(id);
      if (!object) return fail(res, 'NoSuchKey', `The specified key does not exist: ${key}`);
      if (query.has('acl')) return reply(res, 200, { 'content-type': 'application/xml' }, xml('<AccessControlPolicy/>'));
      const common = {
        etag: object.etag, 'last-modified': object.lastModified.toUTCString(), 'accept-ranges': 'bytes',
        'content-type': object.contentType, ...object.meta,
      };
      if (req.headers['if-none-match'] === object.etag) return reply(res, 304, common);
      if (req.headers['if-match'] && req.headers['if-match'] !== object.etag) return fail(res, 'PreconditionFailed', 'If-Match failed');
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range) {
        const start = range[1] === '' ? Math.max(object.body.length - Number(range[2]), 0) : Number(range[1]);
        const end = range[1] === '' || range[2] === '' ? object.body.length - 1 : Math.min(Number(range[2]), object.body.length - 1);
        if (start > end || start >= object.body.length) return fail(res, 'InvalidRange', 'The requested range is not satisfiable');
        const slice = object.body.subarray(start, end + 1);
        const headers = { ...common, 'content-range': `bytes ${start}-${end}/${object.body.length}` };
        if (req.method === 'HEAD') return reply(res, 206, { ...headers, 'content-length': slice.length });
        return reply(res, 206, headers, slice);
      }
      if (req.method === 'HEAD') return reply(res, 200, { ...common, 'content-length': object.body.length });
      return reply(res, 200, common, object.body);
    }
    return fail(res, 'NotImplemented', `${req.method} is not implemented`);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) fail(res, 'InvalidRequest', String(error && error.message));
    });
  });

  return {
    accessKey,
    secretKey,
    dnsName,
    requests,
    objects,
    get lastRequest() { return requests[requests.length - 1]; },
    start: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    stop: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
    reset: () => { requests.length = 0; objects.clear(); uploads.clear(); },
  };
}

module.exports = { createS3Origin };
