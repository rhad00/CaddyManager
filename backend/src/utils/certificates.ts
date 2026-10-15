/**
 * X.509 helpers for uploaded and generated certificates, using Node's built-in
 * crypto.X509Certificate (no openssl CLI, no temp files).
 */
import crypto from 'crypto';

/** Error caused by user-supplied certificate material; maps to HTTP 400. */
export class CertificateError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'CertificateError';
  }
}

export interface CertificateInfo {
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  dnsNames: string[];
  fingerprint256: string;
  x509: crypto.X509Certificate;
}

/** @throws {CertificateError} */
export function parsePemCertificate(certificatePem: string): CertificateInfo {
  let x509: crypto.X509Certificate;
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

/** @throws {CertificateError} when the key is invalid or belongs to another certificate */
export function assertKeyMatchesCertificate(certificatePem: string, privateKeyPem: string): void {
  const { x509 } = parsePemCertificate(certificatePem);
  let key: crypto.KeyObject;
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
function nameCovers(certName: string, domain: string): boolean {
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
 * @param requested - comma-separated string or array
 * @param info - from parsePemCertificate
 * @throws {CertificateError}
 */
export function resolveCertificateDomains(
  requested: string | string[] | undefined,
  info: Pick<CertificateInfo, 'dnsNames'>,
): string[] {
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
 * @param certificate - Sequelize instance or plain object
 */
export function toCertificateResponse(certificate: null | undefined): null | undefined;
export function toCertificateResponse(certificate: object): Record<string, unknown>;
export function toCertificateResponse(certificate: object | null | undefined): Record<string, unknown> | null | undefined {
  if (certificate === null || certificate === undefined) return certificate as null | undefined;
  const withJson = certificate as { toJSON?: () => Record<string, unknown> };
  const data: Record<string, unknown> = typeof withJson.toJSON === 'function'
    ? withJson.toJSON()
    : { ...(certificate as Record<string, unknown>) };
  const { private_key_pem: _omitted, ...rest } = data;
  return rest;
}
