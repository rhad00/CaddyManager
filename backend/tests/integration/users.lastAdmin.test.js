/**
 * The last active admin cannot be removed by demotion, locking or deletion
 * (MODERNIZATION.md 0.19 review follow-up). Locked admins do not count.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const mockActor = { id: null, role: 'admin' };
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, _res, next) => { req.user = { ...mockActor }; next(); },
  roleMiddleware: () => (_req, _res, next) => next(),
  requireApiKeyPermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { sequelize, User } = require('../../src/models');

const app = express();
app.use(express.json());
app.use('/api/users', require('../../src/api/users/routes').router);

let counter = 0;
const makeUser = (role, status = 'active') => {
  counter += 1;
  return User.create({ email: `admin${counter}@example.com`, password_hash: 'x'.repeat(60), role, status });
};

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  try { await sequelize.close(); } catch { /* already closed */ }
});

beforeEach(async () => {
  await User.destroy({ where: {} });
  mockActor.id = 'someone-else';
});

describe('with one active admin and one locked admin', () => {
  let active;
  beforeEach(async () => {
    active = await makeUser('admin');
    await makeUser('admin', 'locked');
  });

  test('the active admin cannot be deleted', async () => {
    const res = await request(app).delete(`/api/users/${active.id}`);
    expect(res.status).toBe(400);
    expect(await User.findByPk(active.id)).not.toBeNull();
  });

  test('the active admin cannot be demoted', async () => {
    const res = await request(app).put(`/api/users/${active.id}`).send({ role: 'read-only' });
    expect(res.status).toBe(400);
    expect((await User.findByPk(active.id)).role).toBe('admin');
  });

  test('the active admin cannot be locked', async () => {
    const res = await request(app).put(`/api/users/${active.id}`).send({ status: 'locked' });
    expect(res.status).toBe(400);
    expect((await User.findByPk(active.id)).status).toBe('active');
  });
});

test('with two active admins, one can be locked, demoted or deleted', async () => {
  const [a, b, c] = [await makeUser('admin'), await makeUser('admin'), await makeUser('admin')];

  expect((await request(app).put(`/api/users/${a.id}`).send({ status: 'locked' })).status).toBe(200);
  expect((await request(app).put(`/api/users/${b.id}`).send({ role: 'read-only' })).status).toBe(200);
  expect((await request(app).delete(`/api/users/${c.id}`)).status).toBe(400); // c is now the last one
});

test('an admin cannot lock their own account', async () => {
  const me = await makeUser('admin');
  await makeUser('admin');
  mockActor.id = me.id;

  const res = await request(app).put(`/api/users/${me.id}`).send({ status: 'locked' });

  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/own/i);
});
