/**
 * Validation of proxy definitions, shared by the proxies API and every path that imports
 * proxies (GitOps sync, backup restore), so imported data meets the same rules.
 */
import { parseUpstream, upstreamHostname } from './upstream';
import { isRestrictedHost } from './ssrf';
import { validateMiddlewares, type ValidationResult } from './proxyMiddlewares';
import { errorMessage } from './errorMessage';

export type { ValidationResult };

export const PROXY_ALLOWED_FIELDS = [
  'name', 'domains', 'upstream_url', 'ssl_type',
  'compression_enabled', 'cache_settings', 'http_versions', 'status',
  'security_headers_enabled', 'rate_limit', 'ip_filtering', 'basic_auth',
  'path_routing', 'load_balancing', 'health_checks',
];

export const SSL_TYPES = ['acme', 'cloudflare', 'custom', 'none'];

const PROXY_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-\s]{1,98}[a-zA-Z0-9]$/;

const VALID: ValidationResult = { valid: true };
const invalid = (message: string): ValidationResult => ({ valid: false, message });

/** Proxy request body: user-supplied JSON, every field is checked before use */
type Body = Record<string, unknown>;

interface LoadBalancingInput {
  enabled?: boolean;
  policy?: string;
  upstreams?: unknown;
}

interface HealthChecksInput {
  enabled?: boolean;
  path?: unknown;
  interval?: unknown;
  timeout?: unknown;
  max_fails?: unknown;
}

interface HeaderInput {
  header_name?: unknown;
  header_value?: unknown;
}

interface PathRoutingInput {
  enabled?: boolean;
  routes?: unknown;
}

/**
 * Validate a domain name (RFC 1035 compliant, allows wildcards)
 * @param domain - Domain to validate
 */
export const isValidDomain = (domain: unknown): boolean => {
  if (!domain || typeof domain !== 'string') return false;
  // Allow wildcard prefix (*.example.com) and standard domains
  const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z]{2,}$/;
  return domainRegex.test(domain) && domain.length <= 253;
};

/**
 * Validate an upstream URL (prevents SSRF)
 * @param url - URL to validate
 */
export const validateUpstreamUrl = (url: unknown): ValidationResult => {
  // Accepts "http(s)://host[:port]" or a bare "host:port"; see utils/upstream
  let hostname: string;
  try {
    hostname = upstreamHostname(url);
  } catch (error) {
    return invalid(errorMessage(error));
  }

  // Block loopback, link-local, private ranges, and cloud metadata endpoints (SSRF prevention)
  if (isRestrictedHost(hostname)) {
    return invalid('Upstream URL points to a restricted address');
  }

  // Remaining structural rules (no path, query or credentials)
  try {
    parseUpstream(url);
  } catch (error) {
    return invalid(errorMessage(error));
  }

  return VALID;
};

const validateProxyName = (name: unknown): ValidationResult => {
  if (name === undefined) return VALID;

  if (typeof name !== 'string') return invalid('Proxy name must be a string');

  const trimmedName = name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 100) {
    return invalid('Proxy name must be between 3 and 100 characters');
  }

  if (!PROXY_NAME_REGEX.test(trimmedName)) return invalid('Proxy name contains invalid characters');

  return VALID;
};

const validateProxyDomains = (domainsInput: unknown): ValidationResult => {
  if (!domainsInput) return VALID;

  const domains: unknown[] = Array.isArray(domainsInput) ? domainsInput : [domainsInput];
  for (const domain of domains) {
    if (!isValidDomain(domain)) return invalid(`Invalid domain name: ${domain}`);
  }

  return VALID;
};

const LOAD_BALANCING_POLICIES = ['round_robin', 'weighted_round_robin', 'weighted', 'least_conn', 'ip_hash', 'random', 'first'];

const validateLoadBalancingConfig = (loadBalancing: LoadBalancingInput | null | undefined): ValidationResult => {
  if (!loadBalancing || !loadBalancing.enabled) return VALID;

  if (loadBalancing.policy && !LOAD_BALANCING_POLICIES.includes(loadBalancing.policy)) {
    return invalid(`Invalid load balancing policy. Use one of: ${LOAD_BALANCING_POLICIES.join(', ')}`);
  }

  const { upstreams } = loadBalancing;
  if (!Array.isArray(upstreams) || upstreams.length < 1) {
    return invalid('Load balancing requires at least one upstream URL');
  }

  for (const upstream of upstreams as Array<{ url?: unknown; weight?: unknown }>) {
    if (!upstream.url) return invalid('Each load balancing upstream must have a url field');

    if (!validateUpstreamUrl(upstream.url).valid) {
      return invalid(`Invalid load balancing upstream URL: ${upstream.url}`);
    }

    if (upstream.weight !== undefined && upstream.weight !== null && upstream.weight !== '') {
      const weight = Number(upstream.weight);
      if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
        return invalid('Load balancing upstream weight must be an integer between 1 and 1000');
      }
    }
  }

  return VALID;
};

