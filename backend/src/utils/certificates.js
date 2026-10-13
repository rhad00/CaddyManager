/**
 * X.509 helpers for uploaded and generated certificates, using Node's built-in
 * crypto.X509Certificate (no openssl CLI, no temp files).
 */
const crypto = require('crypto');

/** Error caused by user-supplied certificate material; maps to HTTP 400. */
class CertificateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CertificateError';
    this.statusCode = 400;
  }
}

/**
 * @param {string} certificatePem
 * @returns {{ issuer: string, subject: string, validFrom: Date, validTo: Date,
 *   dnsNames: string[], fingerprint256: string, x509: crypto.X509Certificate }}
 * @throws {CertificateError}
 */
function parsePemCertificate(certificatePem) {
  let x509;
  try {
    x509 = new crypto.X509Certificate(certificatePem);
  } catch {
    throw new CertificateError('Certificate file is not a valid PEM certificate');
  }

  // subjectAltName looks like: 'DNS:a.example.com, DNS:*.b.example.com, IP Address:1.2.3.4'
  const dnsNames = (x509.subjectAltName || '')
    .split(/,\s*/)
    .filter((entry) => entry.startsWith('DNS:'))
    .map((entry) => entry.slice(4).replace(/^"|"$/g, '').toLowerCase());

  return {
    issuer: x509.issuer.split('\n').join(', '),
    subject: x509.subject.split('\n').join(', '),
    validFrom: new Date(x509.validFrom),
    validTo: new Date(x509.validTo),
    dnsNames,
    fingerprint256: x509.fingerprint256,
    x509,
  };
}

/**
 * @param {string} certificatePem
 * @param {string} privateKeyPem
 * @throws {CertificateError} when the key is invalid or belongs to another certificate
 */
function assertKeyMatchesCertificate(certificatePem, privateKeyPem) {
  const { x509 } = parsePemCertificate(certificatePem);
  let key;
  try {
    key = crypto.createPrivateKey(privateKeyPem);
  } catch {
    throw new CertificateError('Private key file is not a valid unencrypted PEM private key');
  }
  if (!x509.checkPrivateKey(key)) {
    throw new CertificateError('Private key does not match the certificate');
  }
}

/** Does a certificate name (possibly a single-label wildcard) cover the domain? */
function nameCovers(certName, domain) {
  if (certName === domain) return true;
  if (!certName.startsWith('*.')) return false;
  const suffix = certName.slice(1); // ".apps.example.com"
  const label = domain.slice(0, -suffix.length);
  return domain.endsWith(suffix) && label.length > 0 && !label.includes('.');
}

/**
 * Domains a certificate will be used for. Defaults to the certificate's DNS SANs;
 * requested domains must all be covered, otherwise Caddy would never serve the
 * certificate for them.
 * @param {string|string[]|undefined} requested - comma-separated or array
 * @param {{ dnsNames: string[] }} info - from parsePemCertificate
 * @returns {string[]}
 * @throws {CertificateError}
 */
function resolveCertificateDomains(requested, info) {
  const list = (Array.isArray(requested) ? requested : String(requested || '').split(','))
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  if (list.length === 0) {
    if (info.dnsNames.length === 0) {
      throw new CertificateError('Certificate has no DNS names; specify the domains it is for');
    }
    return [...info.dnsNames];
  }

  const uncovered = list.filter((domain) => !info.dnsNames.some((name) => nameCovers(name, domain)));
  if (uncovered.length > 0) {
    throw new CertificateError(`Certificate does not cover: ${uncovered.join(', ')}`);
  }
  return list;
}

/**
 * API shape of a Certificate: never includes the private key.
 * @param {Object} certificate - Sequelize instance or plain object
 * @returns {Object}
 */
function toCertificateResponse(certificate) {
  if (!certificate) return certificate;
  const data = typeof certificate.toJSON === 'function' ? certificate.toJSON() : { ...certificate };
  // eslint-disable-next-line no-unused-vars
  const { private_key_pem, ...rest } = data;
  return rest;
}

module.exports = {
  CertificateError,
  parsePemCertificate,
  assertKeyMatchesCertificate,
  resolveCertificateDomains,
  toCertificateResponse,
};
