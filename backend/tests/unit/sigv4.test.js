/**
 * The SigV4 helper of the e2e tests (tests/e2e/helpers/sigv4.js) against the example
 * signatures in the AWS documentation. If these pass, a SignatureDoesNotMatch in an e2e
 * test is the proxy's doing, not the helper's.
 */
const {
  EMPTY_SHA256, canonicalRequest, stringToSign, signingKey, signRequest, presign, verifyRequest, chunkedBody,
  decodeChunkedBody, awsEncode, canonicalQuery, canonicalUri,
} = require('../e2e/helpers/sigv4');
const crypto = require('crypto');

const sign = (key, string) => crypto.createHmac('sha256', key).update(string).digest('hex');

describe('against the AWS documentation examples', () => {
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html (GET Object with Range)
  test('S3 GET Object with a Range header', () => {
    const secretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const headers = {
      host: 'examplebucket.s3.amazonaws.com',
      range: 'bytes=0-9',
      'x-amz-content-sha256': EMPTY_SHA256,
      'x-amz-date': '20130524T000000Z',
    };
    const canonical = canonicalRequest(
      { method: 'GET', path: '/test.txt', query: '', headers },
      ['host', 'range', 'x-amz-content-sha256', 'x-amz-date'],
      EMPTY_SHA256,
    );
    expect(canonical).toBe([
      'GET', '/test.txt', '',
      'host:examplebucket.s3.amazonaws.com', 'range:bytes=0-9',
      `x-amz-content-sha256:${EMPTY_SHA256}`, 'x-amz-date:20130524T000000Z', '',
      'host;range;x-amz-content-sha256;x-amz-date', EMPTY_SHA256,
    ].join('\n'));
    const signature = sign(
      signingKey(secretKey, '20130524', 'us-east-1', 's3'),
      stringToSign('20130524T000000Z', '20130524/us-east-1/s3/aws4_request', canonical),
    );
    expect(signature).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  });

  // The AWS Signature V4 test suite, "get-vanilla"
  test('the generic get-vanilla vector', () => {
    const canonical = canonicalRequest(
      { method: 'GET', path: '/', query: '', headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' } },
      ['host', 'x-amz-date'],
      EMPTY_SHA256,
    );
    const signature = sign(
      signingKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20150830', 'us-east-1', 'service'),
      stringToSign('20150830T123600Z', '20150830/us-east-1/service/aws4_request', canonical),
    );
    expect(signature).toBe('5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });
});

describe('signer and verifier agree', () => {
  const accessKey = 'AKIATEST';
  const secrets = { AKIATEST: 'secret-key' };
  const lookup = (key) => secrets[key];
  const toRequest = (signed) => ({
    method: signed.method,
    url: signed.query ? `${signed.path}?${signed.query}` : signed.path,
    headers: signed.headers,
  });

  test('a signed request verifies, a tampered one does not', () => {
    const signed = signRequest({ method: 'PUT', host: 's3.example.test:8443', key: 'bkt/some file+1~.txt', query: 'partNumber=2&uploadId=abc', body: 'hello', accessKey, secretKey: 'secret-key' });

    expect(verifyRequest(toRequest(signed), lookup).ok).toBe(true);
    expect(verifyRequest({ ...toRequest(signed), headers: { ...signed.headers, host: 's3.example.test' } }, lookup))
      .toMatchObject({ ok: false, code: 'SignatureDoesNotMatch' });
    expect(verifyRequest({ ...toRequest(signed), url: toRequest(signed).url.replace('bkt/', 'bkt//') }, lookup))
      .toMatchObject({ ok: false, code: 'SignatureDoesNotMatch' });
  });

  test('a presigned URL verifies', () => {
    const url = presign({ host: 's3.example.test', key: 'bkt/obj', accessKey, secretKey: 'secret-key' });

    expect(verifyRequest({ method: 'GET', url: `${url.path}?${url.query}`, headers: url.headers }, lookup).ok).toBe(true);
  });

  test('an aws-chunked body round-trips and a changed byte is caught', () => {
    const data = crypto.randomBytes(100000);
    const seed = signRequest({ method: 'PUT', host: 's3.example.test', key: 'bkt/big', payloadHash: 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD', body: Buffer.alloc(0), accessKey, secretKey: 'secret-key', headers: { 'content-encoding': 'aws-chunked', 'x-amz-decoded-content-length': String(data.length) } });
    const verdict = verifyRequest(toRequest(seed), lookup);
    expect(verdict.ok).toBe(true);

    const body = chunkedBody({ data, chunkSize: 16384, seedSignature: seed.signature, amzDate: seed.headers['x-amz-date'], scope: verdict.scope, secretKey: 'secret-key' });
    const params = { seedSignature: verdict.signature, amzDate: verdict.amzDate, scope: verdict.scope, secret: verdict.secret };

    expect(decodeChunkedBody(body, params).equals(data)).toBe(true);
    const damaged = Buffer.from(body);
    damaged[200] ^= 0xff;
    expect(decodeChunkedBody(damaged, params)).toBeNull();
  });
});

describe('encoding', () => {
  test('awsEncode keeps only the unreserved characters', () => {
    expect(awsEncode('a b+c~d/é')).toBe('a%20b%2Bc~d%2F%C3%A9');
    expect(awsEncode('dir/file', { keepSlash: true })).toBe('dir/file');
  });

  test('the canonical URI is decoded and encoded once, and keeps empty segments', () => {
    expect(canonicalUri('/bkt/a%20b//c%2Bd')).toBe('/bkt/a%20b//c%2Bd');
  });

  test('the canonical query is sorted, and a bare subresource gets an empty value', () => {
    expect(canonicalQuery('versionId=2&acl&a=b+c')).toBe('a=b%20c&acl=&versionId=2');
  });
});
