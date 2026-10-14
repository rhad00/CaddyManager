/**
 * Prepare proxies read from outside the API (a GitOps repository, a backup file) for
 * storage. Every entry must pass the same validation as `POST /api/proxies`, and only
 * the fields the API accepts are kept, so an import cannot set ids, owners, route
 * indexes or upstreams the API would refuse.
 */
import { PROXY_ALLOWED_FIELDS, validateProxyInput } from './proxyValidation';
import { prepareBasicAuth, type BasicAuth } from './basicAuth';

const HEADER_FIELDS = ['header_type', 'header_name', 'header_value', 'enabled'];
const MIDDLEWARE_FIELDS = ['middleware_type', 'configuration', 'enabled', 'order'];
// $2a$/$2b$/$2y$, two-digit cost, 22-char salt + 31-char hash
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

type Fields = Record<string, unknown>;

/** A proxy ready to store: its own columns plus the rows that belong to it */
export interface PreparedProxy {
  fields: Fields;
  headers: Fields[];
  middlewares: Fields[];
}

export class ProxyImportError extends Error {
  errors: string[];

  /** @param errors - one message per invalid entry */
  constructor(errors: string[]) {
    super(`Import rejected, ${errors.length} invalid proxy definition(s): ${errors.join('; ')}`);
    this.name = 'ProxyImportError';
    this.errors = errors;
  }
}

const pick = (source: object, fields: string[]): Fields => Object.fromEntries(
  fields
    .filter((f) => Object.prototype.hasOwnProperty.call(source, f))
    .map((f) => [f, (source as Fields)[f]]),
);

/**
 * Basic auth from a backup carries the bcrypt hash; one written by hand may carry a
 * plaintext password, which is hashed like an API request. A Git export carries
 * neither: the hash stored for the proxy of the same name is kept.
 * @param existing - basic_auth currently stored for a proxy of the same name
 */
async function importBasicAuth(input: unknown, existing?: BasicAuth): Promise<BasicAuth | undefined> {
  if (input === undefined) return undefined;
  const auth = input as BasicAuth | null;
  if (auth?.hashed_password !== undefined && !BCRYPT_HASH.test(String(auth.hashed_password))) {
    throw new Error('basic_auth hashed_password is not a bcrypt hash');
  }
  return prepareBasicAuth(input, auth?.hashed_password ? auth : (existing || auth));
}

/** @param data - one proxy definition */
async function prepareOne(
  data: unknown,
  existingBasicAuth: Map<string, BasicAuth>,
): Promise<PreparedProxy> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('entry must be an object');
  }
  const entry = data as Fields;
  if (typeof entry.upstream_url !== 'string' || entry.upstream_url === '') {
    throw new Error('upstream_url is required');
  }

  const validation = validateProxyInput(entry);
  if (!validation.valid) throw new Error(validation.message);

  // Exports write basic_auth: null for proxies without it, meaning "not set"
  const { basic_auth: basicAuth, ...rest } = pick(entry, PROXY_ALLOWED_FIELDS);
  const fields = basicAuth === undefined || basicAuth === null
    ? rest
    : { ...rest, basic_auth: await importBasicAuth(basicAuth, existingBasicAuth.get(entry.name as string)) };

  const list = (value: unknown): object[] => (Array.isArray(value) ? value : []);
  return {
    fields,
    headers: list(entry.headers).map((h) => pick(h, HEADER_FIELDS)),
    middlewares: list(entry.middlewares).map((m) => pick(m, MIDDLEWARE_FIELDS)),
  };
}

/**
 * Validate and sanitise a list of proxy definitions. All entries are checked before
 * anything is returned, so the caller can refuse the whole import up front.
 * @param options.existingBasicAuth - stored basic_auth by proxy name, for imports whose
 *   password hashes were left out (Git exports)
 * @throws {ProxyImportError} listing every invalid entry
 */
export async function prepareImportedProxies(
  proxies: unknown,
  { existingBasicAuth = new Map<string, BasicAuth>() }: { existingBasicAuth?: Map<string, BasicAuth> } = {},
): Promise<PreparedProxy[]> {
  if (!Array.isArray(proxies)) {
    throw new ProxyImportError(['proxies must be a list']);
  }

  const results = await Promise.allSettled(proxies.map((data) => prepareOne(data, existingBasicAuth)));
  const label = (i: number): string => `#${i + 1} "${proxies[i]?.name ?? 'unnamed'}"`;
  const errors = results.flatMap((result, i) => (result.status === 'rejected'
    ? [`${label(i)}: ${result.reason.message}`]
    : []));

  // The API refuses a domain another proxy already serves; so does an import
  const owner = new Map<unknown, number>();
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const domains = ([] as unknown[]).concat(result.value.fields.domains ?? []);
    for (const domain of domains) {
      if (owner.has(domain)) {
        errors.push(`${label(i)}: domain ${domain} is already used by #${(owner.get(domain) as number) + 1}`);
      } else {
        owner.set(domain, i);
      }
    }
  });
  if (errors.length > 0) throw new ProxyImportError(errors);

  return results.map((result) => (result as PromiseFulfilledResult<PreparedProxy>).value);
}
