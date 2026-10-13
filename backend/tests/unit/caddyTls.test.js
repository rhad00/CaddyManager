const {
  MANAGED_TAG,
  withCustomCertificates,
  withoutCustomCertificates,
} = require('../../src/utils/caddyTls');

const certs = [
  { id: 1, certificate_pem: 'CERT1', private_key_pem: 'KEY1' },
  { id: 2, certificate_pem: 'CERT2', private_key_pem: 'KEY2' },
];

describe('withCustomCertificates', () => {
  test('adds tagged load_pem entries without mutating the input', () => {
    const config = { apps: { http: { servers: {} } } };
    const result = withCustomCertificates(config, certs);

    expect(result.apps.tls.certificates.load_pem).toEqual([
      { certificate: 'CERT1', key: 'KEY1', tags: [MANAGED_TAG, 'caddymanager-cert-1'] },
      { certificate: 'CERT2', key: 'KEY2', tags: [MANAGED_TAG, 'caddymanager-cert-2'] },
    ]);
    expect(config.apps.tls).toBeUndefined();
  });

  test('replaces previously managed entries and keeps foreign ones', () => {
    const config = {
      apps: {
        tls: {
          automation: { policies: [{ subjects: ['x'] }] },
          certificates: {
            load_pem: [
              { certificate: 'OLD', key: 'OLDKEY', tags: [MANAGED_TAG, 'caddymanager-cert-9'] },
              { certificate: 'MINE', key: 'MINEKEY', tags: ['hand-made'] },
            ],
          },
        },
      },
    };
    const result = withCustomCertificates(config, [certs[0]]);

    expect(result.apps.tls.certificates.load_pem.map((e) => e.certificate)).toEqual(['MINE', 'CERT1']);
    expect(result.apps.tls.automation).toEqual(config.apps.tls.automation);
  });

  test('handles a null config (fresh Caddy) and an empty certificate list', () => {
    expect(withCustomCertificates(null, [])).toEqual({});
    expect(withCustomCertificates({ apps: {} }, [])).toEqual({ apps: {} });
  });
});

describe('withoutCustomCertificates', () => {
  test('strips managed private keys and empty containers', () => {
    const config = withCustomCertificates({ apps: { http: {} } }, certs);
    const stripped = withoutCustomCertificates(config);

    expect(JSON.stringify(stripped)).not.toMatch(/KEY1|KEY2/);
    expect(stripped).toEqual({ apps: { http: {} } });
    // input untouched
    expect(config.apps.tls.certificates.load_pem).toHaveLength(2);
  });

  test('keeps entries CaddyManager does not own', () => {
    const config = {
      apps: { tls: { certificates: { load_pem: [{ certificate: 'MINE', key: 'K', tags: ['other'] }] } } },
    };
    expect(withoutCustomCertificates(config)).toEqual(config);
  });

  test('passes through configs without TLS', () => {
    expect(withoutCustomCertificates(null)).toBeNull();
    expect(withoutCustomCertificates({ apps: { http: {} } })).toEqual({ apps: { http: {} } });
  });
});
