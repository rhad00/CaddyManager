/**
 * Per-host traffic from the Caddy access log, for the error_rate and no_traffic alerts.
 */
const fs = require('fs');
const readline = require('readline');
const { parseLine, LOG_FILE } = require('./logService');

/** "App.Example.com:443" -> "app.example.com" */
const normalizeHost = (host) => String(host).toLowerCase().replace(/:\d+$/, '');

/**
 * Count requests and server errors (5xx) per host since `sinceTs`.
 * @param {number} sinceTs - unix seconds
 * @param {string} [file] - access log path
 * @returns {Promise<{available: boolean, coversWindow: boolean, byHost: Map<string, {total: number, errors: number}>}>}
 *   `coversWindow` is false when the log starts after `sinceTs` (new or rotated log), so
 *   the absence of traffic in it means nothing.
 */
async function hostTrafficSince(sinceTs, file = LOG_FILE) {
  const byHost = new Map();
  if (!fs.existsSync(file)) {
    return { available: false, coversWindow: false, byHost };
  }

  let earliestTs = Infinity;
  const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    const entry = parseLine(line);
    if (!entry || !entry.host) continue;
    earliestTs = Math.min(earliestTs, entry.ts);
    if (entry.ts < sinceTs) continue;

    const host = normalizeHost(entry.host);
    const stats = byHost.get(host) || { total: 0, errors: 0 };
    byHost.set(host, {
      total: stats.total + 1,
      errors: stats.errors + (entry.status >= 500 ? 1 : 0),
    });
  }

  return { available: true, coversWindow: earliestTs <= sinceTs, byHost };
}

/**
 * Sum the traffic of several domains.
 * @param {{byHost: Map}} stats - result of hostTrafficSince
 * @param {string[]} domains
 * @returns {{total: number, errors: number}}
 */
function trafficForDomains(stats, domains) {
  return domains.reduce((sum, domain) => {
    const s = stats.byHost.get(normalizeHost(domain)) || { total: 0, errors: 0 };
    return { total: sum.total + s.total, errors: sum.errors + s.errors };
  }, { total: 0, errors: 0 });
}

module.exports = { hostTrafficSince, trafficForDomains };
