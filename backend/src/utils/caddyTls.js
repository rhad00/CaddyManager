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

const MANAGED_TAG = 'caddymanager';

const isManaged = (entry) => Array.isArray(entry?.tags) && entry.tags.includes(MANAGED_TAG);

const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/**
 * @param {Object|null} config - Caddy JSON config
 * @param {Array<{id: number|string, certificate_pem: string, private_key_pem: string}>} certificates
 * @returns {Object} new config with managed load_pem entries replaced
 */
function withCustomCertificates(config, certificates) {
  const next = clone(config) || {};
  const existing = next.apps?.tls?.certificates?.load_pem || [];
  const foreign = existing.filter((entry) => !isManaged(entry));
  const managed = certificates.map((cert) => ({
    certificate: cert.certificate_pem,
    key: cert.private_key_pem,
    tags: [MANAGED_TAG, `${MANAGED_TAG}-cert-${cert.id}`],
  }));
  const loadPem = [...foreign, ...managed];

  if (loadPem.length === 0) {
    return withoutCustomCertificates(next);
  }

  next.apps = next.apps || {};
  next.apps.tls = next.apps.tls || {};
  next.apps.tls.certificates = { ...(next.apps.tls.certificates || {}), load_pem: loadPem };
  return next;
}

/**
 * @param {Object|null} config - Caddy JSON config
 * @returns {Object|null} copy without CaddyManager-managed certificates (and their keys)
 */
function withoutCustomCertificates(config) {
  if (!config || !config.apps?.tls?.certificates?.load_pem) return clone(config);

  const next = clone(config);
  const tls = next.apps.tls;
  const remaining = tls.certificates.load_pem.filter((entry) => !isManaged(entry));

  if (remaining.length > 0) {
    tls.certificates.load_pem = remaining;
  } else {
    delete tls.certificates.load_pem;
    if (Object.keys(tls.certificates).length === 0) delete tls.certificates;
    if (Object.keys(tls).length === 0) delete next.apps.tls;
  }
  return next;
}

module.exports = { MANAGED_TAG, withCustomCertificates, withoutCustomCertificates };
