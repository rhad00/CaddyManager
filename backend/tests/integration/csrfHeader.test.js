/**
 * The CSRF token is read from `x-csrf-token`, or from `csrf-token`. The option that was
 * meant to allow the second name had an outdated name (csrf-csrf 4 calls it
 * getCsrfTokenFromRequest), so it was ignored (MODERNIZATION.md 1.1).
 */
const request = require('supertest');
const { app } = require('../../src/app');

// A login that fails with 401 got past the CSRF check; 403 means the token was refused
const login = (agent, headers) => agent
  .post('/api/auth/login')
  .set(headers)
  .send({ email: 'nobody@example.test', password: 'Wrong-password-1' });

describe('CSRF token header', () => {
  let agent;
  let csrfToken;

  beforeEach(async () => {
    agent = request.agent(app);
    csrfToken = (await agent.get('/api/csrf-token')).body.csrfToken;
  });

  test('x-csrf-token is accepted', async () => {
    const res = await login(agent, { 'x-csrf-token': csrfToken });
    expect(res.statusCode).toBe(401);
  });

  test('csrf-token is accepted as well', async () => {
    const res = await login(agent, { 'csrf-token': csrfToken });
    expect(res.statusCode).toBe(401);
  });

  test('a request without the token is refused', async () => {
    const res = await login(agent, {});
    expect(res.statusCode).toBe(403);
  });

  test('a wrong token is refused, whichever header carries it', async () => {
    expect((await login(agent, { 'x-csrf-token': 'wrong' })).statusCode).toBe(403);
    expect((await login(agent, { 'csrf-token': 'wrong' })).statusCode).toBe(403);
  });
});
