/**
 * validateBody (MODERNIZATION.md 4.1): zod schemas for request bodies, rejecting with the
 * same envelope the express-validator rules use, and handing the handler the parsed data.
 */
const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { validateBody } = require('../../src/middleware/validateRequest');

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  port: z.coerce.number().int().min(1).max(65535),
  tags: z.array(z.string()).default([]),
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.post('/things', validateBody(schema), (req, res) => res.json({ received: req.body }));
  return app;
};

describe('validateBody', () => {
  test('passes the parsed body (trimmed, coerced, defaulted) to the handler', async () => {
    const res = await request(buildApp()).post('/things').send({ name: '  web  ', port: '8080' });

    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({ name: 'web', port: 8080, tags: [] });
  });

  test('drops fields the schema does not name', async () => {
    const res = await request(buildApp()).post('/things').send({ name: 'web', port: 80, role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.received).not.toHaveProperty('role');
  });

  test('rejects with the validation envelope and one entry per problem', async () => {
    const res = await request(buildApp()).post('/things').send({ name: '', port: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: 'Validation error' });
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'field', location: 'body', path: 'name', msg: 'Name is required' }),
      expect.objectContaining({ type: 'field', location: 'body', path: 'port' }),
    ]));
  });

  test('does not echo the rejected values back', async () => {
    const res = await request(buildApp()).post('/things').send({ name: '', port: 'hunter2' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  test('a missing body is a validation error, not a crash', async () => {
    const res = await request(buildApp()).post('/things');

    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('nested paths are dotted', async () => {
    const nested = z.object({ rate_limit: z.object({ burst: z.number().int().min(1) }) });
    const app = express();
    app.use(express.json());
    app.post('/n', validateBody(nested), (_req, res) => res.json({}));

    const res = await request(app).post('/n').send({ rate_limit: { burst: 0 } });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('rate_limit.burst');
  });
});
