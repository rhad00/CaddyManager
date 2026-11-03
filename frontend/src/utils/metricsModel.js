// Pure helpers for the metrics page: formatting, the verdict and the history series.
// Missing data stays null (shown as an em dash), never 0, so "not reported" and "zero" differ.

export const DASH = '—';

/** A finite number, or null */
export const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const formatCount = (value) => {
  const n = num(value);
  return n === null ? DASH : n.toLocaleString('en-US');
};

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** 1024-based sizes with their real unit names: 73400320 -> "70.0 MiB" */
export const formatBytes = (bytes) => {
  const n = num(bytes);
  if (n === null || n < 0) return DASH;
  if (n === 0) return '0 B';
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1);
  const value = n / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${UNITS[i]}`;
};

/** Seconds as the operator reads them: 0.0123 -> "12.3 ms", 1.5 -> "1.50 s" */
export const formatDuration = (seconds) => {
  const n = num(seconds);
  if (n === null || n < 0) return DASH;
  if (n >= 1) return `${n.toFixed(2)} s`;
  const ms = n * 1000;
  return `${ms >= 100 ? ms.toFixed(0) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2)} ms`;
};

export const formatPercent = (share) => {
  const n = num(share);
  if (n === null) return DASH;
  const pct = n * 100;
  if (pct === 0) return '0%';
  return `${pct < 10 ? pct.toFixed(2) : pct.toFixed(1)}%`;
};

export const STATUS_CLASSES = ['2xx', '3xx', '4xx', '5xx'];

/** Counts per status class, with null for a class the API did not report */
export function statusBreakdown(responseStatus) {
  const counts = STATUS_CLASSES.map((cls) => ({ cls, count: num(responseStatus?.[cls]) }));
  const total = counts.reduce((sum, c) => sum + (c.count ?? 0), 0);
  return counts.map((c) => ({ ...c, share: c.count === null || total === 0 ? null : c.count / total }));
}

/** The one-line answer to "is anything wrong?" */
export function verdict(metrics) {
  const status = metrics?.http?.responseStatus;
  if (!metrics || !status) {
    return { tone: 'unknown', label: 'No data', text: 'Caddy has not reported any response counts.' };
  }
  const rows = statusBreakdown(status);
  const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
  if (total === 0) {
    return { tone: 'ok', label: 'Idle', text: 'No requests since Caddy started.' };
  }
  const errors = rows.find((r) => r.cls === '5xx');
  const share = errors?.share ?? null;
  if (share === null || errors.count === 0) {
    return { tone: 'ok', label: 'Healthy', text: 'No server errors since Caddy started.' };
  }
  const text = `${formatPercent(share)} of responses were server errors (5xx) since Caddy started.`;
  if (share >= 0.05) return { tone: 'bad', label: 'Errors', text };
  if (share >= 0.01) return { tone: 'warn', label: 'Watch', text };
  return { tone: 'ok', label: 'Healthy', text };
}

const sampleValue = (entry, name) => num(entry?.metrics?.[name]?.[0]?.value);

/** History sorted by time, with the request rate between samples and memory in MiB */
export function historySeries(history) {
  const sorted = [...(Array.isArray(history) ? history : [])]
    .map((entry) => ({ entry, time: new Date(entry?.timestamp) }))
    .filter(({ time }) => !Number.isNaN(time.getTime()))
    .sort((a, b) => a.time - b.time);

  return sorted.map(({ entry, time }, i) => {
    const total = sampleValue(entry, 'caddy_http_requests_total');
    const memory = sampleValue(entry, 'process_resident_memory_bytes');
    let perMinute = null;
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevTotal = sampleValue(prev.entry, 'caddy_http_requests_total');
      const minutes = (time - prev.time) / 60000;
      // A counter that goes down means Caddy restarted: leave a gap instead of a cliff
      if (total !== null && prevTotal !== null && minutes > 0 && total >= prevTotal) {
        perMinute = (total - prevTotal) / minutes;
      }
    }
    return { time, perMinute, memoryMiB: memory === null ? null : memory / 1048576 };
  });
}

const pad = (n) => String(n).padStart(2, '0');

/** "14:05", with the day ("3 Nov 14:05") when the series spans more than one day */
export function timeLabels(points) {
  const days = new Set(points.map((p) => p.time.toDateString()));
  const multiDay = days.size > 1;
  return points.map(({ time }) => {
    const hm = `${pad(time.getHours())}:${pad(time.getMinutes())}`;
    return multiDay ? `${time.getDate()} ${time.toLocaleString('en-US', { month: 'short' })} ${hm}` : hm;
  });
}

/** "12 s ago", "3 min ago", "2 h ago" */
export function ageText(from, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export const clockTime = (time) => {
  const d = new Date(time);
  return Number.isNaN(d.getTime()) ? DASH : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
