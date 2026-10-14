/**
 * Upstream address parsing.
 *
 * Users enter upstreams either as URLs ("http://app:8080", "https://api") or as bare
 * network addresses ("app:3000"). Caddy's reverse_proxy `dial` field only accepts a
 * network address (host:port), and TLS to the upstream is configured separately on
 * the transport, so every upstream is normalised through here.
 */

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };
const TLS_PORT = '443';

export interface ParsedUpstream {
  /** host:port for Caddy's reverse_proxy `dial` */
  dial: string;
  useTls: boolean;
  /** hostname without IPv6 brackets */
  hostname: string;
}

/**
 * Parse an upstream into a URL, adding http:// when no scheme is given.
 * Only checks scheme and host, so callers can run host-based (SSRF) checks first.
 * @param input - upstream as entered by the user
 * @throws Error with a user-facing message when the upstream is invalid
 */
function toUpstreamUrl(input: unknown): URL {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Upstream URL is required');
  }

  const trimmed = input.trim();
  let url: URL;
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

/** Hostname without IPv6 brackets, for address checks */
const bareHostname = (url: URL): string => url.hostname.replace(/^\[|\]$/g, '');

/**
 * @param input - upstream as entered by the user
 * @throws Error with a user-facing message when the upstream is invalid
 */
export function parseUpstream(input: unknown): ParsedUpstream {
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

/** Hostname of an upstream, validated only as far as scheme and host */
export const upstreamHostname = (input: unknown): string => bareHostname(toUpstreamUrl(input));
