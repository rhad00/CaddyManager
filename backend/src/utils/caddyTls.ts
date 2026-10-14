/**
 * Custom (uploaded / self-signed) certificates in Caddy's JSON config.
 *
 * Caddy has no admin endpoint for loading a single certificate; certificates are part
 * of the config under apps.tls.certificates.load_pem. CaddyManager owns the entries it
 * tags with MANAGED_TAG and re-adds them from the database whenever it loads a config.
 *
 * Those entries carry private keys, so every copy of the config that leaves Caddy
 * (backup file, backup archive, Git export) must go through withoutCustomCertificates.
 */

export const MANAGED_TAG = 'caddymanager';

interface LoadPemEntry {
  certificate?: string;
  key?: string;
  tags?: string[];
  [extra: string]: unknown;
}

export interface TlsApp {
  certificates?: { load_pem?: LoadPemEntry[]; [extra: string]: unknown };
  [extra: string]: unknown;
}

/** The parts of Caddy's JSON config this module touches; everything else passes through. */
export interface CaddyConfig {
  apps?: { tls?: TlsApp; [app: string]: unknown };
  [extra: string]: unknown;
}

export interface StoredCertificate {
  id: number | string;
  certificate_pem: string;
  private_key_pem: string;
}

const isManaged = (entry: LoadPemEntry | undefined): boolean =>
  Array.isArray(entry?.tags) && entry.tags.includes(MANAGED_TAG);

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/**
 * @param config - Caddy JSON config
 * @returns new config with managed load_pem entries replaced
 */
export function withCustomCertificates(
  config: CaddyConfig | null | undefined,
  certificates: StoredCertificate[],
): CaddyConfig {
  const next: CaddyConfig = clone(config) || {};
  const existing = next.apps?.tls?.certificates?.load_pem || [];
  const foreign = existing.filter((entry) => !isManaged(entry));
  const managed: LoadPemEntry[] = certificates.map((cert) => ({
    certificate: cert.certificate_pem,
    key: cert.private_key_pem,
    tags: [MANAGED_TAG, `${MANAGED_TAG}-cert-${cert.id}`],
  }));
  const loadPem = [...foreign, ...managed];

  if (loadPem.length === 0) {
    return withoutCustomCertificates(next) as CaddyConfig;
  }

  next.apps = next.apps || {};
  next.apps.tls = next.apps.tls || {};
  next.apps.tls.certificates = { ...(next.apps.tls.certificates || {}), load_pem: loadPem };
  return next;
}

/**
 * @param config - Caddy JSON config
 * @returns copy without CaddyManager-managed certificates (and their keys)
 */
export function withoutCustomCertificates<T extends CaddyConfig | null | undefined>(config: T): T {
  if (!config || !config.apps?.tls?.certificates?.load_pem) return clone(config);

  const next = clone(config) as CaddyConfig;
  const tls = next.apps?.tls as TlsApp;
  const certificates = tls.certificates as NonNullable<TlsApp['certificates']>;
  const remaining = (certificates.load_pem || []).filter((entry) => !isManaged(entry));

  if (remaining.length > 0) {
    certificates.load_pem = remaining;
  } else {
    delete certificates.load_pem;
    if (Object.keys(certificates).length === 0) delete tls.certificates;
    if (Object.keys(tls).length === 0) delete (next.apps as NonNullable<CaddyConfig['apps']>).tls;
  }
  return next as T;
}
