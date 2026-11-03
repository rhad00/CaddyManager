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

const rangeName = (range) => RANGES.find((r) => r.value === range)?.label ?? range;

/** "+12% vs previous 24 hours"; null when there is no period before to compare with */
export function changeText(current, previous, range) {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  const label = `previous ${rangeName(range)}`;
  if (previous === 0) return current === 0 ? `No change vs ${label}` : `None in the ${label}`;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return `No change vs ${label}`;
  const rounded = Math.round(Math.abs(pct)).toLocaleString('en-US');
  return `${pct > 0 ? '+' : '-'}${rounded}% vs ${label}`;
}

/** Change of a share (like the error rate) in percentage points, since a percent of a percent misleads */
export function pointsChange(current, previous, range) {
  if (![current, previous].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const points = (current - previous) * 100;
  if (Math.abs(points) < 0.05) return `No change vs previous ${rangeName(range)}`;
  return `${points > 0 ? '+' : '-'}${Math.abs(points).toFixed(1)} points vs previous ${rangeName(range)}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Hourly counts as a grid of local days by local hours, so a busy 14:00 is 14:00 where the viewer is
 * and not in the server's time zone. `cells[hour]` is null where the data does not reach.
 */
export function heatmap(detail) {
  if (!detail || !Array.isArray(detail.hourly) || detail.hourly.length === 0) return { days: [], max: 0, busiest: null };
  const days = [];
  const byKey = new Map();
  let max = 0;
  let busiest = null;

  detail.hourly.forEach((count, i) => {
    const time = new Date((detail.hourlyFrom + i * 3600) * 1000);
    const key = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}`;
    let day = byKey.get(key);
    if (!day) {
      day = { key, label: `${DAY_NAMES[time.getDay()]} ${time.getDate()}`, cells: new Array(24).fill(null) };
      byKey.set(key, day);
      days.push(day);
    }
    const hour = time.getHours();
    day.cells[hour] = { count, hour };
    if (count > max) {
      max = count;
      busiest = { count, hour, day: day.label };
    }
  });
  return { days, max, busiest };
}

export const hasTraffic = (summary) => (summary?.requests || 0) > 0;

/** "up to 250 ms": the percentile is the upper bound of a histogram bin, not an exact figure */
export const percentileText = (ms) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  return ms >= 1000 ? `up to ${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s` : `up to ${ms >= 10 ? Math.round(ms) : ms} ms`;
};
