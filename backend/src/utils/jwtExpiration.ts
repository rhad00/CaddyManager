const DEFAULT_EXPIRATION = '24h';

/**
 * How long a login token lasts. The documentation, the compose files and the .env templates
 * name the setting JWT_EXPIRES_IN, but the code only ever read JWT_EXPIRATION, so the documented
 * name did nothing. Both work; the older name wins when both are set.
 */
export function jwtExpiration(env: NodeJS.ProcessEnv): string {
  return [env.JWT_EXPIRATION, env.JWT_EXPIRES_IN]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value)) ?? DEFAULT_EXPIRATION;
}
