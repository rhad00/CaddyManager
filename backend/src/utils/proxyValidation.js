/**
 * Validation of proxy definitions, shared by the proxies API and every path that imports
 * proxies (GitOps sync, backup restore), so imported data meets the same rules.
 */
const { parseUpstream, upstreamHostname } = require('./upstream');
const { isRestrictedHost } = require('./ssrf');
const { validateMiddlewares } = require('./proxyMiddlewares');

const PROXY_ALLOWED_FIELDS = [
  'name', 'domains', 'upstream_url', 'ssl_type',
  'compression_enabled', 'cache_settings', 'http_versions', 'status',
  'security_headers_enabled', 'rate_limit', 'ip_filtering', 'basic_auth',
  'path_routing', 'load_balancing', 'health_checks'
];

const SSL_TYPES = ['acme', 'cloudflare', 'custom', 'none'];

const PROXY_NAME_REGEX =/^[a-zA-Z0-9][a-zA-Z0-9._\-\s]{1,98}[a-zA-Z0-9]$/;

/**
 * Validate a domain name (RFC 1035 compliant, allows wildcards)
 * @param {string} domain - Domain to validate
 * @returns {boolean}
 */
const isValidDomain = (domain) => {
  if (!domain || typeof domain !== 'string') return false;
  // Allow wildcard prefix (*.example.com) and standard domains
  const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z]{2,}$/;
  return domainRegex.test(domain) && domain.length <= 253;
};

/**
 * Validate an upstream URL (prevents SSRF)
 * @param {string} url - URL to validate
 * @returns {{ valid: boolean, message?: string }}
 */
const validateUpstreamUrl = (url) => {
  // Accepts "http(s)://host[:port]" or a bare "host:port"; see utils/upstream
  let hostname;
  try {
    hostname = upstreamHostname(url);
  } catch (error) {
    return { valid: false, message: error.message };
  }

  // Block loopback, link-local, private ranges, and cloud metadata endpoints (SSRF prevention)
  if (isRestrictedHost(hostname)) {
    return { valid: false, message: 'Upstream URL points to a restricted address' };
  }

  // Remaining structural rules (no path, query or credentials)
  try {
    parseUpstream(url);
  } catch (error) {
    return { valid: false, message: error.message };
  }

  return { valid: true };
};

const validateProxyName = (name) => {
  if (name === undefined) {
    return { valid: true };
  }

  if (typeof name !== 'string') {
    return { valid: false, message: 'Proxy name must be a string' };
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 100) {
    return { valid: false, message: 'Proxy name must be between 3 and 100 characters' };
  }

  if (!PROXY_NAME_REGEX.test(trimmedName)) {
    return { valid: false, message: 'Proxy name contains invalid characters' };
  }

  return { valid: true };
};

const validateProxyDomains = (domainsInput) => {
  if (!domainsInput) {
    return { valid: true };
  }

  const domains = Array.isArray(domainsInput) ? domainsInput : [domainsInput];
  for (const domain of domains) {
    if (!isValidDomain(domain)) {
      return { valid: false, message: `Invalid domain name: ${domain}` };
    }
  }

  return { valid: true };
};

const validateLoadBalancingConfig = (loadBalancing) => {
  if (!loadBalancing || !loadBalancing.enabled) {
    return { valid: true };
  }

  const validPolicies = ['round_robin', 'weighted_round_robin', 'weighted', 'least_conn', 'ip_hash', 'random', 'first'];
  if (loadBalancing.policy && !validPolicies.includes(loadBalancing.policy)) {
    return { valid: false, message: `Invalid load balancing policy. Use one of: ${validPolicies.join(', ')}` };
  }

  if (!loadBalancing.upstreams || !Array.isArray(loadBalancing.upstreams) || loadBalancing.upstreams.length < 1) {
    return { valid: false, message: 'Load balancing requires at least one upstream URL' };
  }

  for (const upstream of loadBalancing.upstreams) {
    if (!upstream.url) {
      return { valid: false, message: 'Each load balancing upstream must have a url field' };
    }

    const upstreamCheck = validateUpstreamUrl(upstream.url);
    if (!upstreamCheck.valid) {
      return { valid: false, message: `Invalid load balancing upstream URL: ${upstream.url}` };
    }

    if (upstream.weight !== undefined && upstream.weight !== null && upstream.weight !== '') {
      const weight = Number(upstream.weight);
      if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
        return { valid: false, message: 'Load balancing upstream weight must be an integer between 1 and 1000' };
      }
    }
  }

  return { valid: true };
};

