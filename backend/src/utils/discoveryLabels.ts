/**
 * Docker discovery labels: where Docker keeps them, how they are checked and which proxy
 * fields they become (MODERNIZATION.md 0.24).
 */
import net from 'net';

const MAX_RATE_LIMIT = 100000;
const MAX_IP_FILTER_ENTRIES = 10; // the Caddy builder applies at most 10 entries
const PATH_PREFIX_PATTERN = /^\/[A-Za-z0-9._~\-/]{0,200}$/;

/** Parsed `caddymanager.*` labels (label values are strings; the parser may set booleans) */
export interface LabelConfig {
  rate_limit?: string | number;
  ip_filter?: string;
  path_prefix?: string;
  security_headers?: boolean;
  compression?: boolean;
  template?: string;
  [label: string]: unknown;
}

/** The parts of `docker inspect` / the container list that this module reads */
export interface DockerContainer {
  Id?: string;
  Name?: string;
  Names?: string[];
  Labels?: Record<string, string>;
  Config?: { Labels?: Record<string, string> };
}

/** Proxy fields the labels control */
export interface LabelFeatures {
  rate_limit: { enabled: boolean; requests_per_second: number } | null;
  ip_filtering: { enabled: boolean; mode: string; ip_list: string[] } | null;
  path_routing: { enabled: boolean; routes: Array<{ path: string; upstream_url: string }> } | null;
  security_headers_enabled: boolean;
  compression_enabled: boolean;
}

type FeatureField = keyof LabelFeatures;

/**
 * Labels of a container. `docker inspect` keeps them in Config.Labels; the container
 * list (and older fixtures) have them at the top level.
 */
export const labelsOf = (container: DockerContainer | null | undefined): Record<string, string> =>
  container?.Config?.Labels || container?.Labels || {};

/** Container name without the leading slash: Name from inspect, Names[0] from the list. */
export const containerNameOf = (container: DockerContainer | null | undefined): string => {
  const name = container?.Name || container?.Names?.[0];
  return name ? name.replace(/^\//, '') : String(container?.Id || '').slice(0, 12);
};

const isIpOrCidr = (entry: string): boolean => {
  const [address, prefix, extra] = entry.split('/');
  const version = net.isIP(address);
  // Node accepts an IPv6 zone ("fe80::1%eth0"); Caddy's remote_ip matcher does not
  if (!version || extra !== undefined || address.includes('%')) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^\d{1,3}$/.test(prefix) && bits <= (version === 4 ? 32 : 128);
};

const splitList = (value: unknown): string[] =>
  String(value).split(',').map((s) => s.trim()).filter(Boolean);

// '/api/' and '/api' are the same prefix; '/' alone means no prefix
const normalizePrefix = (prefix: unknown): string => (prefix ? String(prefix).replace(/\/+$/, '') : '');

/**
 * Check the feature labels (rate_limit, ip_filter, path_prefix).
 * @returns the problem, or null when the labels are usable
 */
export const validateFeatureLabels = (config: LabelConfig): string | null => {
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
  if (config.path_prefix) {
    if (!PATH_PREFIX_PATTERN.test(config.path_prefix) || /\.\.|\/\//.test(config.path_prefix)) {
      return `invalid path_prefix label "${config.path_prefix}"`;
    }
    // Path routing replaces the default handler, which is where Caddy gets the headers
    if (config.security_headers || config.template) {
      return 'path_prefix cannot be combined with security_headers or template: path routing does not apply headers';
    }
  }
  return null;
};

/**
 * Proxy fields the labels control. A label that is absent gives null (or false), so
 * removing a label removes the feature.
 */
export const labelFeatures = (config: LabelConfig, upstream: string): LabelFeatures => {
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
    compression_enabled: config.compression !== false,
  };
};

// Fields where a change can widen access or alter what is served; a label change to
// one of them sends an approved proxy back to review (compression is not one of them)
export const REVIEWED_FIELDS: readonly string[] = ['rate_limit', 'ip_filtering', 'path_routing', 'security_headers_enabled'];
const BOOLEAN_FIELDS: FeatureField[] = ['security_headers_enabled', 'compression_enabled'];

// A feature saved as { enabled: false } is the same as no feature
const effective = (value: unknown): unknown =>
  (value && (value as { enabled?: boolean }).enabled ? value : null);
const sameFeature = (field: FeatureField, a: unknown, b: unknown): boolean => (BOOLEAN_FIELDS.includes(field)
  ? Boolean(a) === Boolean(b)
  : JSON.stringify(effective(a)) === JSON.stringify(effective(b)));

/**
 * What a rescan may change on an existing proxy. A field is only touched when the labels
 * changed since the last scan AND the proxy still holds what the previous labels set;
 * a value an admin changed by hand is kept, and unchanged labels change nothing (a
 * restart must not undo the admin's work).
 * @param proxy - the stored proxy
 * @param previous - labelFeatures of the labels at the last scan
 * @param next - labelFeatures of the labels now
 */
export const featureUpdates = (
  proxy: Partial<Record<FeatureField, unknown>>,
  previous: LabelFeatures,
  next: LabelFeatures,
): { updates: Partial<LabelFeatures>; diverged: FeatureField[] } => {
  const updates: Record<string, unknown> = {};
  const diverged: FeatureField[] = [];
  (Object.keys(next) as FeatureField[]).forEach((field) => {
    if (sameFeature(field, previous[field], next[field])) return;
    if (sameFeature(field, proxy[field], previous[field])) updates[field] = next[field];
    else diverged.push(field);
  });
  return { updates: updates as Partial<LabelFeatures>, diverged };
};
