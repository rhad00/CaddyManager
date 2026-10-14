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
 * Basic auth from a backup carries the bcrypt hash; one written by hand may carry a
 * plaintext password, which is hashed like an API request. A Git export carries
 * neither: the hash stored for the proxy of the same name is kept.
 * @param {Object} input
 * @param {Object} [existing] - basic_auth currently stored for a proxy of the same name
 */
async function importBasicAuth(input, existing) {
  if (input === undefined) return input;
  if (input?.hashed_password !== undefined && !BCRYPT_HASH.test(String(input.hashed_password))) {
    throw new Error('basic_auth hashed_password is not a bcrypt hash');
  }
  return prepareBasicAuth(input, input?.hashed_password ? input : (existing || input));
}

/**
 * @param {Object} data - one proxy definition
 * @returns {Promise<{fields: Object, headers: Object[], middlewares: Object[]}>}
 */
async function prepareOne(data, existingBasicAuth = new Map()) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('entry must be an object');
  }
  if (typeof data.upstream_url !== 'string' || data.upstream_url === '') {
    throw new Error('upstream_url is required');
  }

  const validation = validateProxyInput(data);
  if (!validation.valid) throw new Error(validation.message);

  // Exports write basic_auth: null for proxies without it, meaning "not set"
  const { basic_auth: basicAuth, ...rest } = pick(data, PROXY_ALLOWED_FIELDS);
  const fields = basicAuth === undefined || basicAuth === null
    ? rest
    : { ...rest, basic_auth: await importBasicAuth(basicAuth, existingBasicAuth.get(data.name)) };

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
 * @param {{existingBasicAuth?: Map<string, Object>}} [options] - stored basic_auth by
 *   proxy name, for imports whose password hashes were left out (Git exports)
 * @returns {Promise<Array<{fields: Object, headers: Object[], middlewares: Object[]}>>}
 * @throws {ProxyImportError} listing every invalid entry
 */
async function prepareImportedProxies(proxies, { existingBasicAuth = new Map() } = {}) {
  if (!Array.isArray(proxies)) {
    throw new ProxyImportError(['proxies must be a list']);
  }

  const results = await Promise.allSettled(proxies.map((data) => prepareOne(data, existingBasicAuth)));
  const label = (i) => `#${i + 1} "${proxies[i]?.name ?? 'unnamed'}"`;
  const errors = results.flatMap((result, i) => (result.status === 'rejected'
    ? [`${label(i)}: ${result.reason.message}`]
    : []));

  // The API refuses a domain another proxy already serves; so does an import
  const owner = new Map();
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const domains = [].concat(result.value.fields.domains ?? []);
    for (const domain of domains) {
      if (owner.has(domain)) {
        errors.push(`${label(i)}: domain ${domain} is already used by #${owner.get(domain) + 1}`);
      } else {
        owner.set(domain, i);
      }
    }
  });
  if (errors.length > 0) throw new ProxyImportError(errors);

  return results.map((result) => result.value);
}

module.exports = { prepareImportedProxies, ProxyImportError };
