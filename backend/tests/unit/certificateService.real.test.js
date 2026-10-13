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
const { Certificate } = require('../../src/models');
const { CertificateError } = require('../../src/utils/certificates');

describe('CertificateService real tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('getCertificatesFromCaddy returns data from axios', async () => {
    axios.get.mockResolvedValue({ data: [{ id: 'cert1' }] });
    const res = await certificateService.getCertificatesFromCaddy();
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].id).toBe('cert1');
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
      jest.spyOn(certificateService, 'loadCertificateIntoCaddy').mockResolvedValue({ success: true });
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
      expect(certificateService.loadCertificateIntoCaddy).not.toHaveBeenCalled();
      expect(Certificate.create).not.toHaveBeenCalled();
    });
  });
});
