const fs = require('fs');
const path = require('path');
const {
  CertificateError,
  parsePemCertificate,
  assertKeyMatchesCertificate,
  resolveCertificateDomains,
  toCertificateResponse,
} = require('../../src/utils/certificates');

const fixture = (name) => fs.readFileSync(path.join(require('../fixtures/certs/generate')(), name), 'utf8');
const CERT = fixture('app.cert.pem');
const KEY = fixture('app.key.pem');
const OTHER_KEY = fixture('other.key.pem');

describe('parsePemCertificate', () => {
  test('extracts issuer, validity and DNS SANs', () => {
    const info = parsePemCertificate(CERT);
    expect(info.issuer).toMatch(/app\.example\.com/);
    expect(info.validFrom).toBeInstanceOf(Date);
    expect(info.validTo.getUTCFullYear()).toBe(2126);
    expect(info.dnsNames).toEqual(['app.example.com', '*.apps.example.com']);
  });

  test('rejects input that is not a certificate', () => {
    expect(() => parsePemCertificate('not a cert')).toThrow(CertificateError);
    expect(() => parsePemCertificate(KEY)).toThrow('valid PEM certificate');
  });
});

describe('assertKeyMatchesCertificate', () => {
  test('accepts the matching key', () => {
    expect(() => assertKeyMatchesCertificate(CERT, KEY)).not.toThrow();
  });

  test('rejects a key from a different pair', () => {
    expect(() => assertKeyMatchesCertificate(CERT, OTHER_KEY)).toThrow('does not match');
  });

  test('rejects garbage keys with a user-facing error', () => {
    expect(() => assertKeyMatchesCertificate(CERT, 'nope')).toThrow(CertificateError);
  });
});

describe('resolveCertificateDomains', () => {
  const info = { dnsNames: ['app.example.com', '*.apps.example.com'] };

  test('defaults to the certificate SANs', () => {
    expect(resolveCertificateDomains(undefined, info)).toEqual(['app.example.com', '*.apps.example.com']);
    expect(resolveCertificateDomains('  ', info)).toEqual(['app.example.com', '*.apps.example.com']);
  });

  test('accepts requested domains covered by the certificate, including wildcard matches', () => {
    expect(resolveCertificateDomains('app.example.com, api.apps.example.com', info))
      .toEqual(['app.example.com', 'api.apps.example.com']);
  });

  test('rejects domains the certificate does not cover', () => {
    expect(() => resolveCertificateDomains('other.example.com', info)).toThrow('other.example.com');
    // a wildcard covers exactly one label
    expect(() => resolveCertificateDomains('a.b.apps.example.com', info)).toThrow(CertificateError);
  });
});

describe('toCertificateResponse', () => {
  test('never includes the private key', () => {
    const cert = { toJSON: () => ({ id: 1, name: 'x', private_key_pem: 'secret' }) };
    expect(toCertificateResponse(cert)).toEqual({ id: 1, name: 'x' });
  });
});
