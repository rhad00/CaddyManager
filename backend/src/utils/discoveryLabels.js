/**
 * Docker discovery labels: where Docker keeps them, how they are checked and which proxy
 * fields they become (MODERNIZATION.md 0.24).
 */
const net = require('net');

const MAX_RATE_LIMIT = 100000;
const MAX_IP_FILTER_ENTRIES = 10; // the Caddy builder applies at most 10 entries
const PATH_PREFIX_PATTERN = /^\/[A-Za-z0-9._~\-/]{0,200}$/;

/**
 * Labels of a container. `docker inspect` keeps them in Config.Labels; the container
 * list (and older fixtures) have them at the top level.
 */
const labelsOf = (container) => container?.Config?.Labels || container?.Labels || {};

/** Container name without the leading slash: Name from inspect, Names[0] from the list. */
const containerNameOf = (container) => {
  const name = container?.Name || container?.Names?.[0];
  return name ? name.replace(/^\//, '') : String(container?.Id || '').slice(0, 12);
};

const isIpOrCidr = (entry) => {
  const [address, prefix, extra] = entry.split('/');
  const version = net.isIP(address);
  if (!version || extra !== undefined) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^\d{1,3}$/.test(prefix) && bits <= (version === 4 ? 32 : 128);
};

const splitList = (value) => String(value).split(',').map((s) => s.trim()).filter(Boolean);

// '/api/' and '/api' are the same prefix; '/' alone means no prefix
const normalizePrefix = (prefix) => (prefix ? String(prefix).replace(/\/+$/, '') : '');

/**
 * Check the feature labels (rate_limit, ip_filter, path_prefix).
 * @returns {string|null} the problem, or null when the labels are usable
 */
const validateFeatureLabels = (config) => {
  if (config.rate_limit !== undefined) {
    const rps = Number(config.rate_limit);
    if (!/^\d+$/.test(String(config.rate_limit)) || rps < 1 || rps > MAX_RATE_LIMIT) {
      return `invalid rate_limit label "${config.rate_limit}" (expected requests per second, 1-${MAX_RATE_LIMIT})`;
    }
  }
  if (config.ip_filter !== undefined) {
    const entries = splitList(config.ip_filter);
    if (entries.length === 0 || entries.length > MAX_IP_FILTER_ENTRIES) {
      return `invalid ip_filter label (expected 1-${MAX_IP_FILTER_ENTRIES} comma-separated IPs or CIDR ranges)`;
    }
    const bad = entries.find((entry) => !isIpOrCidr(entry));
    if (bad) return `invalid ip_filter entry "${bad}"`;
  }
  if (config.path_prefix && !PATH_PREFIX_PATTERN.test(config.path_prefix)) {
    return `invalid path_prefix label "${config.path_prefix}"`;
  }
  return null;
};

/**
 * Proxy fields the labels control. A label that is absent gives null (or false), so
 * removing a label removes the feature.
 */
const labelFeatures = (config, upstream) => {
  const prefix = normalizePrefix(config.path_prefix);
  return {
    rate_limit: config.rate_limit !== undefined
      ? { enabled: true, requests_per_second: Number(config.rate_limit) }
      : null,
    ip_filtering: config.ip_filter !== undefined
      ? { enabled: true, mode: 'allow', ip_list: splitList(config.ip_filter) }
      : null,
    // A path route replaces the default handler, so only the prefix is exposed
    path_routing: prefix
      ? { enabled: true, routes: [{ path: prefix, upstream_url: upstream }, { path: `${prefix}/*`, upstream_url: upstream }] }
      : null,
    security_headers_enabled: config.security_headers === true,
  };
};

// A feature saved as { enabled: false } is the same as no feature
const effective = (value) => (value && value.enabled ? value : null);
const sameValue = (a, b) => JSON.stringify(effective(a)) === JSON.stringify(effective(b));

/** Names of the label-controlled fields whose value on the proxy differs from the labels. */
const changedFeatures = (proxy, features) =>
  Object.keys(features).filter((field) => field === 'security_headers_enabled'
    ? Boolean(proxy[field]) !== features[field]
    : !sameValue(proxy[field], features[field]));

module.exports = {
  labelsOf,
  containerNameOf,
  validateFeatureLabels,
  labelFeatures,
  changedFeatures,
};
