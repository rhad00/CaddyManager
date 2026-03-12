const axios = require('axios');
const nodemailer = require('nodemailer');

let AlertRule, NotificationChannel, Proxy;

/**
 * Lazy-load models to avoid circular require issues at startup.
 */
function getModels() {
  if (!AlertRule) {
    AlertRule = require('../models/alertRule');
    NotificationChannel = require('../models/notificationChannel');
    Proxy = require('../models/proxy');
  }
  return { AlertRule, NotificationChannel, Proxy };
}

// Track which proxies have active cert alerts in this process to avoid spam
// Key: `${ruleId}::${proxyId}`, Value: ISO timestamp of last notification
const notifiedAt = new Map();

/**
 * Evaluate all enabled alert rules and dispatch notifications if conditions are met.
 */
async function runAlertChecks() {
  try {
    const { AlertRule: AR, NotificationChannel: NC, Proxy: P } = getModels();

    const rules = await AR.findAll({ where: { enabled: true } });
    const proxies = await P.findAll();

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

        const triggered = await checkCondition(rule, proxy);
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
    console.error('[AlertService] runAlertChecks error:', err.message);
  }
}

/**
 * Check whether a specific rule condition is met for a proxy.
 * Returns a details object if triggered, null otherwise.
 */
async function checkCondition(rule, proxy) {
  switch (rule.condition_type) {
    case 'cert_expiry': {
      if (!proxy.tls_status || !proxy.tls_status.results) return null;
      const threshold = rule.threshold ?? 14; // days
      for (const r of proxy.tls_status.results) {
        if (!r.ok || !r.validTo) continue;
        const expiresIn = (new Date(r.validTo) - Date.now()) / (1000 * 60 * 60 * 24);
        if (expiresIn < threshold) {
          return { domain: r.domain, expiresIn: expiresIn.toFixed(1), validTo: r.validTo };
        }
      }
      return null;
    }

    case 'upstream_down': {
      if (!proxy.tls_status) return null;
      // Consider upstream "down" if last TLS check failed overall
      if (!proxy.tls_status.ok) {
        return { reason: 'TLS health check reported failure' };
      }
      return null;
    }

    // Future implementations (require log data)
    case 'error_rate':
    case 'no_traffic':
      return null;

    default:
      return null;
  }
}

function buildSubject(rule, proxy) {
  const domains = Array.isArray(proxy.domains) ? proxy.domains.join(', ') : proxy.domains;
  const typeLabels = {
    cert_expiry: 'Certificate Expiry Warning',
    upstream_down: 'Upstream Health Check Failed',
    error_rate: 'High Error Rate',
    no_traffic: 'No Traffic Detected',
  };
  return `[CaddyManager Alert] ${typeLabels[rule.condition_type] || rule.condition_type}: ${proxy.name} (${domains})`;
}

function buildBody(rule, proxy, details) {
  const domains = Array.isArray(proxy.domains) ? proxy.domains.join(', ') : proxy.domains;
  const time = new Date().toUTCString();

  let detail = '';
  if (rule.condition_type === 'cert_expiry') {
    detail = `Domain "${details.domain}" certificate expires in ${details.expiresIn} days (${details.validTo}).`;
  } else if (rule.condition_type === 'upstream_down') {
    detail = `Upstream health check failure: ${details.reason}`;
  }

  return `CaddyManager Alert — ${time}\n\nRule: ${rule.name}\nProxy: ${proxy.name}\nDomains: ${domains}\n\n${detail}\n\nLog in to CaddyManager to investigate.`;
}

/**
 * Dispatch notifications to all channels associated with a rule.
 */
async function dispatchNotifications(rule, subject, body, NC) {
  const channelIds = Array.isArray(rule.channel_ids) ? rule.channel_ids : [];
  if (channelIds.length === 0) return;

  const channels = await NC.findAll({ where: { id: channelIds, enabled: true } });

  for (const channel of channels) {
    try {
      await sendToChannel(channel, subject, body);
    } catch (err) {
      console.error(`[AlertService] Failed to send to channel ${channel.id} (${channel.type}):`, err.message);
    }
  }
}

async function sendToChannel(channel, subject, body) {
  switch (channel.type) {
    case 'email': {
      if (!process.env.SMTP_HOST) {
        console.warn('[AlertService] SMTP_HOST not configured — skipping email alert');
        return;
      }
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        } : undefined,
      });
      await transporter.sendMail({
        from: channel.config.from || process.env.SMTP_FROM || 'noreply@caddymanager.local',
        to: channel.config.to,
        subject,
        text: body,
      });
      break;
    }

    case 'slack': {
      await axios.post(channel.config.webhook_url, {
        text: `*${subject}*\n\`\`\`${body}\`\`\``,
      });
      break;
    }

    case 'discord': {
      await axios.post(channel.config.webhook_url, {
        embeds: [{
          title: subject,
          description: body,
          color: 0xFF4444,
        }],
      });
      break;
    }

    case 'webhook': {
      const method = (channel.config.method || 'POST').toUpperCase();
      await axios({
        method,
        url: channel.config.url,
        headers: channel.config.headers || {},
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
function startAlertScheduler(intervalMinutes = 15) {
  console.log(`[AlertService] Starting alert scheduler (every ${intervalMinutes} min)`);
  const ms = intervalMinutes * 60 * 1000;
  setInterval(runAlertChecks, ms);
  // Also run immediately on startup (after a short delay)
  setTimeout(runAlertChecks, 10000);
}

module.exports = { startAlertScheduler, runAlertChecks, sendToChannel };
