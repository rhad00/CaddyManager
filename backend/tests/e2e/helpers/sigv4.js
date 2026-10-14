/**
 * AWS Signature Version 4 for S3, written for the e2e tests: a signer (the S3 client) and a
 * verifier (the origin, as strict as radosgw). Validated against the AWS documentation's
 * example signatures in tests/unit/sigv4.test.js, so a proxy bug cannot hide behind a
 * helper bug.
 *
 * What makes SigV4 hard for a reverse proxy: the signature covers the HTTP method, the
 * request path and query as the origin will parse them, the Host header (with the port when
 * it is not the scheme's default) and every header named in SignedHeaders. A proxy that
 * rewrites any of them (Host, merged slashes, re-encoded paths, added or emptied headers)
 * makes the origin answer SignatureDoesNotMatch.
 */
const crypto = require('crypto');

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

const EMPTY_SHA256 = sha256Hex('');
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const STREAMING_PAYLOAD = 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD';

/** RFC 3986 encoding as AWS wants it: only A-Z a-z 0-9 - _ . ~ stay; '/' stays when asked */
function awsEncode(value, { keepSlash = false } = {}) {
  let out = '';
  for (const byte of Buffer.from(value, 'utf8')) {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(char) || (keepSlash && char === '/')) out += char;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** Percent-decode without treating '+' as a space (the way S3 reads a path) */
const decodePath = (value) => decodeURIComponent(value);
/** Query strings are form-decoded by most servers: '+' is a space */
const decodeQuery = (value) => decodeURIComponent(value.replace(/\+/g, ' '));

/** What a server derives from the raw request target: the canonical URI (S3: encoded once) */
function canonicalUri(rawPath) {
  const decoded = rawPath.split('/').map((segment) => (segment === '' ? '' : decodePath(segment)));
  return decoded.map((segment) => awsEncode(segment)).join('/') || '/';
}

/** Canonical query string from the raw query: decode, re-encode, sort by name then value */
function canonicalQuery(rawQuery, { skip = [] } = {}) {
  if (!rawQuery) return '';
  return rawQuery.split('&').filter(Boolean).map((pair) => {
    const index = pair.indexOf('=');
    const name = index === -1 ? pair : pair.slice(0, index);
    const value = index === -1 ? '' : pair.slice(index + 1);
    return [decodeQuery(name), decodeQuery(value)];
  }).filter(([name]) => !skip.includes(name))
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : (a[0] < b[0] ? -1 : 1)))
    .map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`)
    .join('&');
}

const canonicalHeaderValue = (value) => String(value).trim().replace(/\s+/g, ' ');

function signingKey(secretKey, date, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secretKey}`, date), region), service), 'aws4_request');
}

/**
 * @param request  { method, path (raw, as sent), query (raw, no '?'), headers (name -> value or [values]) }
 * @param signedHeaderNames  lower-case names, sorted
 */
function canonicalRequest({ method, path, query, headers }, signedHeaderNames, payloadHash, { skipQuery = [] } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const canonicalHeaders = signedHeaderNames.map((name) => {
    const raw = lower[name];
    const value = Array.isArray(raw) ? raw.map(canonicalHeaderValue).join(',') : canonicalHeaderValue(raw === undefined ? '' : raw);
    return `${name}:${value}\n`;
  }).join('');
  return [
    method,
    canonicalUri(path),
    canonicalQuery(query, { skip: skipQuery }),
    canonicalHeaders,
    signedHeaderNames.join(';'),
    payloadHash,
  ].join('\n');
}

function stringToSign(amzDate, scope, canonical) {
  return ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
}

const amzDateOf = (date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '');

/**
 * Sign a request the way an S3 SDK does (header authentication).
 * @param key  the object key or path, unencoded ("bucket/dir/file name.txt"); encoded here
 * @returns the request to send: { method, path, query, headers, body }
 */
