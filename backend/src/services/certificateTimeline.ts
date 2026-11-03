import type { Proxy, TlsStatus } from '../models/proxy';

export type CertificateState = 'valid' | 'expired' | 'failed' | 'unchecked' | 'not_used';

export interface CertificateRow {
  proxyId: string;
  proxyName: string;
  domain: string;
  state: CertificateState;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  /** Whole days, negative once expired; null without a known expiry */
  daysLeft: number | null;
  error: string | null;
  /** When the stored result was taken; it is only refreshed on save or a manual recheck */
  checkedAt: string | null;
}

type ProxyLike = Pick<Proxy, 'id' | 'name' | 'domains' | 'ssl_type' | 'tls_status' | 'tls_checked_at'>;

const DAY_MS = 86_400_000;

const toIso = (value: unknown): string | null => {
  if (!value) return null;
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const ORDER: Record<CertificateState, number> = { expired: 0, failed: 1, valid: 2, unchecked: 3, not_used: 4 };

/** One row per domain of every proxy: when its certificate ends, soonest first. Reads stored results only. */
export function certificateTimeline(proxies: ProxyLike[], nowMs: number = Date.now()): CertificateRow[] {
  const rows: CertificateRow[] = [];

  for (const proxy of proxies) {
    const domains = Array.isArray(proxy.domains) ? proxy.domains : [];
    const status: TlsStatus | null = proxy.tls_status ?? null;
    const checkedAt = toIso(proxy.tls_checked_at);

    for (const domain of domains) {
      const base = { proxyId: proxy.id, proxyName: proxy.name, domain, checkedAt };
      const empty = { issuer: null, validFrom: null, validTo: null, daysLeft: null, error: null };

      if (proxy.ssl_type === 'none') {
        rows.push({ ...base, ...empty, state: 'not_used' });
        continue;
      }
      const result = status?.results?.find((r) => r.domain === domain);
      if (!result) {
        rows.push({ ...base, ...empty, state: 'unchecked', error: status?.error ?? null });
        continue;
      }
      const validTo = toIso(result.validTo);
      const daysLeft = validTo ? Math.floor((new Date(validTo).getTime() - nowMs) / DAY_MS) : null;
      const common = { ...base, issuer: result.issuer ?? null, validFrom: toIso(result.validFrom), validTo, daysLeft };

      if (!result.ok) {
        rows.push({ ...common, state: 'failed', error: result.error ?? 'The TLS check failed.' });
      } else if (daysLeft === null) {
        rows.push({ ...common, state: 'unchecked', error: null });
      } else {
        rows.push({ ...common, state: daysLeft < 0 ? 'expired' : 'valid', error: null });
      }
    }
  }

  return rows.sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] ||
      (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
      a.domain.localeCompare(b.domain),
  );
}
