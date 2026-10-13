const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Op } = require('sequelize');
const { sequelize, Certificate, CertificateAuthority, Proxy } = require('../models');
const {
  CertificateError,
  parsePemCertificate,
  assertKeyMatchesCertificate,
  resolveCertificateDomains,
} = require('../utils/certificates');
const caddyService = require('./caddyService');

// Certificate types CaddyManager loads into Caddy itself (ACME ones Caddy manages)
const MANAGED_CERTIFICATE_TYPES = ['uploaded', 'self-signed'];
// caddy_cert_id prefix for ACME certificates recorded by probing a domain over TLS
const OBSERVED_PREFIX = 'observed:';
require('dotenv').config();

/**
 * Service for managing certificates and certificate authorities
 */
class CertificateService {
  constructor() {
    this.tempDir = process.env.TEMP_DIR || path.join(__dirname, '../../temp');

    // Fire-and-forget async initialization to avoid blocking the event loop.
    this.ensureTempDir().catch((error) => {
      console.error('Failed to create temp directory:', error);
    });
  }
  
  /**
   * Ensure temp directory exists
   */
  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`Temp directory ensured: ${this.tempDir}`);
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }
  
  /**
   * Record the certificates Caddy is actually serving for ACME-managed proxies.
   *
   * Caddy's admin API cannot list managed certificates, so each active ACME/Cloudflare
   * proxy domain is probed over TLS (wildcards skipped). Results are upserted as
   * "observed" rows keyed by domain; rows for domains no longer proxied are marked
   * revoked.
   * @returns {Promise<Object>} counts and per-domain failures
   */
  async syncCertificates() {
    const proxies = await Proxy.findAll({
      where: { ssl_type: ['acme', 'cloudflare'], status: 'active' }
    });
    const domains = [...new Set(proxies.flatMap(p => (Array.isArray(p.domains) ? p.domains : [p.domains])))]
      .filter(d => d && !d.startsWith('*.'));

    const { results } = await caddyService.verifyTlsForDomains(domains);
    const observed = await Certificate.findAll({
      where: { caddy_cert_id: { [Op.like]: `${OBSERVED_PREFIX}%` } }
    });
    const byKey = new Map(observed.map(cert => [cert.caddy_cert_id, cert]));

    const summary = { success: true, added: 0, updated: 0, revoked: 0, failed: [] };
    for (const result of results) {
      if (!result.ok || !result.validTo) {
        summary.failed.push({ domain: result.domain, error: result.error || 'No certificate' });
        continue;
      }
      const key = `${OBSERVED_PREFIX}${result.domain}`;
      const validTo = new Date(result.validTo);
      const fields = {
        issuer: result.issuer || 'Unknown',
        valid_from: new Date(result.validFrom),
        valid_to: validTo,
        status: validTo > new Date() ? 'valid' : 'expired'
      };
      const existing = byKey.get(key);
      if (existing) {
        await existing.update(fields);
        byKey.delete(key);
        summary.updated += 1;
      } else {
        await Certificate.create({
          ...fields,
          name: result.domain,
          domains: result.domain,
          caddy_cert_id: key,
          type: 'acme',
          auto_renew: true,
          created_by: null
        });
        summary.added += 1;
      }
    }

    // Observed rows whose domain is no longer served by any ACME proxy
    const probed = new Set(results.map(r => `${OBSERVED_PREFIX}${r.domain}`));
    for (const [key, cert] of byKey.entries()) {
      if (!probed.has(key) && cert.status !== 'revoked') {
        await cert.update({ status: 'revoked' });
        summary.revoked += 1;
      }
    }

    return summary;
  }

  /**
   * Certificates covering exactly this domain (stored data only; no network calls)
   * @param {string} domain
   * @returns {Promise<Array>} List of certificates
   */
  async getCertificatesForDomain(domain) {
    const wanted = String(domain).trim().toLowerCase();
    const candidates = await Certificate.findAll({
      where: { domains: { [Op.like]: `%${wanted}%` } }
    });
    // LIKE narrows the query; exact matching avoids "app.example.com" matching "myapp.example.com"
    return candidates.filter(cert =>
      String(cert.domains).split(',').map(d => d.trim().toLowerCase()).includes(wanted)
    );
  }
  
  /**
   * Upload a custom certificate
   * @param {string} name - Certificate name
   * @param {string|undefined} domains - Comma-separated list of domains (defaults to the certificate's SANs)
   * @param {string} certificatePath - Path to certificate file
   * @param {string} privateKeyPath - Path to private key file
   * @param {string|null} userId - Uploading user
   * @returns {Promise<Object>} The created certificate
   */
  async uploadCertificate(name, domains, certificatePath, privateKeyPath, userId = null) {
    try {
      // Read certificate and private key files
      const certificatePem = await fs.readFile(certificatePath, 'utf8');
      const privateKeyPem = await fs.readFile(privateKeyPath, 'utf8');

      // Reject unparseable certificates, mismatched keys and uncovered domains (400s)
      const certInfo = parsePemCertificate(certificatePem);
      assertKeyMatchesCertificate(certificatePem, privateKeyPem);
      const domainList = resolveCertificateDomains(domains, certInfo);

      const certId = crypto.randomUUID();

      // Create certificate in database, then push it to Caddy
      const certificate = await Certificate.create({
        name,
        domains: domainList.join(','),
        issuer: certInfo.issuer,
        valid_from: certInfo.validFrom,
        valid_to: certInfo.validTo,
        certificate_pem: certificatePem,
        private_key_pem: privateKeyPem,
        caddy_cert_id: certId,
        type: 'uploaded',
        auto_renew: false,
        status: certInfo.validTo > new Date() ? 'valid' : 'expired',
        created_by: userId
      });

      await this.activateCertificate(certificate);
      return certificate;
    } catch (error) {
      console.error('Failed to upload certificate:', error);
      if (error instanceof CertificateError) throw error;
      throw new Error(`Failed to upload certificate: ${error.message}`);
    } finally {
      // Clean up temporary files
      try {
        await fs.unlink(certificatePath);
        await fs.unlink(privateKeyPath);
      } catch (error) {
        console.error('Failed to clean up temporary files:', error);
      }
    }
  }
  
  /**
   * Validate self-signed generation input (user errors → CertificateError / 400)
   * @param {string} domains - Comma-separated list of domains
   * @param {number} validityDays
   * @returns {{ domainList: string[], days: number }}
   */
  validateSelfSignedInput(domains, validityDays) {
    const domainList = String(domains).split(',').map(d => d.trim()).filter(Boolean);
    // Also prevents injection into the OpenSSL config and -subj argument
    const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z]{2,}$/;
    if (domainList.length === 0) {
      throw new CertificateError('At least one domain is required');
    }
    for (const d of domainList) {
      if (!domainRegex.test(d)) {
        throw new CertificateError(`Invalid domain name: ${d}`);
      }
    }
    const days = Number(validityDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new CertificateError('Validity days must be an integer between 1 and 3650');
    }
    return { domainList, days };
  }

  /**
   * Create a self-signed key pair with the openssl CLI
   * @param {string[]} domainList - validated domains
   * @param {number} days - validated validity
   * @returns {Promise<{ certificatePem: string, privateKeyPem: string }>}
   */
  async createSelfSignedPem(domainList, days) {
    const certDir = path.join(this.tempDir, `cert_${crypto.randomUUID()}`);
    try {
      await fs.mkdir(certDir, { recursive: true });
      const certPath = path.join(certDir, 'cert.pem');
      const keyPath = path.join(certDir, 'key.pem');
      const configPath = path.join(certDir, 'openssl.cnf');
      await fs.writeFile(configPath, this.generateOpenSSLConfig(domainList));

      // execFileSync (no shell) prevents command injection
      execFileSync('openssl', ['genrsa', '-out', keyPath, '2048']);
      execFileSync('openssl', [
        'req', '-new', '-x509',
        '-key', keyPath,
        '-out', certPath,
        '-days', String(days),
        '-config', configPath,
        '-subj', `/CN=${domainList[0]}`
      ]);

      return {
        certificatePem: await fs.readFile(certPath, 'utf8'),
        privateKeyPem: await fs.readFile(keyPath, 'utf8')
      };
    } finally {
      await fs.rm(certDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Generate a self-signed certificate
   * @param {string} name - Certificate name
   * @param {string} domains - Comma-separated list of domains
   * @param {number} validityDays - Validity period in days
   * @param {string|null} userId - Creating user
   * @returns {Promise<Object>} The created certificate
   */
  async generateSelfSignedCertificate(name, domains, validityDays, userId = null) {
    const { domainList, days } = this.validateSelfSignedInput(domains, validityDays);

    try {
      const { certificatePem, privateKeyPem } = await this.createSelfSignedPem(domainList, days);
      const certInfo = parsePemCertificate(certificatePem);

      // Create certificate in database, then push it to Caddy
      const certificate = await Certificate.create({
        name,
        domains: domainList.join(','),
        issuer: 'Self-Signed',
        valid_from: certInfo.validFrom,
        valid_to: certInfo.validTo,
        certificate_pem: certificatePem,
        private_key_pem: privateKeyPem,
        caddy_cert_id: crypto.randomUUID(),
        type: 'self-signed',
        auto_renew: false,
        status: 'valid',
        created_by: userId
      });

      await this.activateCertificate(certificate);
      return certificate;
    } catch (error) {
      console.error('Failed to generate self-signed certificate:', error);
      throw new Error(`Failed to generate self-signed certificate: ${error.message}`);
    }
  }

  /**
   * Make a newly stored custom certificate live in Caddy; remove it again if Caddy
   * rejects the resulting config so the database never lists a certificate Caddy lacks.
   * @param {Object} certificate - Certificate instance just created
   */
  async activateCertificate(certificate) {
    try {
      await caddyService.syncCustomCertificates();
    } catch (error) {
      await certificate.destroy().catch((cleanupError) => {
        console.error('Failed to remove certificate after Caddy rejected it:', cleanupError);
      });
      throw new Error(`Caddy rejected the certificate: ${error.message}`);
    }
  }

  /**
   * Delete a certificate
   * @param {Object} certificate - Certificate object
   * @returns {Promise<Object>} Result of the operation
   */
  async deleteCertificate(certificate) {
    try {
      const servedByCaddy = MANAGED_CERTIFICATE_TYPES.includes(certificate.type);

      // Delete from the database first: Caddy's copy is rebuilt from the database
      await certificate.destroy();

      if (servedByCaddy) {
        await caddyService.syncCustomCertificates();
      }

      return {
        success: true,
        message: 'Certificate deleted successfully'
      };
    } catch (error) {
      console.error('Failed to delete certificate:', error);
      throw new Error(`Failed to delete certificate: ${error.message}`);
    }
  }

  /**
   * Renew a certificate.
   * Caddy has no renew endpoint and renews ACME certificates on its own, so only
   * self-signed certificates can be renewed here (regenerated with the same domains
   * and validity period).
   * @param {Object} certificate - Certificate object
   * @returns {Promise<Object>} Result of the operation
   * @throws {CertificateError} for ACME and uploaded certificates
   */
  async renewCertificate(certificate) {
    if (certificate.type === 'acme') {
      throw new CertificateError(
        'Caddy renews ACME certificates automatically (about 30 days before expiry); no manual renewal is needed'
      );
    }
    if (certificate.type !== 'self-signed') {
      throw new CertificateError('Uploaded certificates cannot be renewed here; upload a replacement certificate');
    }

    const previousDays = Math.round(
      (new Date(certificate.valid_to) - new Date(certificate.valid_from)) / (24 * 60 * 60 * 1000)
    );
    const { domainList, days } = this.validateSelfSignedInput(
      certificate.domains,
      Math.min(Math.max(previousDays, 1), 3650)
    );

    try {
      const { certificatePem, privateKeyPem } = await this.createSelfSignedPem(domainList, days);
      const certInfo = parsePemCertificate(certificatePem);
      await certificate.update({
        certificate_pem: certificatePem,
        private_key_pem: privateKeyPem,
        valid_from: certInfo.validFrom,
        valid_to: certInfo.validTo,
        status: 'valid'
      });
      await caddyService.syncCustomCertificates();

      return {
        success: true,
        message: `Self-signed certificate regenerated, valid for ${days} days`
      };
    } catch (error) {
      console.error('Failed to renew certificate:', error);
      throw new Error(`Failed to renew certificate: ${error.message}`);
    }
  }
  
  /**
   * Add a certificate authority.
   * Caddy's admin API has no ACME-account or trust-store endpoints, so CAs are stored
   * as records only; they are not yet applied to Caddy issuance or upstream TLS trust
   * (see MODERNIZATION.md 0.11e).
   * @param {string} name - CA name
   * @param {string} type - 'acme' or 'custom'
   * @param {string|null} certificatePath - CA certificate file (custom CAs)
   * @param {string|null} url - ACME directory URL (ACME CAs)
   * @param {string|null} email - Contact email for ACME CAs
   * @param {boolean} trusted - Whether the CA is marked trusted
   * @returns {Promise<Object>} The created CA
   */
  async addCertificateAuthority(name, type, certificatePath, url, email, trusted) {
    if (!['acme', 'custom'].includes(type)) {
      throw new CertificateError('type must be "acme" or "custom"');
    }

    let certificatePem = null;
    if (type === 'custom') {
      if (!certificatePath) throw new CertificateError('A CA certificate file is required for custom CAs');
      certificatePem = await fs.readFile(certificatePath, 'utf8');
      parsePemCertificate(certificatePem);
    } else {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new CertificateError('A valid ACME directory URL is required for ACME CAs');
      }
      if (parsed.protocol !== 'https:') {
        throw new CertificateError('ACME directory URL must use https');
      }
    }

    return CertificateAuthority.create({
      name,
      type,
      url: type === 'acme' ? url : null,
      email: email || null,
      certificate_pem: certificatePem,
      trusted: Boolean(trusted),
      acme_account_id: null
    });
  }

  /**
   * Delete a certificate authority record
   * @param {Object} ca - Certificate authority object
   * @returns {Promise<Object>} Result of the operation
   */
  async deleteCertificateAuthority(ca) {
    await ca.destroy();
    return { success: true, message: 'Certificate authority deleted successfully' };
  }

  /**
   * Update the trusted flag of a CA record
   * @param {Object} ca - Certificate authority object
   * @param {boolean} trusted - New trust status
   * @returns {Promise<Object>} The updated CA
   */
  async updateCATrustStatus(ca, trusted) {
    await ca.update({ trusted: Boolean(trusted) });
    return ca;
  }

  /**
   * Generate OpenSSL config for self-signed certificate
   * @param {Array} domains - List of domains
   * @returns {string} OpenSSL config content
   */
  generateOpenSSLConfig(domains) {
    const primaryDomain = domains[0];
    const altNames = domains.map((domain, index) => `DNS.${index + 1} = ${domain}`).join('\n');
    
    return `
[ req ]
default_bits       = 2048
default_keyfile    = key.pem
distinguished_name = req_distinguished_name
req_extensions     = req_ext
x509_extensions    = v3_ca

[ req_distinguished_name ]
countryName                 = Country Name (2 letter code)
countryName_default         = US
stateOrProvinceName         = State or Province Name (full name)
stateOrProvinceName_default = California
localityName                = Locality Name (eg, city)
localityName_default        = San Francisco
organizationName            = Organization Name (eg, company)
organizationName_default    = CaddyManager
commonName                  = Common Name (e.g. server FQDN or YOUR name)
commonName_default          = ${primaryDomain}

[ req_ext ]
subjectAltName = @alt_names

[ v3_ca ]
subjectAltName = @alt_names

[ alt_names ]
${altNames}
    `;
  }
}

module.exports = new CertificateService();