function signRequest({
  method = 'GET', host, key = '', rawPath, query = '', headers = {}, body = Buffer.alloc(0),
  payloadHash, accessKey, secretKey, region = 'us-east-1', service = 's3', date = new Date(),
  signHeaders,
}) {
  const path = rawPath !== undefined ? rawPath : `/${key.split('/').map((s) => awsEncode(s)).join('/')}`;
  const amzDate = amzDateOf(date);
  const day = amzDate.slice(0, 8);
  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const payload = payloadHash || sha256Hex(bodyBuffer);

  const toSend = { host, 'x-amz-content-sha256': payload, 'x-amz-date': amzDate, ...headers };
  // Sign host, x-amz-* and the headers a strict server requires to be covered
  const names = (signHeaders || Object.keys(toSend).filter((n) => {
    const lower = n.toLowerCase();
    return lower === 'host' || lower.startsWith('x-amz-') || ['content-type', 'content-md5', 'range'].includes(lower);
  }).map((n) => n.toLowerCase())).sort();

  const canonical = canonicalRequest({ method, path, query, headers: toSend }, names, payload);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const signature = crypto.createHmac('sha256', signingKey(secretKey, day, region, service))
    .update(stringToSign(amzDate, scope, canonical)).digest('hex');

  toSend.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  return { method, path, query, headers: toSend, body: bodyBuffer, signature, canonical };
}

/** A presigned URL: authentication in the query string, payload unsigned */
function presign({
  method = 'GET', host, key = '', query = '', accessKey, secretKey, region = 'us-east-1', service = 's3',
  date = new Date(), expires = 300,
}) {
  const path = `/${key.split('/').map((s) => awsEncode(s)).join('/')}`;
  const amzDate = amzDateOf(date);
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const auth = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKey}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ].map(([n, v]) => `${awsEncode(n)}=${awsEncode(v)}`).join('&');
  const fullQuery = query ? `${query}&${auth}` : auth;
  const canonical = canonicalRequest({ method, path, query: fullQuery, headers: { host } }, ['host'], UNSIGNED_PAYLOAD);
  const signature = crypto.createHmac('sha256', signingKey(secretKey, day, region, service))
    .update(stringToSign(amzDate, scope, canonical)).digest('hex');
  return { method, path, query: `${fullQuery}&X-Amz-Signature=${signature}`, headers: { host } };
}

/** Body of a STREAMING-AWS4-HMAC-SHA256-PAYLOAD upload: signed chunks, chained from the seed signature */
function chunkedBody({ data, chunkSize, seedSignature, amzDate, scope, secretKey, region = 'us-east-1', service = 's3' }) {
  const day = amzDate.slice(0, 8);
  const key = signingKey(secretKey, day, region, service);
  const parts = [];
  let previous = seedSignature;
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) chunks.push(data.subarray(offset, offset + chunkSize));
  chunks.push(Buffer.alloc(0));
  for (const chunk of chunks) {
    const toSign = ['AWS4-HMAC-SHA256-PAYLOAD', amzDate, scope, previous, EMPTY_SHA256, sha256Hex(chunk)].join('\n');
    const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
    parts.push(Buffer.from(`${chunk.length.toString(16)};chunk-signature=${signature}\r\n`), chunk, Buffer.from('\r\n'));
    previous = signature;
  }
  return Buffer.concat(parts);
}

/** Wire size of a chunked body for the given data (the signature does not change the length) */
function decodedLength(data) { return data.length; }

/**
 * Verify a received request the way a strict S3 server does. Everything is read from what
 * arrived on the wire.
 * @returns {{ ok: true, payloadHash, signature } | { ok: false, code, message, canonical? }}
 */
