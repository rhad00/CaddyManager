const { isRestrictedHost } = require('../../src/utils/ssrf');

describe('isRestrictedHost', () => {
  test.each([
    // names
    'localhost', 'LOCALHOST', 'localhost.', 'app.localhost', 'metadata.google.internal',
    'metadata.google.internal.', 'metadata.internal',
    // IPv4 private / loopback / link-local / reserved
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '192.0.2.1', '198.18.0.1', '198.51.100.7', '203.0.113.9',
    '240.0.0.1', '255.255.255.255',
    // IPv6
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '0:0:0:0:0:0:0:1',
    // IPv4-mapped / embedded IPv6 forms (previous bypasses)
    '::ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:7f00:1',
    '::7f00:1', '64:ff9b::a9fe:a9fe',
  ])('blocks %s', (host) => {
    expect(isRestrictedHost(host)).toBe(true);
  });

  test.each([
    'app', 'api.example.com', 'caddymanager-frontend', '8.8.8.8', '1.1.1.1', '172.32.0.1',
    '2606:4700:4700::1111', '::ffff:808:808', 'localhost-api', 'notlocalhost',
  ])('allows %s', (host) => {
    expect(isRestrictedHost(host)).toBe(false);
  });
});
