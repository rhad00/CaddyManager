/**
 * Without trusted proxies X-Forwarded-For is ignored: a client cannot dodge a rate limit by
 * changing it. (A second file because each stack owns the process-wide database connection.)
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const { startStack, describeIfCaddy, e2eRunner } = require('./helpers/stack');
const { listModules } = require('./helpers/caddyRunner');
const { createOrigin } = require('./helpers/echoOrigin');

const HOST = 'app.example.test';
const hasRateLimit = describeIfCaddy === describe && listModules(e2eRunner).has('http.handlers.rate_limit');
const describeIfRateLimit = hasRateLimit ? describe : describe.skip;

describeIfRateLimit('rate limiting without trusted proxies', () => {
  let origin;
  let upstream;
  let stack;

  beforeAll(async () => {
    origin = createOrigin({ name: 'app' });
    upstream = `127.0.0.1:${await origin.start()}`;
    stack = await startStack();
    await stack.createProxy({ domains: HOST, upstream, rate_limit: { enabled: true, requests_per_second: 2 } });
  });
  afterAll(async () => { await origin.stop(); await stack.stop(); });

  test('a client cannot dodge the limit by changing X-Forwarded-For', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await stack.send({ host: HOST, headers: { 'X-Forwarded-For': `198.51.100.${i}` } })).status);
    }
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
  });
});
