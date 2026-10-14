import nodemailer from 'nodemailer';
import { sendOutbound } from '../utils/outboundRequest';
import { channelProblem } from '../utils/notificationChannels';
import { hostTrafficSince, trafficForDomains, type TrafficSince } from './trafficStats';
import { caddyService } from './caddyService';
import { unreachableUpstreams } from '../utils/upstreamProbe';
import type { AlertRule } from '../models/alertRule';
import type { NotificationChannel } from '../models/notificationChannel';
import type { Proxy, TlsStatus } from '../models/proxy';

// error_rate looks at the last 15 minutes and needs enough requests to mean something
const ERROR_RATE_WINDOW_MINUTES = 15;
const ERROR_RATE_MIN_REQUESTS = 20;
// cert_expiry refreshes a TLS status older than this before judging it
const TLS_STATUS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const TLS_CHECK_TIMEOUT_MS = 10000;

/** What a rule found, by condition type (see DETAIL_TEXT for how each is worded) */
export type AlertDetails =
  | { domain: string; expiresIn: string; validTo: string }
  | { unreachable: string[] }
  | { rate: string; errors: number; total: number; windowMinutes: number }
  | { minutes: number };

type Models = {
  AlertRule: typeof AlertRule;
  NotificationChannel: typeof NotificationChannel;
  Proxy: typeof Proxy;
};

let models: Models | undefined;

/**
 * Lazy-load models to avoid circular require issues at startup.
 */
function getModels(): Models {
  if (!models) {
    models = {
      AlertRule: require('../models/alertRule').AlertRule,
      NotificationChannel: require('../models/notificationChannel').NotificationChannel,
      Proxy: require('../models/proxy').Proxy,
    };
  }
  return models;
}

// Track which proxies have active cert alerts in this process to avoid spam
// Key: `${ruleId}::${proxyId}`, Value: ISO timestamp of last notification
const notifiedAt = new Map<string, string>();

export interface RunContext {
  /** Traffic of the last `windowMinutes`; the access log is read at most once per window */
  traffic(windowMinutes: number): Promise<TrafficSince>;
}

/**
 * Shared state for one evaluation run: the access log is read at most once per window.
 */
export function createRunContext(): RunContext {
  const trafficByWindow = new Map<number, Promise<TrafficSince>>();
  return {
    traffic(windowMinutes) {
      let traffic = trafficByWindow.get(windowMinutes);
      if (!traffic) {
        const sinceTs = Date.now() / 1000 - windowMinutes * 60;
        traffic = hostTrafficSince(sinceTs);
        trafficByWindow.set(windowMinutes, traffic);
      }
      return traffic;
    },
  };
}

/**
 * Evaluate all enabled alert rules and dispatch notifications if conditions are met.
 */
export async function runAlertChecks(): Promise<void> {
  try {
    const { AlertRule: AR, NotificationChannel: NC, Proxy: P } = getModels();

    const rules = await AR.findAll({ where: { enabled: true } });
    // Disabled proxies are not in Caddy; nothing about them can be "down"
    const proxies = await P.findAll({ where: { status: 'active' } });
    const ctx = createRunContext();

    for (const rule of rules) {
      const ruleProxies = rule.proxy_id
        ? proxies.filter(p => p.id === rule.proxy_id)
        : proxies;

      for (const proxy of ruleProxies) {
        const key = `${rule.id}::${proxy.id}`;
        const lastFired = notifiedAt.get(key);
        const cooldownMs = (rule.cooldown_minutes || 60) * 60 * 1000;

        if (lastFired && Date.now() - new Date(lastFired).getTime() < cooldownMs) {
          continue; // still in cooldown
        }

        const triggered = await checkCondition(rule, proxy, ctx);
        if (!triggered) continue;

        const subject = buildSubject(rule, proxy);
        const body = buildBody(rule, proxy, triggered);

        await dispatchNotifications(rule, subject, body, NC);
        notifiedAt.set(key, new Date().toISOString());

        // Update last_triggered_at in DB
        await rule.update({ last_triggered_at: new Date() });
      }
    }
  } catch (err) {
    console.error('[AlertService] runAlertChecks error:', err instanceof Error ? err.message : err);
  }
}

