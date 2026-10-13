/**
 * HTTP basic authentication for proxies.
 *
 * Stored shape (Proxy.basic_auth): { enabled, username, hashed_password }.
 * The plaintext password only exists in the incoming request; it is bcrypt-hashed
 * before it reaches the database and never returned by the API.
 */
// bcrypt (native) is loaded only when hashing: caddyService needs just toCaddyAuthHandler,
// and its unit tests mock `fs`, which breaks native module resolution
const hash = (plaintext) => require('bcrypt').hash(plaintext, BCRYPT_ROUNDS);

// Caddy verifies the hash on every request (with a cache); 12 rounds is a sane balance
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt ignores everything past 72 bytes
const MAX_PASSWORD_LENGTH = 72;
// RFC 7617: user-id must not contain a colon; also keep it printable and space-free
const USERNAME_PATTERN = /^[\x21-\x39\x3B-\x7E]{1,64}$/;

/**
 * Turn the basic_auth object from a create/update request into what we store.
 * @param {object|undefined} input - req.body.basic_auth
 * @param {object|null} existing - the proxy's current basic_auth, if any
 * @returns {Promise<object|undefined>} value to store, or undefined to leave unchanged
 * @throws {Error} with a user-facing message on invalid input
 */
async function prepareBasicAuth(input, existing) {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('basic_auth must be an object');
  }

  const username = typeof input.username === 'string' ? input.username.trim() : existing?.username;

  if (!input.enabled) {
    return username ? { enabled: false, username } : { enabled: false };
  }

  if (!username || !USERNAME_PATTERN.test(username)) {
    throw new Error('basic_auth username is required (1-64 printable characters, no spaces or colons)');
  }

  const newPassword = typeof input.password === 'string' && input.password !== '' ? input.password : null;
  if (newPassword !== null) {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`basic_auth password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (Buffer.byteLength(newPassword, 'utf8') > MAX_PASSWORD_LENGTH) {
      throw new Error(`basic_auth password must be at most ${MAX_PASSWORD_LENGTH} bytes`);
    }
    return { enabled: true, username, hashed_password: await hash(newPassword) };
  }

  if (existing?.hashed_password) {
    return { enabled: true, username, hashed_password: existing.hashed_password };
  }
  // Records written before hashing was introduced held the plaintext in `password`
  if (typeof existing?.password === 'string' && existing.password !== '') {
    return { enabled: true, username, hashed_password: await hash(existing.password) };
  }

  throw new Error('basic_auth password is required when enabling basic authentication');
}

/**
 * Shape returned by the API: never exposes the hash (or a legacy plaintext password).
 * @param {object|null} basicAuth
 * @returns {object|null}
 */
function redactBasicAuth(basicAuth) {
  if (!basicAuth) return basicAuth;
  // eslint-disable-next-line no-unused-vars
  const { hashed_password, password, ...rest } = basicAuth;
  return { ...rest, has_password: Boolean(hashed_password || password) };
}

/**
 * Caddy JSON handler for a proxy's basic auth.
 * `basic_auth` is only a Caddyfile directive; JSON uses `authentication` + `http_basic`.
 * @param {object|null} basicAuth
 * @returns {object|null} handler, or null when basic auth is disabled
 */
function toCaddyAuthHandler(basicAuth) {
  if (!basicAuth || !basicAuth.enabled) return null;

  if (!basicAuth.username || !basicAuth.hashed_password) {
    // Fail closed for this route only: throwing would abort the whole config rebuild
    // and returning null would expose the upstream without authentication.
    return {
      handler: 'static_response',
      status_code: 401,
      body: 'Authentication is misconfigured',
    };
  }

  return {
    handler: 'authentication',
    providers: {
      http_basic: {
        accounts: [{ username: basicAuth.username, password: basicAuth.hashed_password }],
      },
    },
  };
}

module.exports = { prepareBasicAuth, redactBasicAuth, toCaddyAuthHandler, BCRYPT_ROUNDS };
