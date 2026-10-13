const axios = require('axios');
const child = require('child_process');
const fs = require('fs');
const path = require('path');

jest.mock('axios');
jest.mock('child_process');

// Mock the models to avoid database dependencies
jest.mock('../../src/models', () => ({
  Certificate: {},
  CertificateAuthority: {},
  Proxy: {},
  User: {},
  Template: {},
  Header: {},
  Middleware: {},
  Backup: {},
  AuditLog: {},
  Metric: {}
}));

const certificateService = require('../../src/services/certificateService');
const { Certificate, Proxy } = require('../../src/models');
const caddyService = require('../../src/services/caddyService');
const { CertificateError } = require('../../src/utils/certificates');

describe('CertificateService real tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncCertificates (TLS probe, no fake Caddy endpoint)', () => {
    const observedRow = (domain, status = 'valid') => ({
      caddy_cert_id: `observed:${domain}`, status, update: jest.fn(),
    });

    test('upserts observed ACME certificates and revokes ones no longer proxied', async () => {
      Proxy.findAll = jest.fn().mockResolvedValue([
        { domains: ['a.example.com', '*.wild.example.com'] },
        { domains: ['b.example.com'] },
      ]);
      const existingA = observedRow('a.example.com');
      const stale = observedRow('gone.example.com');
      Certificate.findAll = jest.fn().mockResolvedValue([existingA, stale]);
      Certificate.create = jest.fn().mockResolvedValue({});
      jest.spyOn(caddyService, 'verifyTlsForDomains').mockResolvedValue({
        ok: false,
        results: [
          { domain: 'a.example.com', ok: true, issuer: "Let's Encrypt", validFrom: 'Jan 1 00:00:00 2026 GMT', validTo: 'Jan 1 00:00:00 2099 GMT' },
          { domain: 'b.example.com', ok: false, error: 'ECONNREFUSED' },
        ],
      });

      const summary = await certificateService.syncCertificates();

      // wildcards are not probed
      expect(caddyService.verifyTlsForDomains).toHaveBeenCalledWith(['a.example.com', 'b.example.com']);
      expect(existingA.update).toHaveBeenCalledWith(expect.objectContaining({ issuer: "Let's Encrypt", status: 'valid' }));
      expect(stale.update).toHaveBeenCalledWith({ status: 'revoked' });
      expect(Certificate.create).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ added: 0, updated: 1, revoked: 1, failed: [{ domain: 'b.example.com', error: 'ECONNREFUSED' }] });
      expect(axios.get).not.toHaveBeenCalled();
    });
  });

  test('getCertificatesForDomain matches exact domains only and never probes', async () => {
    Certificate.findAll = jest.fn().mockResolvedValue([
      { domains: 'app.example.com,www.example.com' },
      { domains: 'myapp.example.com' },
    ]);
    const spy = jest.spyOn(caddyService, 'verifyTlsForDomains');

    const result = await certificateService.getCertificatesForDomain('APP.example.com');

    expect(result).toEqual([{ domains: 'app.example.com,www.example.com' }]);
    expect(spy).not.toHaveBeenCalled();
  });

  describe('renewCertificate', () => {
    test('rejects ACME certificates with an explanation (Caddy renews them)', async () => {
      await expect(certificateService.renewCertificate({ type: 'acme' }))
        .rejects.toThrow(/renews ACME certificates automatically/);
      await expect(certificateService.renewCertificate({ type: 'acme' })).rejects.toBeInstanceOf(CertificateError);
    });

    test('rejects uploaded certificates', async () => {
      await expect(certificateService.renewCertificate({ type: 'uploaded' })).rejects.toBeInstanceOf(CertificateError);
    });

    test('regenerates self-signed certificates with the same domains and validity', async () => {
      const pems = {
        certificatePem: fs.readFileSync(path.join(__dirname, '../fixtures/certs/app.cert.pem'), 'utf8'),
        privateKeyPem: 'KEY',
      };
      jest.spyOn(certificateService, 'createSelfSignedPem').mockResolvedValue(pems);
      jest.spyOn(caddyService, 'syncCustomCertificates').mockResolvedValue();
      const cert = {
        type: 'self-signed',
        domains: 'app.example.com',
        valid_from: '2026-01-01T00:00:00Z',
        valid_to: '2026-03-02T00:00:00Z',
        update: jest.fn(),
      };

      const result = await certificateService.renewCertificate(cert);

      expect(certificateService.createSelfSignedPem).toHaveBeenCalledWith(['app.example.com'], 60);
      expect(cert.update).toHaveBeenCalledWith(expect.objectContaining({ certificate_pem: pems.certificatePem, status: 'valid' }));
      expect(caddyService.syncCustomCertificates).toHaveBeenCalled();
      expect(result.message).toMatch(/60 days/);
    });
  });

  describe('uploadCertificate', () => {
    const fixtures = path.join(__dirname, '../fixtures/certs');
    let tmpDir;
    const stage = (name) => {
      const dest = path.join(tmpDir, name);
      fs.copyFileSync(path.join(fixtures, name), dest);
      return dest;
    };

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cert-upload-'));
      jest.spyOn(certificateService, 'activateCertificate').mockResolvedValue();
      Certificate.create = jest.fn(async (data) => ({ id: 7, ...data }));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      jest.restoreAllMocks();
    });

    test('stores real validity, issuer, SAN domains and the uploading user', async () => {
      const cert = await certificateService.uploadCertificate(
        'app', undefined, stage('app.cert.pem'), stage('app.key.pem'), 'user-1'
      );

      expect(Certificate.create).toHaveBeenCalledWith(expect.objectContaining({
        domains: 'app.example.com,*.apps.example.com',
        created_by: 'user-1',
        type: 'uploaded',
        status: 'valid',
      }));
      expect(cert.valid_to.getUTCFullYear()).toBe(2126);
      expect(cert.issuer).toMatch(/app\.example\.com/);
    });

    test('rejects a private key that does not match, before touching Caddy or the database', async () => {
      await expect(certificateService.uploadCertificate(
        'app', 'app.example.com', stage('app.cert.pem'), stage('other.key.pem'), 'user-1'
      )).rejects.toBeInstanceOf(CertificateError);
      expect(certificateService.activateCertificate).not.toHaveBeenCalled();
      expect(Certificate.create).not.toHaveBeenCalled();
    });
  });
});
