export interface CookiePolicy {
  secure: boolean;
  sameSite: 'strict' | 'lax';
  csrfCookieName: string;
}

/**
 * How the login and CSRF cookies are issued. Production means Secure cookies, which browsers only
 * keep over HTTPS (or on localhost): someone who installs CaddyManager on a server and opens
 * http://server-ip:8080 could never log in. COOKIE_SECURE=false is the explicit way out until the
 * UI is served over HTTPS (for example through a CaddyManager proxy for its own domain).
 */
export function cookiePolicy(env: NodeJS.ProcessEnv): CookiePolicy {
  const production = env.NODE_ENV === 'production';
  const secure = env.COOKIE_SECURE === 'true' ? true : env.COOKIE_SECURE === 'false' ? false : production;
  return {
    secure,
    sameSite: production ? 'strict' : 'lax',
    // the __Host- prefix is only valid on Secure cookies
    csrfCookieName: secure ? '__Host-x-csrf-token' : 'x-csrf-token',
  };
}
