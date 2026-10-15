/**
 * Rate limiting keys on the real client: behind a trusted front proxy (Cloudflare, another
 * Caddy) the address comes from X-Forwarded-For, not from the front proxy's own address.
 */
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = ':memory:';

const { startStack, describeIfCaddy, e2eRunner } = require('./helpers/stack');
const { listModules } = require('./helpers/caddyRunner');
const { createOrigin } = require('./helpers/echoOrigin');

const HOST = 'app.example.test';
const hasRateLimit = describeIfCaddy === describe && listModules(e2eRunner).has('http.handlers.rate_limit');
const describeIfRateLimit = hasRateLimit ? describe : describe.skip;

describeIfRateLimit('rate limiting', () => {
  let origin;
  let upstream;

  beforeAll(async () => {
    origin = createOrigin({ name: 'app' });
    upstream = `127.0.0.1:${await origin.start()}`;
  });
  afterAll(async () => { await origin.stop(); });

  const burst = async (stack, forwardedFor, count) => {
    const statuses = [];
    for (let i = 0; i < count; i += 1) {
      statuses.push((await stack.send({ host: HOST, headers: { 'X-Forwarded-For': forwardedFor } })).status);
    }
    return statuses;
  };

  describe('behind a trusted front proxy', () => {
    let stack;
    beforeAll(async () => {
      stack = await startStack({ trustedProxies: true });
      await stack.createProxy({ domains: HOST, upstream, rate_limit: { enabled: true, requests_per_second: 2 } });
    });
    afterAll(async () => { await stack.stop(); });

    test('each real client has its own allowance', async () => {
      const first = await burst(stack, '203.0.113.10', 5);
      expect(first.filter((s) => s === 429).length).toBeGreaterThan(0);

      const other = await burst(stack, '203.0.113.20', 1);
      expect(other).toEqual([200]);
    });

    test('an address the visitor wrote into X-Forwarded-For does not buy a fresh allowance', async () => {
      // the front proxy appends the real peer (203.0.113.30) to whatever the visitor sent
      const statuses = [];
      for (let i = 0; i < 6; i += 1) {
        statuses.push(...await burst(stack, `198.51.100.${i}, 203.0.113.30`, 1));
      }
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    });
  });
});
