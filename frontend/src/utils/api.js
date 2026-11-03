/**
 * API utility functions for making authenticated requests with CSRF protection
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const CSRF_STORAGE_KEY = 'caddymanager.csrfToken';

// Default request timeout in milliseconds
const DEFAULT_TIMEOUT = 30000;

/**
 * An error with a message a person can act on. `kind` tells where it came from:
 * 'network' (no answer at all), 'timeout', or 'http' (the server answered with an error).
 */
export class ApiError extends Error {
  constructor(message, { kind = 'http', status = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

const NETWORK_MESSAGE =
  "CaddyManager can't reach the CaddyManager API. Check that the backend is running and that this page can open " +
  `${API_URL}, then try again.`;
const TIMEOUT_MESSAGE =
  'The backend did not answer within 30 seconds. It may be busy or stuck; check its log, then try again.';

// "Server error while creating proxy": says nothing the person can act on
const GENERIC_SERVER_MESSAGE = /^server error\b/i;

const usable = (message) => message && !GENERIC_SERVER_MESSAGE.test(message);

/** What the person can do about an HTTP status, when the server's own message is missing or unhelpful */
function guidanceFor(status, serverMessage, response) {
  switch (status) {
    case 401:
      return 'Your session has expired. Sign in again to continue.';
    case 403:
      if (/csrf/i.test(serverMessage)) {
        return 'The security token of this page is out of date. Reload the page and try again.';
      }
      if (serverMessage && !/^forbidden$/i.test(serverMessage)) return serverMessage;
      return "Your account doesn't have permission to do this. Ask an administrator, or sign in with an admin account.";
    case 404:
      return serverMessage
        ? `${serverMessage}. It may have been deleted; refresh the list.`
        : 'It no longer exists. It may have been deleted; refresh the list.';
    case 413:
      return 'The file or request is too large for the server. Use a smaller file (backups are limited by BACKUP_UPLOAD_MAX_MB).';
    case 429: {
      const seconds = Number.parseInt(response.headers?.get?.('Retry-After') ?? '', 10);
      return Number.isFinite(seconds) && seconds > 0
        ? `Too many requests. Try again in ${seconds} seconds.`
        : 'Too many requests. Wait a minute and try again.';
    }
    case 502:
    case 503:
    case 504:
      return usable(serverMessage)
        ? serverMessage
        : "The backend, or Caddy behind it, isn't answering. Check that both are running (docker compose ps) and look at their logs.";
    default:
      if (status >= 500) {
        return usable(serverMessage)
          ? serverMessage
          : 'The server hit an unexpected error. The details are in the backend log.';
      }
      return serverMessage || `The server refused the request (HTTP ${status}).`;
  }
}

/**
 * Turn a failed response into an ApiError that says what failed and what to do.
 * @param {Response} response - a response with ok === false
 * @param {string} action - what was being done, as a verb phrase: 'save the proxy', 'load templates'
 * @returns {Promise<ApiError>} to throw: `throw await apiError(response, 'save the proxy')`
 */
export const apiError = async (response, action) => {
  // An error page from nginx or a proxy is HTML, not JSON
  const body = await response.json().catch(() => null);
  const serverMessage = typeof body?.message === 'string' ? body.message.trim() : '';
  const detail = guidanceFor(response.status, serverMessage, response);
  // A session or reload instruction stands on its own; the rest needs to say what failed
  const standalone = response.status === 401 || /csrf/i.test(serverMessage);
  return new ApiError(standalone ? detail : `Couldn't ${action}. ${detail}`, { kind: 'http', status: response.status });
};

/**
 * The body of a successful response; a failed one throws an ApiError that says what to do.
 * @param {Response} response
 * @param {string} action - what was being done, as a verb phrase
 */
export const readJson = async (response, action) => {
  if (!response.ok) throw await apiError(response, action);
  return response.json();
};

/**
 * The message for a caught error.
 * @param {unknown} error - what was thrown
 * @param {string} action - what was being done, as a verb phrase
 */
export const describeError = (error, action) => {
  if (error instanceof ApiError) {
    return error.kind === 'http' ? error.message : `Couldn't ${action}. ${error.message}`;
  }
  // A fetch() made without apiRequest fails the same way: Chrome "Failed to fetch", Firefox "NetworkError…", Safari "Load failed"
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return `Couldn't ${action}. ${NETWORK_MESSAGE}`;
  }
  const reason = error instanceof Error && error.message ? error.message : 'Something unexpected happened.';
  return `Couldn't ${action}. ${reason}`;
};

/**
 * Make an authenticated API request with CSRF token
 * @param {string} endpoint - API endpoint (e.g., '/proxies')
 * @param {object} options - Fetch options
 * @param {string} token - JWT token
 * @param {string} csrfToken - CSRF token
 * @returns {Promise<Response>}
 */
export const apiRequest = async (endpoint, options = {}, token = null, csrfToken = null) => {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };

  const normalizedEndpoint = endpoint.startsWith('/api/')
    ? endpoint.replace(/^\/api/, '')
    : endpoint;

  // Add authorization token if provided (backward compat for API clients)
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add CSRF token for state-changing operations (fallback to persisted token)
  const method = options.method?.toUpperCase();
  const effectiveCsrfToken = csrfToken || window.sessionStorage.getItem(CSRF_STORAGE_KEY);
  if (effectiveCsrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['x-csrf-token'] = effectiveCsrfToken;
  }

  // Add request timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);

  try {
    const response = await fetch(`${API_URL}${normalizedEndpoint}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    return response;
  } catch (error) {
    if (error?.name === 'AbortError') throw new ApiError(TIMEOUT_MESSAGE, { kind: 'timeout' });
    if (error instanceof TypeError) throw new ApiError(NETWORK_MESSAGE, { kind: 'network' });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * GET request
 */
export const get = async (endpoint, token = null) => {
  return apiRequest(endpoint, { method: 'GET' }, token);
};

/**
 * POST request with CSRF protection
 */
export const post = async (endpoint, data, token = null, csrfToken = null, isFormData = false) => {
  return apiRequest(
    endpoint,
    {
      method: 'POST',
      body: isFormData ? data : JSON.stringify(data),
    },
    token,
    csrfToken
  );
};

/**
 * PUT request with CSRF protection
 */
export const put = async (endpoint, data, token = null, csrfToken = null, isFormData = false) => {
  return apiRequest(
    endpoint,
    {
      method: 'PUT',
      body: isFormData ? data : JSON.stringify(data),
    },
    token,
    csrfToken
  );
};

/**
 * DELETE request with CSRF protection
 */
export const del = async (endpoint, token = null, csrfToken = null) => {
  return apiRequest(
    endpoint,
    {
      method: 'DELETE',
    },
    token,
    csrfToken
  );
};

export default {
  apiRequest,
  apiError,
  describeError,
  get,
  post,
  put,
  del,
};
