const axios = require('axios');
const child = require('child_process');
const fs = require('fs');
const path = require('path');

jest.mock('axios');
jest.mock('child_process');

const certificateService = require('../../src/services/certificateService');

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

  test('parseCertificateInfo returns fallback values when openssl parsing fails', () => {
    // Mock execSync to throw, so parseCertificateInfo returns defaults
    child.execSync.mockImplementation(() => { throw new Error('openssl not available'); });

    const result = certificateService.parseCertificateInfo('-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----');
    expect(result).toHaveProperty('issuer');
    expect(result).toHaveProperty('validFrom');
    expect(result).toHaveProperty('validTo');
  });
});
