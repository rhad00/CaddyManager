/**
 * Prepare proxies read from outside the API (a GitOps repository, a backup file) for
 * storage. Every entry must pass the same validation as `POST /api/proxies`, and only
 * the fields the API accepts are kept, so an import cannot set ids, owners, route
 * indexes or upstreams the API would refuse.
 */
const { PROXY_ALLOWED_FIELDS, validateProxyInput } = require('./proxyValidation');
const { prepareBasicAuth } = require('./basicAuth');

const HEADER_FIELDS = ['header_type', 'header_name', 'header_value', 'enabled'];
const MIDDLEWARE_FIELDS = ['middleware_type', 'configuration', 'enabled', 'order'];
// $2a$/$2b$/$2y$, two-digit cost, 22-char salt + 31-char hash
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

class ProxyImportError extends Error {
  /** @param {string[]} errors - one message per invalid entry */
  constructor(errors) {
    super(`Import rejected, ${errors.length} invalid proxy definition(s): ${errors.join('; ')}`);
    this.name = 'ProxyImportError';
    this.errors = errors;
  }
}

const pick = (source, fields) => Object.fromEntries(
  fields.filter((f) => Object.prototype.hasOwnProperty.call(source, f)).map((f) => [f, source[f]])
);

/**
 * Basic auth from an export carries the bcrypt hash; one written by hand may carry a
 * plaintext password, which is hashed like an API request.
 */
async function importBasicAuth(input) {
  if (input === undefined || input === null) return input;
  if (input?.hashed_password !== undefined && !BCRYPT_HASH.test(String(input.hashed_password))) {
    throw new Error('basic_auth hashed_password is not a bcrypt hash');
  }
  return prepareBasicAuth(input, input);
}

/**
 * @param {Object} data - one proxy definition
 * @returns {Promise<{fields: Object, headers: Object[], middlewares: Object[]}>}
 */
async function prepareOne(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('entry must be an object');
  }
  if (typeof data.upstream_url !== 'string' || data.upstream_url === '') {
    throw new Error('upstream_url is required');
  }

  const validation = validateProxyInput(data);
  if (!validation.valid) throw new Error(validation.message);

  const fields = pick(data, PROXY_ALLOWED_FIELDS);
  if ('basic_auth' in fields) fields.basic_auth = await importBasicAuth(fields.basic_auth);

  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    fields,
    headers: list(data.headers).map((h) => pick(h, HEADER_FIELDS)),
    middlewares: list(data.middlewares).map((m) => pick(m, MIDDLEWARE_FIELDS)),
  };
}

/**
 * Validate and sanitise a list of proxy definitions. All entries are checked before
 * anything is returned, so the caller can refuse the whole import up front.
 * @param {Object[]} proxies
 * @returns {Promise<Array<{fields: Object, headers: Object[], middlewares: Object[]}>>}
 * @throws {ProxyImportError} listing every invalid entry
 */
async function prepareImportedProxies(proxies) {
  if (!Array.isArray(proxies)) {
    throw new ProxyImportError(['proxies must be a list']);
  }

  const results = await Promise.allSettled(proxies.map(prepareOne));
  const errors = results.flatMap((result, i) => (result.status === 'rejected'
    ? [`#${i + 1} "${proxies[i]?.name ?? 'unnamed'}": ${result.reason.message}`]
    : []));
  if (errors.length > 0) throw new ProxyImportError(errors);

  return results.map((result) => result.value);
}

module.exports = { prepareImportedProxies, ProxyImportError };
