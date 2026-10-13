const { parseUpstream } = require('../../src/utils/upstream');

describe('parseUpstream', () => {
  test.each([
    ['http://app:8080', { dial: 'app:8080', useTls: false }],
    ['http://app', { dial: 'app:80', useTls: false }],
    ['https://secure-app', { dial: 'secure-app:443', useTls: true }],
    ['https://secure-app:8443', { dial: 'secure-app:8443', useTls: true }],
    ['http://app:8080/', { dial: 'app:8080', useTls: false }],
    ['app:3000', { dial: 'app:3000', useTls: false }],
    ['secure-app:443', { dial: 'secure-app:443', useTls: true }],
    ['app', { dial: 'app:80', useTls: false }],
    ['  http://app:8080  ', { dial: 'app:8080', useTls: false }],
    ['http://[2001:db8::1]:8080', { dial: '[2001:db8::1]:8080', useTls: false }],
    ['HTTP://App.Example.com:81', { dial: 'app.example.com:81', useTls: false }],
  ])('%s -> %o', (input, expected) => {
    expect(parseUpstream(input)).toMatchObject(expected);
  });

  test.each([
    ['', 'Upstream URL is required'],
    [null, 'Upstream URL is required'],
    ['ftp://app:21', 'Upstream URL must use http or https protocol'],
    ['http://app:8080/api', 'Upstream URL must not include a path or query'],
    ['http://app:8080?x=1', 'Upstream URL must not include a path or query'],
    ['http://user:pass@app:8080', 'Upstream URL must not include credentials'],
    ['http://', 'Invalid upstream URL format'],
  ])('rejects %p', (input, message) => {
    expect(() => parseUpstream(input)).toThrow(message);
  });

  test('returns hostname for SSRF checks', () => {
    expect(parseUpstream('http://10.0.0.5:80').hostname).toBe('10.0.0.5');
  });
});
