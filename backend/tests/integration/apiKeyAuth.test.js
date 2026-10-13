/**
 * API key authorization (MODERNIZATION.md 0.19).
 * - A key acts with its owner's current role and dies with its owner (deleted or locked).
 * - Scopes follow the documented meaning: read = GET, write = GET + POST/PUT/PATCH,
 *   admin = everything, including DELETE and user/key management.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { sequelize, User, ApiKey } = require('../../src/models');
const { authMiddleware, roleMiddleware } = require('../../src/middleware/auth');

const ok = (req, res) => res.json({ role: req.user.role, id: req.user.id });
const app = express();
app.use(express.json());
app.get('/thing', authMiddleware, ok);
app.post('/thing', authMiddleware, roleMiddleware('admin'), ok);
app.put('/thing', authMiddleware, roleMiddleware('admin'), ok);
app.delete('/thing', authMiddleware, roleMiddleware('admin'), ok);
app.use('/api/users', require('../../src/api/users/routes'));
app.use('/api/keys', require('../../src/api/keys/routes'));

let counter = 0;
async function makeUser(role, status = 'active') {
  counter += 1;
  return User.create({ email: `u${counter}@example.com`, password_hash: 'x'.repeat(60), role, status });
}
async function makeKey(owner, permissions) {
  const raw = `cm_${crypto.randomBytes(16).toString('hex')}`;
  await ApiKey.create({
    name: 'k',
    key_hash: crypto.createHash('sha256').update(raw).digest('hex'),
    key_prefix: raw.slice(0, 8),
    permissions,
    created_by: owner.id,
  });
  return raw;
}

let admin;
beforeAll(async () => {
  await sequelize.sync({ force: true });
  admin = await makeUser('admin');
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
});

describe('scopes', () => {
  test.each([
    ['read', 'get', 200], ['read', 'post', 403], ['read', 'put', 403], ['read', 'delete', 403],
    ['write', 'get', 200], ['write', 'post', 200], ['write', 'put', 200], ['write', 'delete', 403],
    ['admin', 'get', 200], ['admin', 'post', 200], ['admin', 'put', 200], ['admin', 'delete', 200],
  ])('a %s key owned by an admin: %s -> %i', async (scope, method, status) => {
    const key = await makeKey(admin, [scope]);
    const res = await request(app)[method]('/thing').set('X-API-Key', key);
    expect(res.status).toBe(status);
  });

  test.each(['/api/users', '/api/keys'])('user and key management at %s needs the admin scope', async (path) => {
    const writeKey = await makeKey(admin, ['write']);
    const adminKey = await makeKey(admin, ['admin']);

    expect((await request(app).get(path).set('X-API-Key', writeKey)).status).toBe(403);
    expect((await request(app).get(path).set('X-API-Key', adminKey)).status).toBe(200);
  });
});

describe('owner', () => {
  test('the key acts as its owner, with the owner\'s role', async () => {
    const key = await makeKey(admin, ['read']);
    const res = await request(app).get('/thing').set('X-API-Key', key);
    expect(res.body).toEqual({ role: 'admin', id: admin.id });
  });

  test('an admin-scoped key of a read-only owner cannot write', async () => {
    const owner = await makeUser('read-only');
    const key = await makeKey(owner, ['admin']);
    expect((await request(app).post('/thing').set('X-API-Key', key)).status).toBe(403);
  });

  test('a demoted owner\'s key loses admin rights immediately', async () => {
    const owner = await makeUser('admin');
    const key = await makeKey(owner, ['admin']);
    expect((await request(app).post('/thing').set('X-API-Key', key)).status).toBe(200);

    await owner.update({ role: 'read-only' });

    expect((await request(app).post('/thing').set('X-API-Key', key)).status).toBe(403);
  });

  test('the key of a locked owner is rejected', async () => {
    const owner = await makeUser('admin');
    const key = await makeKey(owner, ['admin']);
    await owner.update({ status: 'locked' });

    expect((await request(app).get('/thing').set('X-API-Key', key)).status).toBe(401);
  });

  test('deleting a user who owns keys works and revokes the keys', async () => {
    const owner = await makeUser('admin');
    const ownedKey = await makeKey(owner, ['admin']);
    const adminKey = await makeKey(admin, ['admin']);

    const res = await request(app).delete(`/api/users/${owner.id}`).set('X-API-Key', adminKey);

    expect(res.status).toBe(200);
    expect(await ApiKey.count({ where: { created_by: owner.id } })).toBe(0);
    expect((await request(app).get('/thing').set('X-API-Key', ownedKey)).status).toBe(401);
  });
});
