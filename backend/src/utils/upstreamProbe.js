/**
 * TCP reachability of a proxy's upstreams, for the upstream_down alert. A TCP connect is
 * what Caddy needs before it can proxy anything; HTTP-level health is Caddy's own active
 * health check.
 */
const net = require('net');
const { parseUpstream } = require('./upstream');

const DEFAULT_TIMEOUT_MS = 5000;

const dialOf = (url) => {
  try {
    return parseUpstream(url).dial;
  } catch {
    return null; // validated on save; skip anything that no longer parses
  }
};

/**
 * Every distinct upstream address of a proxy: main, load-balanced and path-routed.
 * @param {Object} proxy
 * @returns {string[]} dial addresses ("host:port")
 */
function proxyDials(proxy) {
  const urls = [proxy.upstream_url];
  if (proxy.load_balancing?.enabled) {
    urls.push(...(proxy.load_balancing.upstreams || []).map((u) => u.url));
  }
  if (proxy.path_routing?.enabled) {
    urls.push(...(proxy.path_routing.routes || []).map((r) => r.upstream_url));
  }
  return [...new Set(urls.filter(Boolean).map(dialOf).filter(Boolean))];
}

/** Split "host:port" / "[v6]:port" for net.connect. */
const splitDial = (dial) => {
  const i = dial.lastIndexOf(':');
  return { host: dial.slice(0, i).replace(/^\[|\]$/g, ''), port: Number(dial.slice(i + 1)) };
};

/**
 * @param {string} dial
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} whether a TCP connection could be opened
 */
function canConnect(dial, timeoutMs) {
  const { host, port } = splitDial(dial);
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/**
 * @param {Object} proxy
 * @param {number} [timeoutMs]
 * @returns {Promise<string[]>} the upstream addresses that refused or timed out
 */
async function unreachableUpstreams(proxy, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const dials = proxyDials(proxy);
  const reachable = await Promise.all(dials.map((dial) => canConnect(dial, timeoutMs)));
  return dials.filter((_dial, i) => !reachable[i]);
}

module.exports = { proxyDials, unreachableUpstreams };
