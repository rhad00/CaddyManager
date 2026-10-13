/**
 * Upstream address parsing.
 *
 * Users enter upstreams either as URLs ("http://app:8080", "https://api") or as bare
 * network addresses ("app:3000"). Caddy's reverse_proxy `dial` field only accepts a
 * network address (host:port), and TLS to the upstream is configured separately on
 * the transport, so every upstream is normalised through here.
 */

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' };
const TLS_PORT = '443';

/**
 * Parse an upstream into a URL, adding http:// when no scheme is given.
 * Only checks scheme and host, so callers can run host-based (SSRF) checks first.
 * @param {string} input - upstream as entered by the user
 * @returns {URL}
 * @throws {Error} with a user-facing message when the upstream is invalid
 */
function toUpstreamUrl(input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    throw new Error('Upstream URL is required');
  }

  const trimmed = input.trim();
  let url;
  try {
    url = new URL(SCHEME_PATTERN.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    throw new Error('Invalid upstream URL format');
  }

  if (!DEFAULT_PORTS[url.protocol]) {
    throw new Error('Upstream URL must use http or https protocol');
  }
  if (!url.hostname) {
    throw new Error('Invalid upstream URL format');
  }
  return url;
}

/**
 * Hostname without IPv6 brackets, for address checks
 * @param {URL} url
 * @returns {string}
 */
const bareHostname = (url) => url.hostname.replace(/^\[|\]$/g, '');

/**
 * @param {string} input - upstream as entered by the user
 * @returns {{ dial: string, useTls: boolean, hostname: string }}
 * @throws {Error} with a user-facing message when the upstream is invalid
 */
function parseUpstream(input) {
  const url = toUpstreamUrl(input);

  if (url.username || url.password) {
    throw new Error('Upstream URL must not include credentials');
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('Upstream URL must not include a path or query');
  }

  const port = url.port || DEFAULT_PORTS[url.protocol];
  // Port 443 has always meant a TLS upstream in CaddyManager, even without https://
  const useTls = url.protocol === 'https:' || port === TLS_PORT;

  return {
    dial: `${url.hostname}:${port}`,
    useTls,
    hostname: bareHostname(url),
  };
}

/**
 * Hostname of an upstream, validated only as far as scheme and host
 * @param {string} input
 * @returns {string}
 */
const upstreamHostname = (input) => bareHostname(toUpstreamUrl(input));

module.exports = { parseUpstream, upstreamHostname };
