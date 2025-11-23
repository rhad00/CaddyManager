/**
 * API utility functions for making authenticated requests with CSRF protection
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Make an authenticated API request with CSRF token
 * @param {string} endpoint - API endpoint (e.g., '/api/proxies')
 * @param {object} options - Fetch options
 * @param {string} token - JWT token
 * @param {string} csrfToken - CSRF token
 * @returns {Promise<Response>}
 */
export const apiRequest = async (endpoint, options = {}, token = null, csrfToken = null) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add authorization token if provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add CSRF token for state-changing operations
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase())) {
    headers['CSRF-Token'] = csrfToken;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  return response;
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
export const post = async (endpoint, data, token = null, csrfToken = null) => {
  return apiRequest(
    endpoint,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
    csrfToken
  );
};

/**
 * PUT request with CSRF protection
 */
export const put = async (endpoint, data, token = null, csrfToken = null) => {
  return apiRequest(
    endpoint,
    {
      method: 'PUT',
      body: JSON.stringify(data),
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
  get,
  post,
  put,
  del,
};
