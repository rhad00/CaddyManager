// Pure helpers for the certificate timeline: wording, urgency and the bar length.

/** The bar spans a typical ACME lifetime; a longer certificate simply fills it */
export const SCALE_DAYS = 90;
export const WARN_DAYS = 30;
export const URGENT_DAYS = 7;

const DATE = { day: 'numeric', month: 'short', year: 'numeric' };
export const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', DATE) : null);

/** `tone` is one of ok, warn, urgent, none; the wording always carries the meaning, colour only repeats it */
export function describeCertificate(row) {
  switch (row.state) {
    case 'expired': {
      const days = Math.abs(row.daysLeft);
      return { tone: 'urgent', fraction: 0, text: `Expired ${days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} ago`}` };
    }
    case 'failed':
      return { tone: 'urgent', fraction: 0, text: `Check failed: ${row.error ?? 'no reason given'}` };
    case 'valid': {
      const days = row.daysLeft;
      const tone = days < URGENT_DAYS ? 'urgent' : days < WARN_DAYS ? 'warn' : 'ok';
      const text = days === 0 ? 'Ends today' : `${days} ${days === 1 ? 'day' : 'days'} left`;
      return { tone, fraction: Math.min(1, days / SCALE_DAYS), text };
    }
    case 'not_used':
      return { tone: 'none', fraction: 0, text: 'This proxy does not use TLS' };
    default:
      return { tone: 'none', fraction: 0, text: 'Not checked yet' };
  }
}

/** How many certificates need attention: expired, failed, or ending within the warning window */
export const needAttention = (rows) =>
  rows.filter((r) => r.state === 'expired' || r.state === 'failed' || (r.state === 'valid' && r.daysLeft < WARN_DAYS)).length;

/** The oldest stored check among the rows, which is how stale the page may be */
export function oldestCheck(rows) {
  const times = rows.filter((r) => r.state !== 'not_used').map((r) => (r.checkedAt ? new Date(r.checkedAt).getTime() : null));
  if (times.length === 0 || times.includes(null)) return null;
  return Math.min(...times);
}
