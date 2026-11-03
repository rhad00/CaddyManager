// Pure helpers for showing alert events on the traffic charts.

const CONDITIONS = {
  cert_expiry: 'Certificate expiry',
  upstream_down: 'Upstream down',
  error_rate: 'Error rate',
  no_traffic: 'No traffic',
};
export const conditionLabel = (type) => CONDITIONS[type] ?? type;

/** How many days of events cover a traffic range */
export const daysForRange = (range) => (range === '7d' ? 7 : 1);

/**
 * Events inside the chart window, each with the step it falls in. Several events in one step
 * share one marker, so the chart is not crowded by a rule that keeps firing.
 */
export function alertMarkers(events, { from, bucketSeconds, count }) {
  const byIndex = new Map();
  for (const e of events || []) {
    const ts = new Date(e.firedAt).getTime() / 1000;
    if (!Number.isFinite(ts) || ts < from) continue;
    const index = Math.floor((ts - from) / bucketSeconds);
    if (index >= count) continue;
    if (!byIndex.has(index)) byIndex.set(index, []);
    byIndex.get(index).push(e);
  }
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([index, list]) => ({ index, events: list }));
}

/** The events of a window, newest first, with the steps they fall in (for a plain list) */
export const inWindow = (events, { from, to }) =>
  (events || [])
    .filter((e) => {
      const ts = new Date(e.firedAt).getTime() / 1000;
      return ts >= from && ts <= to;
    })
    .sort((a, b) => new Date(b.firedAt) - new Date(a.firedAt));
