// Pure helpers for the long-term traffic history: day labels and unknown days.

export const HISTORY_RANGES = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];
export const DEFAULT_HISTORY_RANGE = '30d';

const DAY = 86400;

/** "3 Nov" for each UTC day of the report, matching how the server cuts the days */
export function dayLabels(history) {
  const count = history?.series?.requests?.length ?? 0;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date((history.from + i * DAY) * 1000);
    return `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
  });
}

/** Days that end before the first stored hour are unknown, not zero: they become gaps */
export function withGaps(values, history) {
  const covered = history?.coveredFrom;
  return (values || []).map((v, i) => {
    if (covered === null || covered === undefined) return null;
    return history.from + (i + 1) * DAY <= covered ? null : v;
  });
}

/** How many days of the range the stored data reaches back, or null with none */
export function coveredDays(history) {
  if (history?.coveredFrom === null || history?.coveredFrom === undefined) return null;
  const days = history.series.requests.length;
  const startIndex = Math.max(0, Math.floor((history.coveredFrom - history.from) / DAY));
  return days - startIndex;
}

export const bytesPerDay = (history) => withGaps(history?.series?.bytes, history);
export const avgTimes = (history) => withGaps((history?.series?.avgMs || []).map((v) => (Number.isFinite(v) ? v : null)), history);
