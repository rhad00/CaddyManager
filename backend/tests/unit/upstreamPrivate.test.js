const { validateUpstreamUrl } = require('../../src/utils/proxyValidation');

const RESTRICTED = {
  valid: false,
  message: 'Upstream URL points to a restricted address',
};

describe('validateUpstreamUrl with UPSTREAM_ALLOW_PRIVATE', () => {
  afterEach(() => {
    delete process.env.UPSTREAM_ALLOW_PRIVATE;
  });

  test('rejects a private upstream by default', () => {
    expect(validateUpstreamUrl('https://10.35.1.14')).toEqual(RESTRICTED);
  });

  test.each([
    'https://10.35.1.14',
    'https://10.35.1.14:443',
    'http://192.168.1.4:8080',
    '10.35.1.14:443',
  ])('accepts %s when enabled', (url) => {
    process.env.UPSTREAM_ALLOW_PRIVATE = 'true';
    expect(validateUpstreamUrl(url).valid).toBe(true);
  });

  test.each([
    'http://127.0.0.1:2019',
    'http://169.254.169.254/',
    'http://localhost:3000',
    'http://[::1]:8080',
  ])('still rejects %s when enabled', (url) => {
    process.env.UPSTREAM_ALLOW_PRIVATE = 'true';
    expect(validateUpstreamUrl(url)).toEqual(RESTRICTED);
  });

  test('the structural rules still apply when enabled', () => {
    process.env.UPSTREAM_ALLOW_PRIVATE = 'true';
    expect(validateUpstreamUrl('https://10.35.1.14/some/path').valid).toBe(false);
  });
});
