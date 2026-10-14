/**
 * Proxy middlewares: validation of what the API stores, and the Caddy handlers they
 * become (MODERNIZATION.md 0.29). Only the types that have a defined configuration are
 * supported; IP filtering and basic auth are proxy settings of their own.
 */
export const MIDDLEWARE_TYPES = ['rate_limit', 'redirect'] as const;
export type MiddlewareType = (typeof MIDDLEWARE_TYPES)[number];

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/** A stored Middleware row, as far as this module reads it */
export interface MiddlewareRow {
  middleware_type?: string;
  configuration?: Record<string, unknown>;
  enabled?: boolean;
  order?: number;
}

/** A Caddy handler object, passed to Caddy as JSON */
export type CaddyHandler = Record<string, unknown>;

const MIN_RATE = 1;
const MAX_RATE = 100000;
const RATE_WINDOWS: Record<string, string> = { second: '1s', minute: '1m', hour: '1h' };
const DEFAULT_RATE_UNIT = 'second';

const REDIRECT_CODES = [301, 302, 303, 307, 308];
const DEFAULT_REDIRECT_CODE = 302;
const MAX_TEXT_LENGTH = 2048;
// A path, or an absolute http(s) URL. Never whitespace, control characters, backslashes
// or braces: the target goes into a Location header, and Caddy expands {placeholders}
// in response headers ({env.X}, {file.X}, {http.request...}), which would leak Caddy's
// environment or let a request choose the target. A path may not start with "//" or
// "/\" either: browsers read those as another site.
const FORBIDDEN = '\\x00-\\x20\\x7f{}\\\\';
const REDIRECT_FROM = new RegExp(`^/[^${FORBIDDEN}]*$`);
const REDIRECT_TO = new RegExp(`^(/(?![/\\\\])[^${FORBIDDEN}]*|https?://[^${FORBIDDEN}]+)$`);

type Config = Record<string, unknown>;

const invalid = (message: string): ValidationResult => ({ valid: false, message });

const validateRateLimit = (config: Config): ValidationResult => {
  const { rate, unit } = config;
  if (typeof rate !== 'number' || !Number.isInteger(rate) || rate < MIN_RATE || rate > MAX_RATE) {
    return invalid(`rate_limit middleware: rate must be a whole number from ${MIN_RATE} to ${MAX_RATE}`);
  }
  if (unit !== undefined && !(typeof unit === 'string' && Object.hasOwn(RATE_WINDOWS, unit))) {
    return invalid(`rate_limit middleware: unit must be one of: ${Object.keys(RATE_WINDOWS).join(', ')}`);
  }
  return { valid: true };
};

const validateRedirect = (config: Config): ValidationResult => {
  const { from, to, code } = config;
  if (typeof from !== 'string' || from.length > MAX_TEXT_LENGTH || !REDIRECT_FROM.test(from)) {
    return invalid('redirect middleware: from must be a path starting with "/"');
  }
  if (typeof to !== 'string' || to.length > MAX_TEXT_LENGTH || !REDIRECT_TO.test(to)) {
    return invalid('redirect middleware: to must be a path starting with "/" or an http(s) URL');
  }
  if (code !== undefined && !(typeof code === 'number' && REDIRECT_CODES.includes(code))) {
    return invalid(`redirect middleware: code must be one of: ${REDIRECT_CODES.join(', ')}`);
  }
  return { valid: true };
};

const VALIDATORS: Record<MiddlewareType, (config: Config) => ValidationResult> = {
  rate_limit: validateRateLimit,
  redirect: validateRedirect,
};

const unsupportedType = (type: unknown): ValidationResult => {
  if (type === 'ip_filter') return invalid('middleware_type ip_filter is not supported here: use the ip_filtering setting of the proxy');
  if (type === 'basic_auth') return invalid('middleware_type basic_auth is not supported here: use the basic_auth setting of the proxy');
  return invalid(`middleware_type must be one of: ${MIDDLEWARE_TYPES.join(', ')}`);
};

const isMiddlewareType = (type: unknown): type is MiddlewareType =>
  (MIDDLEWARE_TYPES as readonly unknown[]).includes(type);

const validateMiddleware = (middleware: unknown): ValidationResult => {
  if (!middleware || typeof middleware !== 'object') return invalid('each middleware must be an object');
  const { middleware_type: type, configuration: config } = middleware as MiddlewareRow;
  if (!isMiddlewareType(type)) return unsupportedType(type);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return invalid(`${type} middleware: configuration must be an object`);
  }
  return VALIDATORS[type](config);
};

/** @param middlewares - the middlewares of a proxy request (optional) */
export const validateMiddlewares = (middlewares: unknown): ValidationResult => {
  if (middlewares === undefined || middlewares === null) return { valid: true };
  if (!Array.isArray(middlewares)) return invalid('middlewares must be an array');
  for (const middleware of middlewares) {
    const result = validateMiddleware(middleware);
    if (!result.valid) return result;
  }
  return { valid: true };
};

// The configurations below passed validateMiddleware, so their fields have the checked types.
const rateLimitHandler = (config: Config, zone: string): CaddyHandler => ({
  handler: 'rate_limit',
  rate_limits: {
    [zone]: {
      key: '{http.request.remote.host}',
      window: RATE_WINDOWS[(config.unit as string | undefined) || DEFAULT_RATE_UNIT],
      max_events: config.rate,
    },
  },
});

const redirectHandler = (config: Config): CaddyHandler => ({
  handler: 'subroute',
  routes: [{
    match: [{ path: [config.from] }],
    handle: [{
      handler: 'static_response',
      status_code: config.code || DEFAULT_REDIRECT_CODE,
      headers: { Location: [config.to] },
    }],
  }],
});

/**
 * Caddy handlers for the enabled middlewares of a proxy, in their configured order.
 * Entries that do not validate (stored by an older version) are skipped, never sent to
 * Caddy: one bad handler makes Caddy reject the whole configuration.
 * @param middlewares - Middleware rows
 * @param options.hasRateLimit - the proxy's own rate_limit setting is on, which then wins
 *   over rate_limit middlewares
 */
export const middlewareHandlers = (
  middlewares: MiddlewareRow[] | null | undefined,
  { hasRateLimit = false }: { hasRateLimit?: boolean } = {},
): CaddyHandler[] => {
  if (!Array.isArray(middlewares)) return [];
  const ordered = middlewares
    .filter((m) => m && m.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const handlers: CaddyHandler[] = [];
  ordered.forEach((middleware, index) => {
    if (!validateMiddleware(middleware).valid) return;
    const config = middleware.configuration as Config;
    if (middleware.middleware_type === 'rate_limit') {
      if (!hasRateLimit) handlers.push(rateLimitHandler(config, `middleware_${index}`));
    } else {
      handlers.push(redirectHandler(config));
    }
  });
  return handlers;
};