const DURATION = /^\d+(\.\d+)?(s|m|h)$/;

const validateHealthChecksConfig = (healthChecks: HealthChecksInput | null | undefined): ValidationResult => {
  if (!healthChecks || !healthChecks.enabled) return VALID;

  if (healthChecks.path !== undefined &&
      (typeof healthChecks.path !== 'string' || !/^\/[^\s]*$/.test(healthChecks.path))) {
    return invalid('health_checks.path must start with "/" and contain no spaces');
  }

  if (healthChecks.interval && !DURATION.test(String(healthChecks.interval))) {
    return invalid('health_checks.interval must be a duration string e.g. "30s", "1m"');
  }

  if (healthChecks.timeout && !DURATION.test(String(healthChecks.timeout))) {
    return invalid('health_checks.timeout must be a duration string e.g. "5s"');
  }

  if (healthChecks.max_fails !== undefined && (typeof healthChecks.max_fails !== 'number' || healthChecks.max_fails < 1)) {
    return invalid('health_checks.max_fails must be a positive integer');
  }

  return VALID;
};

const HEADER_SECRET_PLACEHOLDER = /\{\s*(env|file)\s*[.\\]/i;
const HEADER_NAME = /^[a-zA-Z0-9\-]+$/;

export const validateHeadersConfig = (headers: unknown): ValidationResult => {
  if (!headers || !Array.isArray(headers)) return VALID;

  for (const header of headers as HeaderInput[]) {
    const name = header.header_name;
    if (name && !HEADER_NAME.test(String(name))) return invalid(`Invalid header name: ${name}`);

    if (name && String(name).length > 256) return invalid(`Header name too long: ${name}`);

    const rawValue = header.header_value;
    if (rawValue !== undefined && typeof rawValue !== 'string') return invalid('Header value must be text');
    const value = rawValue as string | undefined;

    if (value && value.length > 8192) return invalid('Header value too long (max 8192 characters)');

    if (value && /[\r\n]/.test(value)) return invalid('Header value cannot contain line breaks');

    // Caddy expands {placeholders} in header values; the ones below read its environment
    // (CF_API_TOKEN, ...) or files, which a header would hand to every visitor
    if (value && HEADER_SECRET_PLACEHOLDER.test(value)) {
      return invalid('Header values cannot use the {env.*} or {file.*} placeholders');
    }
  }

  return VALID;
};

const validatePathRoutingConfig = (pathRouting: PathRoutingInput | null | undefined): ValidationResult => {
  if (!pathRouting || !pathRouting.enabled) return VALID;

  const { routes } = pathRouting;
  if (!Array.isArray(routes) || routes.length < 1) return invalid('Path routing requires at least one route');

  for (const route of routes as Array<{ path?: unknown; upstream_url?: unknown } | null>) {
    if (!route || typeof route.path !== 'string' || !route.path.startsWith('/')) {
      return invalid('Each path route needs a path starting with "/"');
    }
    const upstreamCheck = validateUpstreamUrl(route.upstream_url);
    if (!upstreamCheck.valid) {
      return invalid(`Invalid path route upstream for ${route.path}: ${upstreamCheck.message}`);
    }
  }

  return VALID;
};

/**
 * Validate proxy input (domains and upstream URL)
 * @param body - Request body
 */
export const validateProxyInput = (body: Body): ValidationResult => {
  const validators: Array<() => ValidationResult> = [
    () => validateProxyName(body.name),
    () => (body.ssl_type === undefined || SSL_TYPES.includes(body.ssl_type as string)
      ? VALID
      : invalid(`ssl_type must be one of: ${SSL_TYPES.join(', ')}`)),
    () => validateProxyDomains(body.domains),
    () => (body.upstream_url ? validateUpstreamUrl(body.upstream_url) : VALID),
    () => validateLoadBalancingConfig(body.load_balancing as LoadBalancingInput | undefined),
    () => validateHealthChecksConfig(body.health_checks as HealthChecksInput | undefined),
    () => validateHeadersConfig(body.headers),
    () => validatePathRoutingConfig(body.path_routing as PathRoutingInput | undefined),
    () => validateMiddlewares(body.middlewares),
  ];

  for (const runValidator of validators) {
    const result = runValidator();
    if (!result.valid) return result;
  }

  return VALID;
};
