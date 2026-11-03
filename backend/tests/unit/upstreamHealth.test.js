jest.mock('axios');
const axios = require('axios');
const { buildUpstreamHealth, fetchCaddyUpstreams, stateOf } = require('../../src/services/upstreamHealth');

const proxy = (id, name, url, extra = {}) => ({ id, name, upstream_url: url, ...extra });

describe('stateOf', () => {
  test('an unreachable upstream is down whatever Caddy counted', () => {
    expect(stateOf(false, 0)).toBe('down');
    expect(stateOf(true, 0)).toBe('up');
    expect(stateOf(true, 3)).toBe('failing');
    expect(stateOf(null, null)).toBe('unknown');
  });
});

describe('buildUpstreamHealth', () => {
  test('joins the probe with the counters Caddy reports, worst first', async () => {
    const probe = jest.fn(async (dial) => dial !== 'b.internal:80');
    const report = await buildUpstreamHealth(
      [proxy('1', 'Alpha', 'http://a.internal:8080'), proxy('2', 'Beta', 'http://b.internal:80')],
      [{ address: 'a.internal:8080', num_requests: 2, fails: 0 }],
      probe,
    );
    expect(report.caddyAvailable).toBe(true);
    expect(report.rows.map((r) => [r.proxyName, r.state])).toEqual([['Beta', 'down'], ['Alpha', 'up']]);
    expect(report.rows[1]).toMatchObject({ inFlight: 2, fails: 0, reachable: true });
    expect(report.rows[0]).toMatchObject({ inFlight: null, probeMs: null });
  });

  test('a shared upstream is probed once but listed for each proxy', async () => {
    const probe = jest.fn(async () => true);
    const report = await buildUpstreamHealth([proxy('1', 'A', 'http://shared:80'), proxy('2', 'B', 'http://shared:80')], [], probe);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(report.rows).toHaveLength(2);
  });

  test('load balanced upstreams each get a row, and failures mark a reachable one as failing', async () => {
    const report = await buildUpstreamHealth(
      [proxy('1', 'LB', 'http://one:80', { load_balancing: { enabled: true, upstreams: [{ url: 'http://two:80' }] } })],
      [{ address: 'two:80', num_requests: 0, fails: 4 }],
      async () => true,
    );
    expect(report.rows.map((r) => [r.dial, r.state])).toEqual([['two:80', 'failing'], ['one:80', 'up']]);
  });

  test('without Caddy the probe still reports, and says Caddy was unavailable', async () => {
    const report = await buildUpstreamHealth([proxy('1', 'A', 'http://a:80')], null, async () => true);
    expect(report.caddyAvailable).toBe(false);
    expect(report.rows[0]).toMatchObject({ state: 'up', inFlight: null, fails: null });
  });
});

describe('fetchCaddyUpstreams', () => {
  test('keeps only well-formed entries and returns null when the admin API fails', async () => {
    axios.get.mockResolvedValueOnce({ data: [{ address: 'a:80', num_requests: 1, fails: 2 }, { nope: true }, null] });
    expect(await fetchCaddyUpstreams('http://caddy')).toEqual([{ address: 'a:80', num_requests: 1, fails: 2 }]);
    axios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await fetchCaddyUpstreams('http://caddy')).toBeNull();
    axios.get.mockResolvedValueOnce({ data: { not: 'an array' } });
    expect(await fetchCaddyUpstreams('http://caddy')).toBeNull();
  });
});