const proxyDomains = (proxy: Pick<Proxy, 'domains'>): string[] => (
  Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains]
);

/**
 * TLS status is only written when a proxy is saved or rechecked by hand; refresh it when
 * it is older than TLS_STATUS_MAX_AGE_MS so expiry alerts do not judge months-old data.
 */
async function freshTlsStatus(proxy: Proxy): Promise<TlsStatus> {
  const checkedAt = proxy.tls_checked_at ? new Date(proxy.tls_checked_at).getTime() : 0;
  if (proxy.tls_status && Date.now() - checkedAt < TLS_STATUS_MAX_AGE_MS) {
    return proxy.tls_status;
  }
  const tlsStatus: TlsStatus = await caddyService.verifyTlsForDomains(proxyDomains(proxy), TLS_CHECK_TIMEOUT_MS);
  await proxy.update({ tls_status: tlsStatus, tls_checked_at: new Date() });
  return tlsStatus;
}

/**
 * Check whether a specific rule condition is met for a proxy.
 * Returns a details object if triggered, null otherwise.
 * Thresholds: cert_expiry → days, error_rate → percent, no_traffic → minutes.
 */
export async function checkCondition(
  rule: Pick<AlertRule, 'condition_type' | 'threshold'>,
  proxy: Proxy,
  ctx: RunContext,
): Promise<AlertDetails | null> {
  switch (rule.condition_type) {
    case 'cert_expiry': {
      if (proxy.ssl_type === 'none') return null;
      const tlsStatus = await freshTlsStatus(proxy);
      const threshold = rule.threshold ?? 14; // days
      for (const r of tlsStatus?.results || []) {
        if (!r.ok || !r.validTo) continue;
        const expiresIn = (new Date(r.validTo).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (expiresIn < threshold) {
          return { domain: r.domain, expiresIn: expiresIn.toFixed(1), validTo: r.validTo };
        }
      }
      return null;
    }

    case 'upstream_down': {
      const unreachable = await unreachableUpstreams(proxy);
      return unreachable.length > 0 ? { unreachable } : null;
    }

    case 'error_rate': {
      const stats = await ctx.traffic(ERROR_RATE_WINDOW_MINUTES);
      const { total, errors } = trafficForDomains(stats, proxyDomains(proxy));
      if (total < ERROR_RATE_MIN_REQUESTS) return null; // too few requests to judge
      const rate = (errors / total) * 100;
      const threshold = rule.threshold ?? 5; // percent
      return rate > threshold
        ? { rate: rate.toFixed(1), errors, total, windowMinutes: ERROR_RATE_WINDOW_MINUTES }
        : null;
    }

    case 'no_traffic': {
      const minutes = rule.threshold ?? 60;
      // A proxy younger than the window cannot have been silent for all of it
      if (proxy.createdAt && Date.now() - new Date(proxy.createdAt).getTime() < minutes * 60 * 1000) {
        return null;
      }
      const stats = await ctx.traffic(minutes);
      if (!stats.coversWindow) return null; // new or rotated log: silence means nothing
      const { total } = trafficForDomains(stats, proxyDomains(proxy));
      return total === 0 ? { minutes } : null;
    }

    default:
      return null;
  }
}

function buildSubject(rule: Pick<AlertRule, 'condition_type'>, proxy: Proxy): string {
  const domains = Array.isArray(proxy.domains) ? proxy.domains.join(', ') : proxy.domains;
  const typeLabels: Record<string, string> = {
    cert_expiry: 'Certificate Expiry Warning',
    upstream_down: 'Upstream Unreachable',
    error_rate: 'High Error Rate',
    no_traffic: 'No Traffic Detected',
  };
  return `[CaddyManager Alert] ${typeLabels[rule.condition_type] || rule.condition_type}: ${proxy.name} (${domains})`;
}

// Each wording reads the details its own condition type produces (see checkCondition)
const DETAIL_TEXT: Record<string, (details: never) => string> = {
  cert_expiry: (d: Extract<AlertDetails, { domain: string }>) => `Domain "${d.domain}" certificate expires in ${d.expiresIn} days (${d.validTo}).`,
  upstream_down: (d: Extract<AlertDetails, { unreachable: string[] }>) => `Upstream(s) not accepting connections: ${d.unreachable.join(', ')}.`,
  error_rate: (d: Extract<AlertDetails, { rate: string }>) => `${d.rate}% of requests (${d.errors} of ${d.total}) returned a 5xx error in the last ${d.windowMinutes} minutes.`,
  no_traffic: (d: Extract<AlertDetails, { minutes: number }>) => `No requests in the last ${d.minutes} minutes.`,
};

function buildBody(rule: Pick<AlertRule, 'condition_type' | 'name'>, proxy: Proxy, details: AlertDetails): string {
  const domains = Array.isArray(proxy.domains) ? proxy.domains.join(', ') : proxy.domains;
  const time = new Date().toUTCString();
  const describe = DETAIL_TEXT[rule.condition_type];
  const detail = describe ? describe(details as never) : '';

  return `CaddyManager Alert — ${time}\n\nRule: ${rule.name}\nProxy: ${proxy.name}\nDomains: ${domains}\n\n${detail}\n\nLog in to CaddyManager to investigate.`;
}

/**
 * Dispatch notifications to all channels associated with a rule.
 */
async function dispatchNotifications(
  rule: Pick<AlertRule, 'channel_ids'>,
  subject: string,
  body: string,
  NC: typeof NotificationChannel,
): Promise<void> {
  const channelIds = Array.isArray(rule.channel_ids) ? rule.channel_ids : [];
  if (channelIds.length === 0) return;

  const channels = await NC.findAll({ where: { id: channelIds, enabled: true } });

  for (const channel of channels) {
    try {
      await sendToChannel(channel, subject, body);
    } catch (err) {
      console.error(`[AlertService] Failed to send to channel ${channel.id} (${channel.type}):`, err instanceof Error ? err.message : err);
    }
  }
}

/** Channel settings, as validated by channelProblem (see utils/notificationChannels) */
interface ChannelSettings {
  from?: string;
  to?: string;
  webhook_url: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

export async function sendToChannel(
  channel: Pick<NotificationChannel, 'id' | 'type' | 'config'>,
  subject: string,
  body: string,
): Promise<void> {
  // Channels saved before validation existed are checked again before anything is sent
  const problem = channelProblem(channel.type, channel.config);
  if (problem) {
    throw new Error(`Channel ${channel.id} is not usable: ${problem}`);
  }
  const config = channel.config as unknown as ChannelSettings;

  switch (channel.type) {
    case 'email': {
      if (!process.env.SMTP_HOST) {
        console.warn('[AlertService] SMTP_HOST not configured — skipping email alert');
        return;
      }
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '', 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        } : undefined,
      });
      await transporter.sendMail({
        from: config.from || process.env.SMTP_FROM || 'noreply@caddymanager.local',
        to: config.to,
        subject,
        text: body,
      });
      break;
    }

    case 'slack': {
      await sendOutbound({
        url: config.webhook_url,
        data: { text: `*${subject}*\n\`\`\`${body}\`\`\`` },
      });
      break;
    }

    case 'discord': {
      await sendOutbound({
        url: config.webhook_url,
        data: {
          embeds: [{
            title: subject,
            description: body,
            color: 0xFF4444,
          }],
        },
      });
      break;
    }

    case 'webhook': {
      await sendOutbound({
        method: (config.method || 'POST').toUpperCase(),
        url: config.url,
        headers: config.headers || {},
        data: { subject, body, timestamp: new Date().toISOString() },
      });
      break;
    }

    default:
      console.warn('[AlertService] Unknown channel type:', channel.type);
  }
}

/**
 * Start scheduled alert checks every `intervalMinutes` minutes.
 */
export function startAlertScheduler(intervalMinutes = 15): void {
  console.log(`[AlertService] Starting alert scheduler (every ${intervalMinutes} min)`);
  const ms = intervalMinutes * 60 * 1000;
  setInterval(runAlertChecks, ms);
  // Also run immediately on startup (after a short delay)
  setTimeout(runAlertChecks, 10000);
}
