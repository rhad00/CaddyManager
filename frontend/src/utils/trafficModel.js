// Pure helpers for the per-proxy traffic analytics: scope, rows, labels and rates.
import { timeLabels } from './metricsModel';

export const RANGES = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
];
export const DEFAULT_RANGE = '24h';
export const isRange = (value) => RANGES.some((r) => r.value === value);

/** The id the URL uses for traffic of hosts that belong to no proxy */
export const OTHER_ID = 'other';

/** What the page shows for a choice of proxy: "all proxies" (no id), one proxy, or the other hosts */
export function scopeOf(traffic, proxyId) {
  if (!traffic) return null;
  if (!proxyId) return { id: null, name: 'All proxies', domains: [], summary: traffic.totals };
  if (proxyId === OTHER_ID) {
    return traffic.other
      ? { id: OTHER_ID, name: 'Other hosts', domains: traffic.other.hosts, summary: traffic.other }
      : null;
  }
  const proxy = (traffic.proxies || []).find((p) => p.id === proxyId);
  return proxy ? { id: proxy.id, name: proxy.name, domains: proxy.domains, summary: proxy } : null;
}

/** Responses with a status class: the denominator of an error rate */
export const classified = (summary) =>
  Object.values(summary?.status || {}).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);

/** Share of responses that were 5xx, or null with nothing to divide */
export function errorShare(summary) {
  const total = classified(summary);
  return total === 0 ? null : (summary.status['5xx'] || 0) / total;
}

/** One label per bucket of the report, for the chart axis */
export function bucketLabels(traffic) {
  const count = traffic?.totals?.series?.requests?.length ?? 0;
  const points = Array.from({ length: count }, (_, i) => ({
    time: new Date((traffic.from + i * traffic.bucketSeconds) * 1000),
  }));
  return timeLabels(points);
}

/** Bytes per second averaged over each bucket, so a 1-hour and a 7-day chart read on one scale */
export const bytesPerSecond = (series, bucketSeconds) => (series?.bytes || []).map((b) => b / bucketSeconds);

/** Per-bucket average response time; empty buckets stay gaps */
export const responseTimes = (series) => (series?.avgMs || []).map((v) => (Number.isFinite(v) ? v : null));

/** Rows of the proxy table, busiest first, with each proxy's share of all requests */
export function proxyRows(traffic) {
  if (!traffic) return [];
  const total = traffic.totals?.requests || 0;
  const rows = (traffic.proxies || []).map((p) => ({
    id: p.id,
    name: p.name,
    domains: p.domains,
    disabled: p.proxyStatus === 'disabled',
    requests: p.requests,
    share: total ? p.requests / total : 0,
    errorShare: errorShare(p),
    bytes: p.bytes,
    avgMs: p.avgMs,
  }));
  if (traffic.other) {
    rows.push({
      id: OTHER_ID,
      name: 'Other hosts',
      domains: traffic.other.hosts,
      disabled: false,
      requests: traffic.other.requests,
      share: total ? traffic.other.requests / total : 0,
      errorShare: errorShare(traffic.other),
      bytes: traffic.other.bytes,
      avgMs: traffic.other.avgMs,
    });
  }
  return rows.sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));
}

export const hasTraffic = (summary) => (summary?.requests || 0) > 0;

/** "up to 250 ms": the percentile is the upper bound of a histogram bin, not an exact figure */
export const percentileText = (ms) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  return ms >= 1000 ? `up to ${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s` : `up to ${ms >= 10 ? Math.round(ms) : ms} ms`;
};
