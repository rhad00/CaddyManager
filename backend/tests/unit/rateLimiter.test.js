const express = require('express');
const request = require('supertest');
const {
  loginLimiter,
  passwordResetLimiter,
  apiLimiter,
  twoFaLimiter,
  certificateUploadLimiter,
} = require('../../src/middleware/rateLimiter');

const LIMITS = {
  login: 5,
  passwordReset: 3,
  twoFa: 10,
  certificateUpload: 10,
  api: 100,
};

const RATE_LIMIT_TEST_KEYS = ['::1', '::ffff:127.0.0.1', '127.0.0.1'];

const createLimitedApp = (limiter) => {
  const app = express();
  app.use(express.json());
  app.post('/limited', limiter, (req, res) => {
    res.status(200).json({ success: true });
  });
  return app;
};

describe('Rate limiter middleware', () => {
  afterEach(() => {
    [loginLimiter, passwordResetLimiter, apiLimiter, twoFaLimiter, certificateUploadLimiter].forEach((limiter) => {
      RATE_LIMIT_TEST_KEYS.forEach((key) => {
        if (typeof limiter.resetKey === 'function') {
          limiter.resetKey(key);
        }
      });
    });
  });

  test('loginLimiter blocks requests after configured limit', async () => {
    const app = createLimitedApp(loginLimiter);

    for (let i = 0; i < LIMITS.login; i += 1) {
      const res = await request(app).post('/limited').send({ attempt: i });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/limited').send({ attempt: LIMITS.login + 1 });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Too many login attempts/i);
  });

  test('passwordResetLimiter blocks requests after configured limit', async () => {
    const app = createLimitedApp(passwordResetLimiter);

    for (let i = 0; i < LIMITS.passwordReset; i += 1) {
      const res = await request(app).post('/limited').send({ attempt: i });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/limited').send({ attempt: LIMITS.passwordReset + 1 });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Too many password reset requests/i);
  });

  test('twoFaLimiter blocks requests after configured limit', async () => {
    const app = createLimitedApp(twoFaLimiter);

    for (let i = 0; i < LIMITS.twoFa; i += 1) {
      const res = await request(app).post('/limited').send({ attempt: i });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/limited').send({ attempt: LIMITS.twoFa + 1 });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Too many 2FA attempts/i);
  });

  test('certificateUploadLimiter blocks requests after configured limit', async () => {
    const app = createLimitedApp(certificateUploadLimiter);

    for (let i = 0; i < LIMITS.certificateUpload; i += 1) {
      const res = await request(app).post('/limited').send({ attempt: i });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/limited').send({ attempt: LIMITS.certificateUpload + 1 });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Too many certificate upload attempts/i);
  });

  test('apiLimiter blocks requests after configured limit', async () => {
    const app = createLimitedApp(apiLimiter);

    for (let i = 0; i < LIMITS.api; i += 1) {
      const res = await request(app).post('/limited').send({ attempt: i });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/limited').send({ attempt: LIMITS.api + 1 });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Too many requests/i);
  });
});
