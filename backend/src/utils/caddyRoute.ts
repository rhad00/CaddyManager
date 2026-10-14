/**
 * The Caddy JSON route a proxy becomes. Pure functions of the proxy row: nothing here
 * talks to Caddy or the database, so the whole mapping is unit- and contract-testable.
 */
import { parseUpstream } from './upstream';
import { toCaddyAuthHandler, type BasicAuth } from './basicAuth';
import { middlewareHandlers, type CaddyHandler, type MiddlewareRow } from './proxyMiddlewares';

export type { CaddyHandler };

export interface TlsTransport {
  protocol: 'http';
  tls: { insecure_skip_verify: boolean };
}

export type ReverseProxyHandler = {
  handler: 'reverse_proxy';
  upstreams: Array<{ dial: string }>;
  load_balancing?: { selection_policy: SelectionPolicy };
  health_checks?: {
    active: { uri: string; interval: string; timeout: string; fails: number };
  };
  headers?: {
    request?: { set: Record<string, string[]> };
    response?: { set: Record<string, string[]> };
  };
  transport?: TlsTransport;
};

export type SelectionPolicy =
  | { policy: 'weighted_round_robin'; weights: number[] }
  | { policy: string };

export interface CaddyRoute {
  match: Array<{ host: string[] }>;
  handle: CaddyHandler[];
}

interface LoadBalancingUpstream {
  url: string;
  weight?: unknown;
}

/** The columns of a Proxy (with its headers and middlewares) that the route is built from */
export interface ProxyRouteInput {
  domains: string | string[];
  upstream_url: string;
  skip_tls_verify?: boolean | null;
  compression_enabled?: boolean | null;
  rate_limit?: { enabled?: boolean; burst?: number; requests_per_second?: number } | null;
  ip_filtering?: { enabled?: boolean; mode?: string; ip_list?: string[] } | null;
  basic_auth?: BasicAuth | null;
  path_routing?: {
    enabled?: boolean;
    routes?: Array<{ path: string; upstream_url: string }>;
  } | null;
  load_balancing?: {
    enabled?: boolean;
    policy?: string;
    upstreams?: LoadBalancingUpstream[];
  } | null;
  health_checks?: {
    enabled?: boolean;
    path?: string;
    interval?: string;
    timeout?: string;
    max_fails?: number;
  } | null;
  headers?: Array<{
    enabled?: boolean;
    header_type?: string;
    header_name: string;
    header_value: string;
  }> | null;
  middlewares?: MiddlewareRow[] | null;
}

const MAX_IP_FILTER_ENTRIES = 10;

/** Check if the upstream URL should use HTTPS transport configuration */
export const shouldUseHTTPSTransport = (upstreamUrl: string): boolean => parseUpstream(upstreamUrl).useTls;

/** HTTP transport that speaks TLS to the upstream */
export const buildTlsTransport = (proxy: Pick<ProxyRouteInput, 'skip_tls_verify'>): TlsTransport => ({
  protocol: 'http',
  tls: {
    insecure_skip_verify: proxy.skip_tls_verify === true,
  },
});

/**
 * Caddy selection policy for a load-balanced pool.
 * Weights only apply to round robin: Caddy's weighted_round_robin takes a `weights`
 * array in upstream order. "weighted" is accepted as the documented alias.
 * @param loadBalancing - proxy.load_balancing
 */
export function buildSelectionPolicy(
  loadBalancing: NonNullable<ProxyRouteInput['load_balancing']>,
): SelectionPolicy {
  const requested = loadBalancing.policy || 'round_robin';
  const upstreams = loadBalancing.upstreams || [];
  const hasWeights = upstreams.some((u) => u.weight !== undefined && u.weight !== null && u.weight !== '');
  const roundRobin = ['round_robin', 'weighted', 'weighted_round_robin'].includes(requested);

  if (roundRobin && (hasWeights || requested !== 'round_robin')) {
    return {
      policy: 'weighted_round_robin',
      weights: upstreams.map((u) => {
        const weight = parseInt(String(u.weight), 10);
        return Number.isInteger(weight) && weight > 0 ? weight : 1;
      }),
    };
  }
  return { policy: requested };
}

const deniedResponse = (): CaddyHandler => ({
  handler: 'static_response',
  status_code: 403,
  body: 'Access denied',
});

/** IP filtering with Caddy's built-in remote_ip matcher; null when it is off */
function ipFilterHandler(ipFiltering: ProxyRouteInput['ip_filtering']): CaddyHandler | null {
  if (!ipFiltering || !ipFiltering.enabled || !ipFiltering.ip_list || ipFiltering.ip_list.length === 0) {
    return null;
  }
  const ranges = ipFiltering.ip_list.slice(0, MAX_IP_FILTER_ENTRIES);
  const remoteIp = { remote_ip: { ranges } };

  // Deny mode blocks the listed addresses; allow mode blocks everything else
  const match = ipFiltering.mode === 'deny' ? [remoteIp] : [{ not: [remoteIp] }];
  return {
    handler: 'subroute',
    routes: [{ match, handle: [deniedResponse()] }],
  };
}

/** Request and response header rules of the proxy, in the reverse_proxy `headers` shape */
function headerRules(headers: NonNullable<ProxyRouteInput['headers']>): ReverseProxyHandler['headers'] {
  const requestHeaders: Record<string, string[]> = {};
  const responseHeaders: Record<string, string[]> = {};

  for (const header of headers.filter((h) => h.enabled)) {
    if (header.header_type === 'request') {
      requestHeaders[header.header_name] = [header.header_value];
    } else if (header.header_type === 'response') {
      responseHeaders[header.header_name] = [header.header_value];
    }
  }

  const rules: NonNullable<ReverseProxyHandler['headers']> = {};
  if (Object.keys(requestHeaders).length > 0) rules.request = { set: requestHeaders };
  if (Object.keys(responseHeaders).length > 0) rules.response = { set: responseHeaders };
  return Object.keys(rules).length > 0 ? rules : undefined;
}