const validateHealthChecksConfig = (healthChecks) => {
  if (!healthChecks || !healthChecks.enabled) {
    return { valid: true };
  }

  if (healthChecks.path !== undefined &&
      (typeof healthChecks.path !== 'string' || !/^\/[^\s]*$/.test(healthChecks.path))) {
    return { valid: false, message: 'health_checks.path must start with "/" and contain no spaces' };
  }

  if (healthChecks.interval && !/^\d+(\.\d+)?(s|m|h)$/.test(healthChecks.interval)) {
    return { valid: false, message: 'health_checks.interval must be a duration string e.g. "30s", "1m"' };
  }

  if (healthChecks.timeout && !/^\d+(\.\d+)?(s|m|h)$/.test(healthChecks.timeout)) {
    return { valid: false, message: 'health_checks.timeout must be a duration string e.g. "5s"' };
  }

  if (healthChecks.max_fails !== undefined && (typeof healthChecks.max_fails !== 'number' || healthChecks.max_fails < 1)) {
    return { valid: false, message: 'health_checks.max_fails must be a positive integer' };
  }

  return { valid: true };
};

const HEADER_SECRET_PLACEHOLDER = /\{\s*(env|file)\s*[.\\]/i;

const validateHeadersConfig = (headers) => {
  if (!headers || !Array.isArray(headers)) {
    return { valid: true };
  }

  const validHeaderNameRegex = /^[a-zA-Z0-9\-]+$/;
  for (const header of headers) {
    if (header.header_name && !validHeaderNameRegex.test(header.header_name)) {
      return { valid: false, message: `Invalid header name: ${header.header_name}` };
    }

    if (header.header_name && header.header_name.length > 256) {
      return { valid: false, message: `Header name too long: ${header.header_name}` };
    }

    if (header.header_value !== undefined && typeof header.header_value !== 'string') {
      return { valid: false, message: 'Header value must be text' };
    }

    if (header.header_value && header.header_value.length > 8192) {
      return { valid: false, message: 'Header value too long (max 8192 characters)' };
    }

    if (header.header_value && /[\r\n]/.test(header.header_value)) {
      return { valid: false, message: 'Header value cannot contain line breaks' };
    }

    // Caddy expands {placeholders} in header values; the ones below read its environment
    // (CF_API_TOKEN, ...) or files, which a header would hand to every visitor
    if (header.header_value && HEADER_SECRET_PLACEHOLDER.test(header.header_value)) {
      return { valid: false, message: 'Header values cannot use the {env.*} or {file.*} placeholders' };
    }
  }

  return { valid: true };
};

const validatePathRoutingConfig = (pathRouting) => {
  if (!pathRouting || !pathRouting.enabled) {
    return { valid: true };
  }

  if (!Array.isArray(pathRouting.routes) || pathRouting.routes.length < 1) {
    return { valid: false, message: 'Path routing requires at least one route' };
  }

  for (const route of pathRouting.routes) {
    if (!route || typeof route.path !== 'string' || !route.path.startsWith('/')) {
      return { valid: false, message: 'Each path route needs a path starting with "/"' };
    }
    const upstreamCheck = validateUpstreamUrl(route.upstream_url);
    if (!upstreamCheck.valid) {
      return { valid: false, message: `Invalid path route upstream for ${route.path}: ${upstreamCheck.message}` };
    }
  }

  return { valid: true };
};

/**
 * Validate proxy input (domains and upstream URL)
 * @param {Object} body - Request body
 * @returns {{ valid: boolean, message?: string }}
 */
const validateProxyInput = (body) => {
  const validators = [
    () => validateProxyName(body.name),
    () => (body.ssl_type === undefined || SSL_TYPES.includes(body.ssl_type)
      ? { valid: true }
      : { valid: false, message: `ssl_type must be one of: ${SSL_TYPES.join(', ')}` }),
    () => validateProxyDomains(body.domains),
    () => (body.upstream_url ? validateUpstreamUrl(body.upstream_url) : { valid: true }),
    () => validateLoadBalancingConfig(body.load_balancing),
    () => validateHealthChecksConfig(body.health_checks),
    () => validateHeadersConfig(body.headers),
    () => validatePathRoutingConfig(body.path_routing),
    () => validateMiddlewares(body.middlewares),
  ];

  for (const runValidator of validators) {
    const result = runValidator();
    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
};

module.exports = {
  PROXY_ALLOWED_FIELDS,
  SSL_TYPES,
  isValidDomain,
  validateUpstreamUrl,
  validateProxyInput,
  validateHeadersConfig,
};
