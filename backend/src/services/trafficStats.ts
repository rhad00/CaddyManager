/**
 * Per-host traffic from the Caddy access log, for the error_rate and no_traffic alerts.
 */
import fs from 'fs';
import readline from 'readline';
import { parseLine, LOG_FILE } from './logService';

export interface HostTraffic {
  total: number;
  errors: number;
}

export interface TrafficSince {
  available: boolean;
  /** false when the log starts after the window (new or rotated log) */
  coversWindow: boolean;
  byHost: Map<string, HostTraffic>;
}

/** "App.Example.com:443" -> "app.example.com" */
const normalizeHost = (host: string): string => String(host).toLowerCase().replace(/:\d+$/, '');

/**
 * Count requests and server errors (5xx) per host since `sinceTs`.
 * `coversWindow` is false when the log starts after `sinceTs` (new or rotated log), so
 * the absence of traffic in it means nothing.
 * @param sinceTs - unix seconds
 * @param file - access log path
 */
export async function hostTrafficSince(sinceTs: number, file: string = LOG_FILE): Promise<TrafficSince> {
  const byHost = new Map<string, HostTraffic>();
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
      errors: stats.errors + (entry.status !== undefined && entry.status >= 500 ? 1 : 0),
    });
  }

  return { available: true, coversWindow: earliestTs <= sinceTs, byHost };
}

/**
 * Sum the traffic of several domains.
 * @param stats - result of hostTrafficSince
 */
export function trafficForDomains(stats: Pick<TrafficSince, 'byHost'>, domains: string[]): HostTraffic {
  return domains.reduce((sum, domain) => {
    const s = stats.byHost.get(normalizeHost(domain)) || { total: 0, errors: 0 };
    return { total: sum.total + s.total, errors: sum.errors + s.errors };
  }, { total: 0, errors: 0 });
}
