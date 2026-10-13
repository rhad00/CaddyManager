/**
 * Notification channels are validated on save and secrets are redacted when listed
 * (MODERNIZATION.md 0.21).
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const mockActor = { id: null, role: 'admin' };
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { ...mockActor }; next(); },
  roleMiddleware: (role) => (req, res, next) => (req.user.role === role ? next() : res.status(403).end()),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { sequelize } = require('../../src/models');
const NotificationChannel = require('../../src/models/notificationChannel');

const app = express();
app.use(express.json());
app.use('/api/alerts', require('../../src/api/alerts/routes'));

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
});

beforeEach(async () => {
  mockActor.role = 'admin';
  await NotificationChannel.destroy({ where: {} });
});

test.each([
  ['webhook to cloud metadata', { type: 'webhook', config: { url: 'http://169.254.169.254/latest' } }, /restricted|internal/i],
  ['webhook to the Caddy admin API', { type: 'webhook', config: { url: 'http://localhost:2019/load' } }, /restricted|internal/i],
  ['webhook with an unsafe method', { type: 'webhook', config: { url: 'https://hooks.example.com', method: 'DELETE' } }, /method/i],
  ['webhook overriding Host', { type: 'webhook', config: { url: 'https://hooks.example.com', headers: { Host: 'internal' } } }, /header/i],
  ['slack over plain HTTP', { type: 'slack', config: { webhook_url: 'http://hooks.slack.com/x' } }, /https/i],
  ['discord without a URL', { type: 'discord', config: {} }, /webhook_url/i],
  ['email without a recipient', { type: 'email', config: {} }, /to/i],
])('create rejects %s', async (_label, body, message) => {
  const res = await request(app).post('/api/alerts/channels').send({ name: 'c', ...body });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(message);
});

test('update validates the merged channel', async () => {
  const channel = await NotificationChannel.create({ name: 'hook', type: 'webhook', config: { url: 'https://hooks.example.com' } });

  const res = await request(app).put(`/api/alerts/channels/${channel.id}`).send({ config: { url: 'http://10.0.0.1/' } });

  expect(res.status).toBe(400);
  expect((await NotificationChannel.findByPk(channel.id)).config.url).toBe('https://hooks.example.com');
});

test('editing from the redacted list keeps the stored secrets', async () => {
  const channel = await NotificationChannel.create({
    name: 'hook', type: 'webhook', config: { url: 'https://hooks.example.com/token', headers: { Authorization: 'Bearer s3cret' } },
  });

  const res = await request(app).put(`/api/alerts/channels/${channel.id}`).send({
    name: 'renamed', config: { url: '***', headers: { Authorization: '***' }, method: 'PUT' },
  });

  expect(res.status).toBe(200);
  const stored = await NotificationChannel.findByPk(channel.id);
  expect(stored.config).toEqual({ url: 'https://hooks.example.com/token', headers: { Authorization: 'Bearer s3cret' }, method: 'PUT' });
});

test('a channel stored before validation existed is refused when sending', async () => {
  const { sendToChannel } = require('../../src/services/alertService');
  const legacy = await NotificationChannel.create({ name: 'old', type: 'webhook', config: { url: 'http://169.254.169.254/latest' } });

  await expect(sendToChannel(legacy, 's', 'b')).rejects.toThrow(/not usable/);
});

test('a valid webhook is stored', async () => {
  const res = await request(app).post('/api/alerts/channels').send({
    name: 'hook', type: 'webhook', config: { url: 'https://hooks.example.com/x', method: 'PUT', headers: { Authorization: 'Bearer s3cret' } },
  });

  expect(res.status).toBe(201);
});

test('listing redacts URLs and header values', async () => {
  await NotificationChannel.create({ name: 'hook', type: 'webhook', config: { url: 'https://hooks.example.com/token', headers: { Authorization: 'Bearer s3cret' } } });
  await NotificationChannel.create({ name: 'slack', type: 'slack', config: { webhook_url: 'https://hooks.slack.com/T/B/secret' } });
  mockActor.role = 'read-only';

  const res = await request(app).get('/api/alerts/channels');

  const body = JSON.stringify(res.body);
  expect(res.status).toBe(200);
  expect(body).not.toMatch(/s3cret|\/token|\/secret/);
  expect(body).toMatch(/Authorization/); // header names stay visible
});
