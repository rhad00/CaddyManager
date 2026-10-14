/**
 * Validation and redaction of alert notification channels.
 */
import { checkOutboundUrl, OutboundUrlError } from './outboundRequest';

export const CHANNEL_TYPES = ['email', 'slack', 'discord', 'webhook'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

/** Channel settings are user-supplied JSON: every field is checked before use. */
type ChannelConfig = Record<string, unknown>;

const WEBHOOK_METHODS = ['POST', 'PUT', 'PATCH'];
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
// Set by the HTTP client, or able to retarget or smuggle the request
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REDACTED = '***';

/** @returns problem with the URL, or null */
function urlProblem(url: unknown, { httpsOnly = false } = {}): string | null {
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

function headersProblem(headers: unknown): string | null {
  if (headers === undefined) return null;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return 'headers must be an object';
  for (const [name, value] of Object.entries(headers)) {
    if (!HEADER_NAME.test(name) || FORBIDDEN_HEADERS.has(name.toLowerCase())) return `header "${name}" is not allowed`;
    if (typeof value !== 'string' || /[\r\n]/.test(value)) return `header "${name}" must be a single-line string`;
  }
  return null;
}

const webhookUrlProblem = (config: ChannelConfig): string | null => {
  const problem = urlProblem(config.webhook_url, { httpsOnly: true });
  return problem && `webhook_url ${problem}`;
};

const VALIDATORS: Record<ChannelType, (config: ChannelConfig) => string | null> = {
  email: (config) => {
    const recipients = String(config.to || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0 || !recipients.every((r) => EMAIL.test(r))) return 'email channel needs a valid "to" address';
    if (config.from !== undefined && !EMAIL.test(String(config.from))) return '"from" is not a valid address';
    return null;
  },
  slack: webhookUrlProblem,
  discord: webhookUrlProblem,
  webhook: (config) => {
    const problem = urlProblem(config.url);
    if (problem) return `url ${problem}`;
    const method = String(config.method || 'POST').toUpperCase();
    if (!WEBHOOK_METHODS.includes(method)) return `method must be one of: ${WEBHOOK_METHODS.join(', ')}`;
    return headersProblem(config.headers);
  },
};

const isChannelType = (type: unknown): type is ChannelType =>
  (CHANNEL_TYPES as readonly unknown[]).includes(type);

/** @returns a user-facing problem, or null when the channel is usable */
export function channelProblem(type: unknown, config: unknown): string | null {
  if (!isChannelType(type)) return `type must be one of: ${CHANNEL_TYPES.join(', ')}`;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'config must be an object';
  return VALIDATORS[type](config as ChannelConfig);
}

/**
 * Channel as listed by the API: URLs (which often embed tokens) and header values are hidden.
 * @param channel - plain object
 */
export function redactChannel<T extends { config?: ChannelConfig | null }>(
  channel: T,
): Omit<T, 'config'> & { config: ChannelConfig } {
  const config: ChannelConfig = { ...(channel.config || {}) };
  if (config.webhook_url) config.webhook_url = REDACTED;
  if (config.url) config.url = REDACTED;
  if (config.headers && typeof config.headers === 'object') {
    config.headers = Object.fromEntries(Object.keys(config.headers).map((name) => [name, REDACTED]));
  }
  return { ...channel, config };
}
