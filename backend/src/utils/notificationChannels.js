/**
 * Validation and redaction of alert notification channels.
 */
const { checkOutboundUrl, OutboundUrlError } = require('./outboundRequest');

const CHANNEL_TYPES = ['email', 'slack', 'discord', 'webhook'];
const WEBHOOK_METHODS = ['POST', 'PUT', 'PATCH'];
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
// Set by the HTTP client, or able to retarget or smuggle the request
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REDACTED = '***';

/** @returns {string|null} problem with the URL, or null */
function urlProblem(url, { httpsOnly = false } = {}) {
  if (typeof url !== 'string' || url === '') return 'is required';
  try {
    const parsed = checkOutboundUrl(url);
    if (httpsOnly && parsed.protocol !== 'https:') return 'must use https';
  } catch (error) {
    if (error instanceof OutboundUrlError) return error.message;
    throw error;
  }
  return null;
}

function headersProblem(headers) {
  if (headers === undefined) return null;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return 'headers must be an object';
  for (const [name, value] of Object.entries(headers)) {
    if (!HEADER_NAME.test(name) || FORBIDDEN_HEADERS.has(name.toLowerCase())) return `header "${name}" is not allowed`;
    if (typeof value !== 'string' || /[\r\n]/.test(value)) return `header "${name}" must be a single-line string`;
  }
  return null;
}

const VALIDATORS = {
  email: (config) => {
    const recipients = String(config.to || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0 || !recipients.every((r) => EMAIL.test(r))) return 'email channel needs a valid "to" address';
    if (config.from !== undefined && !EMAIL.test(String(config.from))) return '"from" is not a valid address';
    return null;
  },
  slack: (config) => {
    const p = urlProblem(config.webhook_url, { httpsOnly: true });
    return p && `webhook_url ${p}`;
  },
  discord: (config) => {
    const p = urlProblem(config.webhook_url, { httpsOnly: true });
    return p && `webhook_url ${p}`;
  },
  webhook: (config) => {
    const p = urlProblem(config.url);
    if (p) return `url ${p}`;
    const method = String(config.method || 'POST').toUpperCase();
    if (!WEBHOOK_METHODS.includes(method)) return `method must be one of: ${WEBHOOK_METHODS.join(', ')}`;
    return headersProblem(config.headers);
  },
};

/**
 * @param {string} type
 * @param {Object} config
 * @returns {string|null} a user-facing problem, or null when the channel is usable
 */
function channelProblem(type, config) {
  if (!CHANNEL_TYPES.includes(type)) return `type must be one of: ${CHANNEL_TYPES.join(', ')}`;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'config must be an object';
  return VALIDATORS[type](config);
}

/**
 * Channel as listed by the API: URLs (which often embed tokens) and header values are hidden.
 * @param {Object} channel - plain object
 */
function redactChannel(channel) {
  const config = { ...(channel.config || {}) };
  if (config.webhook_url) config.webhook_url = REDACTED;
  if (config.url) config.url = REDACTED;
  if (config.headers && typeof config.headers === 'object') {
    config.headers = Object.fromEntries(Object.keys(config.headers).map((name) => [name, REDACTED]));
  }
  return { ...channel, config };
}

module.exports = { CHANNEL_TYPES, channelProblem, redactChannel };