/** Path-based routing: one reverse proxy per path, and a 404 for everything else */
function pathRoutingHandler(
  proxy: ProxyRouteInput,
  routes: Array<{ path: string; upstream_url: string }>,
): CaddyHandler {
  return {
    handler: 'subroute',
    routes: [
      ...routes.map((route) => {
        const upstream = parseUpstream(route.upstream_url);
        const pathHandler: ReverseProxyHandler = {
          handler: 'reverse_proxy',
          upstreams: [{ dial: upstream.dial }],
        };
        if (upstream.useTls) {
          pathHandler.transport = buildTlsTransport(proxy);
        }
        return {
          match: [{ path: [route.path] }],
          handle: [pathHandler],
        };
      }),
      // Everything outside the configured paths: a 404, not Caddy's empty 200
      { handle: [{ handler: 'static_response', status_code: 404 }] },
    ],
  };
}

/** The default reverse proxy handler: single or load-balanced upstreams, checks, headers, TLS */
function reverseProxyHandler(proxy: ProxyRouteInput): ReverseProxyHandler {
  // Load balancing with several upstreams takes priority over the single url
  const pool = proxy.load_balancing && proxy.load_balancing.enabled && proxy.load_balancing.upstreams
    && proxy.load_balancing.upstreams.length > 0
    ? proxy.load_balancing
    : null;
  const poolUpstreams = pool?.upstreams ?? [];

  const handler: ReverseProxyHandler = {
    handler: 'reverse_proxy',
    upstreams: pool
      ? poolUpstreams.map((u) => ({ dial: parseUpstream(u.url).dial }))
      : [{ dial: parseUpstream(proxy.upstream_url).dial }],
  };

  if (pool) {
    handler.load_balancing = { selection_policy: buildSelectionPolicy(pool) };
  }

  if (proxy.health_checks && proxy.health_checks.enabled) {
    // Caddy's active checks use `uri` (`path` is deprecated) and `fails`
    // (consecutive failures before an upstream is marked down); `max_fails`
    // only exists on passive checks and makes Caddy reject the config.
    handler.health_checks = {
      active: {
        uri: proxy.health_checks.path || '/health',
        interval: proxy.health_checks.interval || '30s',
        timeout: proxy.health_checks.timeout || '5s',
        fails: proxy.health_checks.max_fails || 3,
      },
    };
  }

  if (proxy.headers && proxy.headers.length > 0) {
    const rules = headerRules(proxy.headers);
    if (rules) handler.headers = rules;
  }

  // One transport serves every upstream of the handler, so a load-balanced pool uses TLS
  // when any of its members does.
  const upstreamUrls = pool ? poolUpstreams.map((u) => u.url) : [proxy.upstream_url];
  if (upstreamUrls.some((u) => shouldUseHTTPSTransport(u))) {
    handler.transport = buildTlsTransport(proxy);
  }

  return handler;
}

/**
 * Create a route configuration from a proxy
 * @param proxy - The proxy object from the database
 * @returns The route configuration
 */
export function createRouteFromProxy(proxy: ProxyRouteInput): CaddyRoute {
  const handlers: CaddyHandler[] = [];

  // Add rate limiting if enabled
  const hasRateLimit = Boolean(proxy.rate_limit && proxy.rate_limit.enabled);
  if (hasRateLimit && proxy.rate_limit) {
    handlers.push({
      handler: 'rate_limit',
      rate_limits: {
        default: {
          key: '{http.request.remote.host}',
          window: '1s',
          max_events: proxy.rate_limit.burst || proxy.rate_limit.requests_per_second,
        },
      },
    });
  }

  // Rate limit middlewares go with the rate limit, before any authentication; the other
  // middlewares (redirects) come after the access controls
  const middlewares = middlewareHandlers(proxy.middlewares, { hasRateLimit });
  handlers.push(...middlewares.filter((handler) => handler.handler === 'rate_limit'));

  const ipFilter = ipFilterHandler(proxy.ip_filtering);
  if (ipFilter) handlers.push(ipFilter);

  const authHandler = toCaddyAuthHandler(proxy.basic_auth);
  if (authHandler) handlers.push(authHandler);

  handlers.push(...middlewares.filter((handler) => handler.handler !== 'rate_limit'));

  if (proxy.compression_enabled) {
    handlers.push({
      handler: 'encode',
      encodings: {
        gzip: {},
        zstd: {},
      },
    });
  }

  const pathRoutes = proxy.path_routing && proxy.path_routing.enabled ? proxy.path_routing.routes : undefined;
  if (pathRoutes && pathRoutes.length > 0) {
    handlers.push(pathRoutingHandler(proxy, pathRoutes));
  } else {
    handlers.push(reverseProxyHandler(proxy));
  }

  const route: CaddyRoute = {
    match: [{
      host: Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains],
    }],
    handle: handlers,
  };

  // Make sure the route has a terminal handler (reverse_proxy)
  if (!route.handle.some((h) => h.handler === 'reverse_proxy' || h.handler === 'subroute')) {
    console.error('Route is missing terminal handler:', route);
    throw new Error('Invalid route configuration: missing terminal handler');
  }

  return route;
}
