/**
 * Custom certificates: merged into every config pushed to Caddy, stripped from
 * everything persisted or exported.
 */
const axios = require('axios');

jest.mock('axios');
jest.mock('../../src/models', () => ({
  Proxy: { findAll: jest.fn() },
  Header: {},
  Middleware: {},
  Certificate: { findAll: jest.fn() },
  sequelize: {},
}));
jest.mock('fs', () => ({ promises: { writeFile: jest.fn(), mkdir: jest.fn() } }));

const fs = require('fs').promises;
const { Certificate } = require('../../src/models');
const caddyService = require('../../src/services/caddyService');

const storedCert = { id: 3, type: 'uploaded', certificate_pem: 'CERT-PEM', private_key_pem: 'SECRET-KEY' };
const liveConfig = {
  apps: {
    http: { servers: { srv0: { listen: [':80'], routes: [] } } },
    tls: {
      certificates: {
        load_pem: [{ certificate: 'CERT-PEM', key: 'SECRET-KEY', tags: ['caddymanager', 'caddymanager-cert-3'] }],
      },
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  Certificate.findAll.mockResolvedValue([storedCert]);
});

test('loadConfig merges stored custom certificates into the pushed config', async () => {
  axios.post.mockResolvedValue({});
  await caddyService.loadConfig({ apps: { http: {} } });

  const [url, payload] = axios.post.mock.calls[0];
  expect(url).toMatch(/\/load$/);
  expect(payload.apps.tls.certificates.load_pem).toEqual([
    { certificate: 'CERT-PEM', key: 'SECRET-KEY', tags: ['caddymanager', 'caddymanager-cert-3'] },
  ]);
});

test('loadConfig only asks for uploaded/self-signed, non-revoked certificates', async () => {
  axios.post.mockResolvedValue({});
  await caddyService.loadConfig({});
  expect(Certificate.findAll.mock.calls[0][0].where.type).toEqual(['uploaded', 'self-signed']);
});

test('backupConfig never writes private keys to disk', async () => {
  await caddyService.backupConfig(liveConfig);
  const written = fs.writeFile.mock.calls[0][1];
  expect(written).not.toContain('SECRET-KEY');
  expect(JSON.parse(written).apps.http).toEqual(liveConfig.apps.http);
});

test('includeInBackup and getCaddyConfig (Git export) strip private keys', async () => {
  axios.get.mockResolvedValue({ data: liveConfig });

  const backup = await caddyService.includeInBackup({});
  expect(JSON.stringify(backup)).not.toContain('SECRET-KEY');

  const exported = await caddyService.getCaddyConfig();
  expect(JSON.stringify(exported)).not.toContain('SECRET-KEY');
});

test('syncCustomCertificates re-pushes the running config with current certificates', async () => {
  axios.get.mockResolvedValue({ data: { apps: { http: {} } } });
  axios.post.mockResolvedValue({});
  Certificate.findAll.mockResolvedValue([]);

  await caddyService.syncCustomCertificates();

  const payload = axios.post.mock.calls[0][1];
  expect(payload).toEqual({ apps: { http: {} } });
});
