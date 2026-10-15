/**
 * TCP reachability of a proxy's upstreams, for the upstream_down alert (MODERNIZATION.md 0.20).
 */
const net = require('net');
const { proxyDials, unreachableUpstreams } = require('../../src/utils/upstreamProbe');

describe('proxyDials', () => {
  test('collects the main, load-balanced and path-routed upstreams once each', () => {
    const dials = proxyDials({
      upstream_url: 'http://app:8080',
      load_balancing: { enabled: true, upstreams: [{ url: 'http://app:8080' }, { url: 'https://app2' }] },
      path_routing: { enabled: true, routes: [{ path: '/api/*', upstream_url: 'api:3000' }] },
    });

    expect(dials).toEqual(['app:8080', 'app2:443', 'api:3000']);
  });

  test('ignores disabled load balancing and path routing, and unparseable entries', () => {
    const dials = proxyDials({
      upstream_url: 'app:80',
      load_balancing: { enabled: false, upstreams: [{ url: 'other:80' }] },
      path_routing: { enabled: true, routes: [{ path: '/x', upstream_url: 'http://bad/path' }] },
    });

    expect(dials).toEqual(['app:80']);
  });
});

describe('unreachableUpstreams', () => {
  let server;
  let openPort;
  let closedPort;

  beforeAll(async () => {
    server = net.createServer((socket) => socket.end());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    openPort = server.address().port;
    // A port that was free a moment ago: bind, read, close
    const probe = net.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    closedPort = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  test('returns only the upstreams that refuse connections', async () => {
    const down = await unreachableUpstreams(
      { upstream_url: `127.0.0.1:${openPort}`, path_routing: { enabled: true, routes: [{ path: '/x', upstream_url: `127.0.0.1:${closedPort}` }] } },
      2000
    );

    expect(down).toEqual([`127.0.0.1:${closedPort}`]);
  });
});
