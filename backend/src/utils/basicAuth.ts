/**
 * HTTP basic authentication for proxies.
 *
 * Stored shape (Proxy.basic_auth): { enabled, username, hashed_password }.
 * The plaintext password only exists in the incoming request; it is bcrypt-hashed
 * before it reaches the database and never returned by the API.
 */

export interface BasicAuth {
  enabled?: boolean;
  username?: string;
  /** bcrypt hash, the only form that is stored now */
  hashed_password?: string;
  /** the incoming plaintext, or the plaintext of records written before hashing was introduced */
  password?: string;
  /** added by redactBasicAuth */
  has_password?: boolean;
}

/** Caddy JSON handler */
export type CaddyAuthHandler = Record<string, unknown>;

// Caddy verifies the hash on every request (with a cache); 12 rounds is a sane balance
export const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt ignores everything past 72 bytes
const MAX_PASSWORD_LENGTH = 72;
// RFC 7617: user-id must not contain a colon; also keep it printable and space-free
const USERNAME_PATTERN = /^[\x21-\x39\x3B-\x7E]{1,64}$/;

// bcrypt (native) is loaded only when hashing: caddyService needs just toCaddyAuthHandler,
// and its unit tests mock `fs`, which breaks native module resolution
const hash = (plaintext: string): Promise<string> =>
  (require('bcrypt') as typeof import('bcrypt')).hash(plaintext, BCRYPT_ROUNDS);

/**
 * Turn the basic_auth object from a create/update request into what we store.
 * @param input - req.body.basic_auth
 * @param existing - the proxy's current basic_auth, if any
 * @returns value to store, or undefined to leave unchanged
 * @throws {Error} with a user-facing message on invalid input
 */
export async function prepareBasicAuth(
  input: unknown,
  existing?: BasicAuth | null,
): Promise<BasicAuth | undefined> {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('basic_auth must be an object');
  }
  const request = input as Record<string, unknown>;

  const username = typeof request.username === 'string' ? request.username.trim() : existing?.username;

  if (!request.enabled) {
    return username ? { enabled: false, username } : { enabled: false };
  }

  if (!username || !USERNAME_PATTERN.test(username)) {
    throw new Error('basic_auth username is required (1-64 printable characters, no spaces or colons)');
  }

  const newPassword = typeof request.password === 'string' && request.password !== '' ? request.password : null;
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

/** Shape returned by the API: never exposes the hash (or a legacy plaintext password). */
export function redactBasicAuth<T extends BasicAuth | null | undefined>(
  basicAuth: T,
): T extends BasicAuth ? Omit<BasicAuth, 'hashed_password' | 'password'> : T {
  if (!basicAuth) return basicAuth as never;
  const { hashed_password, password, ...rest } = basicAuth;
  return { ...rest, has_password: Boolean(hashed_password || password) } as never;
}

/**
 * Caddy JSON handler for a proxy's basic auth.
 * `basic_auth` is only a Caddyfile directive; JSON uses `authentication` + `http_basic`.
 * @returns handler, or null when basic auth is disabled
 */
export function toCaddyAuthHandler(basicAuth: BasicAuth | null | undefined): CaddyAuthHandler | null {
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