function verifyRequest({ method, url, headers }, lookupSecret, { region = 'us-east-1', service = 's3' } = {}) {
  const [rawPath, rawQuery = ''] = url.split('?');
  const queryParams = new URLSearchParams(rawQuery);
  const presigned = queryParams.has('X-Amz-Signature');

  let credential; let signedNames; let signature; let amzDate; let payloadHash;
  if (presigned) {
    credential = queryParams.get('X-Amz-Credential');
    signedNames = (queryParams.get('X-Amz-SignedHeaders') || '').split(';');
    signature = queryParams.get('X-Amz-Signature');
    amzDate = queryParams.get('X-Amz-Date');
    payloadHash = UNSIGNED_PAYLOAD;
  } else {
    const authorization = headers.authorization;
    if (!authorization) return { ok: false, code: 'AccessDenied', message: 'Missing Authorization header' };
    const match = /^AWS4-HMAC-SHA256 Credential=([^,\s]+),\s*SignedHeaders=([^,\s]+),\s*Signature=([0-9a-f]{64})$/.exec(authorization);
    if (!match) return { ok: false, code: 'InvalidArgument', message: `Unparseable Authorization header: ${authorization}` };
    [, credential, , signature] = match;
    signedNames = match[2].split(';');
    amzDate = headers['x-amz-date'];
    payloadHash = headers['x-amz-content-sha256'];
    if (!payloadHash) return { ok: false, code: 'InvalidRequest', message: 'Missing x-amz-content-sha256' };
  }

  const [accessKey, day, credRegion, credService] = credential.split('/');
  const secret = lookupSecret(accessKey);
  if (!secret) return { ok: false, code: 'InvalidAccessKeyId', message: `Unknown access key ${accessKey}` };
  if (credRegion !== region || credService !== service) {
    return { ok: false, code: 'AuthorizationHeaderMalformed', message: `Bad scope ${credRegion}/${credService}` };
  }
  // A signed header the request does not carry is a signature over an empty value: strict servers refuse
  if (!signedNames.includes('host')) return { ok: false, code: 'AccessDenied', message: 'host must be signed' };

  const canonical = canonicalRequest({ method, path: rawPath, query: rawQuery, headers }, signedNames, payloadHash, {
    skipQuery: presigned ? ['X-Amz-Signature'] : [],
  });
  const scope = `${day}/${credRegion}/${credService}/aws4_request`;
  const expected = crypto.createHmac('sha256', signingKey(secret, day, credRegion, credService))
    .update(stringToSign(amzDate, scope, canonical)).digest('hex');
  if (expected !== signature) {
    return { ok: false, code: 'SignatureDoesNotMatch', message: 'The request signature we calculated does not match', canonical };
  }
  return { ok: true, payloadHash, signature, scope, amzDate, secret };
}

/** Verify and decode an aws-chunked body; null when a chunk signature is wrong */
function decodeChunkedBody(body, { seedSignature, amzDate, scope, secret, region = 'us-east-1', service = 's3' }) {
  const day = amzDate.slice(0, 8);
  const key = signingKey(secret, day, region, service);
  let offset = 0;
  let previous = seedSignature;
  const out = [];
  for (;;) {
    const lineEnd = body.indexOf('\r\n', offset);
    if (lineEnd === -1) return null;
    const match = /^([0-9a-f]+);chunk-signature=([0-9a-f]{64})$/.exec(body.subarray(offset, lineEnd).toString());
    if (!match) return null;
    const size = parseInt(match[1], 16);
    const chunk = body.subarray(lineEnd + 2, lineEnd + 2 + size);
    const toSign = ['AWS4-HMAC-SHA256-PAYLOAD', amzDate, scope, previous, EMPTY_SHA256, sha256Hex(chunk)].join('\n');
    const expected = crypto.createHmac('sha256', key).update(toSign).digest('hex');
    if (expected !== match[2]) return null;
    previous = expected;
    if (size === 0) return Buffer.concat(out);
    out.push(chunk);
    offset = lineEnd + 2 + size + 2;
  }
}

module.exports = {
  EMPTY_SHA256,
  UNSIGNED_PAYLOAD,
  STREAMING_PAYLOAD,
  sha256Hex,
  awsEncode,
  canonicalUri,
  canonicalQuery,
  canonicalRequest,
  stringToSign,
  signingKey,
  signRequest,
  presign,
  chunkedBody,
  decodedLength,
  verifyRequest,
  decodeChunkedBody,
  amzDateOf,
};
