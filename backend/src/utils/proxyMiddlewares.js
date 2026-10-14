/**
 * Proxy middlewares: validation of what the API stores, and the Caddy handlers they
 * become (MODERNIZATION.md 0.29). Only the types that have a defined configuration are
 * supported; IP filtering and basic auth are proxy settings of their own.
 */
const MIDDLEWARE_TYPES = ['rate_limit', 'redirect'];

const MIN_RATE = 1;
const MAX_RATE = 100000;
const RATE_WINDOWS = { second: '1s', minute: '1m', hour: '1h' };
const DEFAULT_RATE_UNIT = 'second';

const REDIRECT_CODES = [301, 302, 303, 307, 308];
const DEFAULT_REDIRECT_CODE = 302;
const MAX_TEXT_LENGTH = 2048;
// A path, or an absolute http(s) URL; no whitespace or control characters (the value
// goes into a Location header)
const REDIRECT_FROM = /^\/\S*$/;
const REDIRECT_TO = /^(\/\S*|https?:\/\/\S+)$/;

const invalid = (message) => ({ valid: false, message });

const validateRateLimit = (config) => {
  if (!Number.isInteger(config.rate) || config.rate < MIN_RATE || config.rate > MAX_RATE) {
    return invalid(`rate_limit middleware: rate must be a whole number from ${MIN_RATE} to ${MAX_RATE}`);
  }
  if (config.unit !== undefined && !Object.hasOwn(RATE_WINDOWS, config.unit)) {
    return invalid(`rate_limit middleware: unit must be one of: ${Object.keys(RATE_WINDOWS).join(', ')}`);
  }
  return { valid: true };
};

const validateRedirect = (config) => {
  if (typeof config.from !== 'string' || config.from.length > MAX_TEXT_LENGTH || !REDIRECT_FROM.test(config.from)) {
    return invalid('redirect middleware: from must be a path starting with "/"');
  }
  if (typeof config.to !== 'string' || config.to.length > MAX_TEXT_LENGTH || !REDIRECT_TO.test(config.to)) {
    return invalid('redirect middleware: to must be a path starting with "/" or an http(s) URL');
  }
  if (config.code !== undefined && !REDIRECT_CODES.includes(config.code)) {
    return invalid(`redirect middleware: code must be one of: ${REDIRECT_CODES.join(', ')}`);
  }
  return { valid: true };
};

const VALIDATORS = { rate_limit: validateRateLimit, redirect: validateRedirect };

const unsupportedType = (type) => {
  if (type === 'ip_filter') return invalid('middleware_type ip_filter is not supported here: use the ip_filtering setting of the proxy');
  if (type === 'basic_auth') return invalid('middleware_type basic_auth is not supported here: use the basic_auth setting of the proxy');
  return invalid(`middleware_type must be one of: ${MIDDLEWARE_TYPES.join(', ')}`);
};

const validateMiddleware = (middleware) => {
  if (!middleware || typeof middleware !== 'object') return invalid('each middleware must be an object');
  if (!MIDDLEWARE_TYPES.includes(middleware.middleware_type)) return unsupportedType(middleware.middleware_type);
  const config = middleware.configuration;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return invalid(`${middleware.middleware_type} middleware: configuration must be an object`);
  }
  return VALIDATORS[middleware.middleware_type](config);
};

/**
 * @param {*} middlewares - the middlewares of a proxy request (optional)
 * @returns {{ valid: boolean, message?: string }}
 */
const validateMiddlewares = (middlewares) => {
  if (middlewares === undefined || middlewares === null) return { valid: true };
  if (!Array.isArray(middlewares)) return invalid('middlewares must be an array');
  for (const middleware of middlewares) {
    const result = validateMiddleware(middleware);
    if (!result.valid) return result;
  }
  return { valid: true };
};

const rateLimitHandler = (config, zone) => ({
  handler: 'rate_limit',
  rate_limits: {
    [zone]: {
      key: '{http.request.remote.host}',
      window: RATE_WINDOWS[config.unit || DEFAULT_RATE_UNIT],
      max_events: config.rate,
    },
  },
});

const redirectHandler = (config) => ({
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
 * @param {Object[]} middlewares - Middleware rows
 * @param {{ hasRateLimit?: boolean }} [options] - hasRateLimit: the proxy's own rate_limit
 *   setting is on, which then wins over rate_limit middlewares
 * @returns {Object[]}
 */
const middlewareHandlers = (middlewares, { hasRateLimit = false } = {}) => {
  if (!Array.isArray(middlewares)) return [];
  const ordered = middlewares
    .filter((m) => m && m.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const handlers = [];
  ordered.forEach((middleware, index) => {
    if (!validateMiddleware(middleware).valid) return;
    if (middleware.middleware_type === 'rate_limit') {
      if (!hasRateLimit) handlers.push(rateLimitHandler(middleware.configuration, `middleware_${index}`));
    } else {
      handlers.push(redirectHandler(middleware.configuration));
    }
  });
  return handlers;
};

module.exports = { MIDDLEWARE_TYPES, validateMiddlewares, middlewareHandlers };
