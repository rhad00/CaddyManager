const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { sequelize, Certificate, CertificateAuthority } = require('../models');
require('dotenv').config();

/**
 * Service for managing certificates and certificate authorities
 */
class CertificateService {
  constructor() {
    this.apiUrl = process.env.CADDY_API_URL || 'http://localhost:2019';
    this.tempDir = process.env.TEMP_DIR || path.join(__dirname, '../../temp');
    
    // Ensure temp directory exists (synchronous to avoid async logs after tests)
    try {
      fsSync.mkdirSync(this.tempDir, { recursive: true });
      console.log(`Temp directory ensured: ${this.tempDir}`);
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
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
   * Get all certificates from Caddy
   * @returns {Promise<Array>} List of certificates
   */
  async getCertificatesFromCaddy() {
    try {
      const response = await axios.get(`${this.apiUrl}/certificates`);
      return response.data;
    } catch (error) {
      console.error('Failed to get certificates from Caddy:', error);
      throw new Error(`Failed to get certificates: ${error.message}`);
    }
  }
  
  /**
   * Sync certificates from Caddy to database
   * @returns {Promise<Object>} Result of the operation
   */
  async syncCertificates() {
    try {
      const caddyCertificates = await this.getCertificatesFromCaddy();
      const transaction = await sequelize.transaction();
      
      try {
        // Get existing certificates from database
        const dbCertificates = await Certificate.findAll({
          where: {
            caddy_cert_id: {
              [sequelize.Op.not]: null
            }
          }
        });
        
        // Map of existing certificate IDs
        const existingCertIds = new Map(
          dbCertificates.map(cert => [cert.caddy_cert_id, cert])
        );
        
        // Process each certificate from Caddy
        for (const caddyCert of caddyCertificates) {
          const certId = caddyCert.id;
          
          // Check if certificate already exists in database
          if (existingCertIds.has(certId)) {
            // Update existing certificate
            const dbCert = existingCertIds.get(certId);
            await dbCert.update({
              domains: caddyCert.subjects.join(','),
              issuer: caddyCert.issuer || 'Unknown',
              valid_from: new Date(caddyCert.not_before),
              valid_to: new Date(caddyCert.not_after),
              status: new Date(caddyCert.not_after) > new Date() ? 'valid' : 'expired'
            }, { transaction });
            
            // Remove from map to track processed certificates
            existingCertIds.delete(certId);
          } else {
            // Create new certificate
            await Certificate.create({
              name: caddyCert.subjects[0] || 'Unnamed Certificate',
              domains: caddyCert.subjects.join(','),
              issuer: caddyCert.issuer || 'Unknown',
              valid_from: new Date(caddyCert.not_before),
              valid_to: new Date(caddyCert.not_after),
              caddy_cert_id: certId,
              type: 'acme',
              auto_renew: true,
              status: new Date(caddyCert.not_after) > new Date() ? 'valid' : 'expired'
            }, { transaction });
          }
        }
        
        // Any certificates left in the map no longer exist in Caddy
        for (const [certId, dbCert] of existingCertIds.entries()) {
          // Mark as revoked instead of deleting
          await dbCert.update({
            status: 'revoked'
          }, { transaction });
        }
        
        await transaction.commit();
        
        return {
          success: true,
          message: 'Certificates synced successfully',
          added: caddyCertificates.length - existingCertIds.size,
          updated: caddyCertificates.length - (caddyCertificates.length - existingCertIds.size),
          revoked: existingCertIds.size
        };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      console.error('Failed to sync certificates:', error);
      throw new Error(`Failed to sync certificates: ${error.message}`);
    }
  }
  
  /**
   * Get certificates for a specific domain
   * @param {string} domain - Domain to get certificates for
   * @returns {Promise<Array>} List of certificates
   */
  async getCertificatesForDomain(domain) {
    try {
      // First, sync certificates to ensure we have the latest data
      await this.syncCertificates();
      
      // Query certificates that match the domain
      const certificates = await Certificate.findAll({
        where: sequelize.literal(`domains LIKE '%${domain}%'`)
      });
      
      return certificates;
    } catch (error) {
      console.error('Failed to get certificates for domain:', error);
      throw new Error(`Failed to get certificates for domain: ${error.message}`);
    }
  }
  
  /**
   * Upload a custom certificate
   * @param {string} name - Certificate name
   * @param {string} domains - Comma-separated list of domains
   * @param {string} certificatePath - Path to certificate file
   * @param {string} privateKeyPath - Path to private key file
   * @returns {Promise<Object>} The created certificate
   */
  async uploadCertificate(name, domains, certificatePath, privateKeyPath) {
    try {
      // Read certificate and private key files
      const certificatePem = await fs.readFile(certificatePath, 'utf8');
      const privateKeyPem = await fs.readFile(privateKeyPath, 'utf8');
      
      // Parse certificate to get validity dates
      const certInfo = this.parseCertificateInfo(certificatePem);
      
      // Create a unique ID for the certificate
      const certId = uuidv4();
      
      // Load certificate into Caddy
      await this.loadCertificateIntoCaddy(certId, domains.split(','), certificatePem, privateKeyPem);
      
      // Create certificate in database
      const certificate = await Certificate.create({
        name,
        domains,
        issuer: certInfo.issuer || 'Custom Upload',
        valid_from: certInfo.validFrom,
        valid_to: certInfo.validTo,
        certificate_pem: certificatePem,
        private_key_pem: privateKeyPem,
        caddy_cert_id: certId,
        type: 'uploaded',
        auto_renew: false,
        status: new Date(certInfo.validTo) > new Date() ? 'valid' : 'expired'
      });
      
      return certificate;
    } catch (error) {
      console.error('Failed to upload certificate:', error);
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
   * Generate a self-signed certificate
   * @param {string} name - Certificate name
   * @param {string} domains - Comma-separated list of domains
   * @param {number} validityDays - Validity period in days
   * @returns {Promise<Object>} The created certificate
   */
  async generateSelfSignedCertificate(name, domains, validityDays) {
    try {
      // Create temporary directory for certificate generation
      const certDir = path.join(this.tempDir, `cert_${Date.now()}`);
      await fs.mkdir(certDir, { recursive: true });
      
      const domainList = domains.split(',').map(d => d.trim());
      const primaryDomain = domainList[0];
      
      // Generate self-signed certificate using OpenSSL
      const certPath = path.join(certDir, 'cert.pem');
      const keyPath = path.join(certDir, 'key.pem');
      
      // Create OpenSSL config file
      const configPath = path.join(certDir, 'openssl.cnf');
      const configContent = this.generateOpenSSLConfig(domainList);
      await fs.writeFile(configPath, configContent);
      
      // Generate private key
      execSync(`openssl genrsa -out "${keyPath}" 2048`);
      
      // Generate certificate
      execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days ${validityDays} -config "${configPath}" -subj "/CN=${primaryDomain}"`);
      
      // Read generated files
      const certificatePem = await fs.readFile(certPath, 'utf8');
      const privateKeyPem = await fs.readFile(keyPath, 'utf8');
      
      // Parse certificate to get validity dates
      const certInfo = this.parseCertificateInfo(certificatePem);
      
      // Create a unique ID for the certificate
      const certId = uuidv4();
      
      // Load certificate into Caddy
      await this.loadCertificateIntoCaddy(certId, domainList, certificatePem, privateKeyPem);
      
      // Create certificate in database
      const certificate = await Certificate.create({
        name,
        domains,
        issuer: 'Self-Signed',
        valid_from: certInfo.validFrom,
        valid_to: certInfo.validTo,
        certificate_pem: certificatePem,
        private_key_pem: privateKeyPem,
        caddy_cert_id: certId,
        type: 'self-signed',
        auto_renew: false,
        status: 'valid'
      });
      
      // Clean up
      await fs.rm(certDir, { recursive: true, force: true });
      
      return certificate;
    } catch (error) {
      console.error('Failed to generate self-signed certificate:', error);
      throw new Error(`Failed to generate self-signed certificate: ${error.message}`);
    }
  }
  
  /**
   * Delete a certificate
   * @param {Object} certificate - Certificate object
   * @returns {Promise<Object>} Result of the operation
   */
  async deleteCertificate(certificate) {
    try {
      // If certificate has a Caddy ID, delete it from Caddy
      if (certificate.caddy_cert_id) {
        try {
          await axios.delete(`${this.apiUrl}/certificates/${certificate.caddy_cert_id}`);
        } catch (error) {
          console.error('Failed to delete certificate from Caddy:', error);
          // Continue with deletion from database even if Caddy deletion fails
        }
      }
      
      // Delete certificate from database
      await certificate.destroy();
      
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
   * Renew a certificate
   * @param {Object} certificate - Certificate object
   * @returns {Promise<Object>} Result of the operation
   */
  async renewCertificate(certificate) {
    try {
      if (certificate.type !== 'acme') {
        throw new Error('Only ACME certificates can be renewed');
      }
      
      // For ACME certificates, we need to trigger Caddy to renew
      if (certificate.caddy_cert_id) {
        // Caddy doesn't have a direct "renew" endpoint, so we delete and let it re-obtain
        await axios.delete(`${this.apiUrl}/certificates/${certificate.caddy_cert_id}`);
        
        // Update certificate status
        await certificate.update({
          status: 'pending'
        });
        
        return {
          success: true,
          message: 'Certificate renewal initiated'
        };
      } else {
        throw new Error('Certificate does not have a Caddy ID');
      }
    } catch (error) {
      console.error('Failed to renew certificate:', error);
      throw new Error(`Failed to renew certificate: ${error.message}`);
    }
  }
  
  /**
   * Add a certificate authority
   * @param {string} name - CA name
   * @param {string} type - CA type (acme or custom)
   * @param {string} certificatePath - Path to CA certificate file (for custom CAs)
   * @param {string} url - ACME directory URL (for ACME CAs)
   * @param {string} email - Email for ACME account
   * @param {boolean} trusted - Whether the CA is trusted
   * @returns {Promise<Object>} The created CA
   */
  async addCertificateAuthority(name, type, certificatePath, url, email, trusted) {
    try {
      let certificatePem = null;
      let acmeAccountId = null;
      
      if (type === 'custom') {
        // Read CA certificate file
        certificatePem = await fs.readFile(certificatePath, 'utf8');
        
        // Add CA to Caddy's trust store if trusted
        if (trusted) {
          await this.trustCACertificate(certificatePem);
        }
      } else if (type === 'acme') {
        // Register ACME account with Caddy
        if (url && email) {
          acmeAccountId = await this.registerACMEAccount(url, email);
        }
      }
      
      // Create CA in database
      const ca = await CertificateAuthority.create({
        name,
        type,
        url,
        email,
        certificate_pem: certificatePem,
        trusted,
        acme_account_id: acmeAccountId
      });
      
      return ca;
    } catch (error) {
      console.error('Failed to add certificate authority:', error);
      throw new Error(`Failed to add certificate authority: ${error.message}`);
    } finally {
      // Clean up temporary files
      if (certificatePath) {
        try {
          await fs.unlink(certificatePath);
        } catch (error) {
          console.error('Failed to clean up temporary files:', error);
        }
      }
    }
  }
  
  /**
   * Delete a certificate authority
   * @param {Object} ca - Certificate authority object
   * @returns {Promise<Object>} Result of the operation
   */
  async deleteCertificateAuthority(ca) {
    try {
      // If CA is ACME and has an account ID, delete the account
      if (ca.type === 'acme' && ca.acme_account_id) {
        try {
          await this.deleteACMEAccount(ca.acme_account_id);
        } catch (error) {
          console.error('Failed to delete ACME account:', error);
          // Continue with deletion from database even if ACME account deletion fails
        }
      }
      
      // If CA is custom and trusted, remove from trust store
      if (ca.type === 'custom' && ca.trusted && ca.certificate_pem) {
        try {
          await this.untrustCACertificate(ca.certificate_pem);
        } catch (error) {
          console.error('Failed to remove CA from trust store:', error);
          // Continue with deletion from database even if trust store removal fails
        }
      }
      
      // Delete CA from database
      await ca.destroy();
      
      return {
        success: true,
        message: 'Certificate authority deleted successfully'
      };
    } catch (error) {
      console.error('Failed to delete certificate authority:', error);
      throw new Error(`Failed to delete certificate authority: ${error.message}`);
    }
  }
  
  /**
   * Update CA trust status
   * @param {Object} ca - Certificate authority object
   * @param {boolean} trusted - New trust status
   * @returns {Promise<Object>} The updated CA
   */
  async updateCATrustStatus(ca, trusted) {
    try {
      if (ca.type === 'custom' && ca.certificate_pem) {
        if (trusted && !ca.trusted) {
          // Add to trust store
          await this.trustCACertificate(ca.certificate_pem);
        } else if (!trusted && ca.trusted) {
          // Remove from trust store
          await this.untrustCACertificate(ca.certificate_pem);
        }
      }
      
      // Update CA in database
      await ca.update({
        trusted
      });
      
      return ca;
    } catch (error) {
      console.error('Failed to update CA trust status:', error);
      throw new Error(`Failed to update CA trust status: ${error.message}`);
    }
  }
  
  /**
   * Get ACME accounts
   * @returns {Promise<Array>} List of ACME accounts
   */
  async getACMEAccounts() {
    try {
      const response = await axios.get(`${this.apiUrl}/acme/accounts`);
      return response.data;
    } catch (error) {
      console.error('Failed to get ACME accounts:', error);
      throw new Error(`Failed to get ACME accounts: ${error.message}`);
    }
  }
  
  /**
   * Add an ACME account
   * @param {string} email - Email for ACME account
   * @param {Object} ca - Certificate authority object
   * @returns {Promise<Object>} Result of the operation
   */
  async addACMEAccount(email, ca) {
    try {
      if (!ca.url) {
        throw new Error('CA URL is required for ACME accounts');
      }
      
      // Register ACME account with Caddy
      const acmeAccountId = await this.registerACMEAccount(ca.url, email);
      
      // Update CA with ACME account ID
      await ca.update({
        email,
        acme_account_id: acmeAccountId
      });
      
      return {
        success: true,
        message: 'ACME account added successfully',
        acmeAccountId
      };
    } catch (error) {
      console.error('Failed to add ACME account:', error);
      throw new Error(`Failed to add ACME account: ${error.message}`);
    }
  }
  
  /**
   * Delete an ACME account
   * @param {string} accountId - ACME account ID
   * @returns {Promise<Object>} Result of the operation
   */
  async deleteACMEAccount(accountId) {
    try {
      await axios.delete(`${this.apiUrl}/acme/accounts/${accountId}`);
      
      // Update any CAs that use this account
      await CertificateAuthority.update(
        { acme_account_id: null },
        { where: { acme_account_id: accountId } }
      );
      
      return {
        success: true,
        message: 'ACME account deleted successfully'
      };
    } catch (error) {
      console.error('Failed to delete ACME account:', error);
      throw new Error(`Failed to delete ACME account: ${error.message}`);
    }
  }
  
  /**
   * Load a certificate into Caddy
   * @param {string} certId - Certificate ID
   * @param {Array} domains - List of domains
   * @param {string} certificatePem - PEM-encoded certificate
   * @param {string} privateKeyPem - PEM-encoded private key
   * @returns {Promise<Object>} Result of the operation
   */
  async loadCertificateIntoCaddy(certId, domains, certificatePem, privateKeyPem) {
    try {
      const payload = {
        certificates: [
          {
            certificate: certificatePem,
            key: privateKeyPem,
            tags: ['manual', 'caddymanager'],
            subjects: domains
          }
        ]
      };
      
      await axios.post(`${this.apiUrl}/load/certificates`, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return {
        success: true,
        message: 'Certificate loaded into Caddy successfully'
      };
    } catch (error) {
      console.error('Failed to load certificate into Caddy:', error);
      throw new Error(`Failed to load certificate into Caddy: ${error.message}`);
    }
  }
  
  /**
   * Trust a CA certificate
   * @param {string} certificatePem - PEM-encoded CA certificate
   * @returns {Promise<Object>} Result of the operation
   */
  async trustCACertificate(certificatePem) {
    try {
      // Get current TLS config
      const response = await axios.get(`${this.apiUrl}/config/apps/tls`);
      const tlsConfig = response.data;
      
      // Ensure root_ca_pool exists
      if (!tlsConfig.root_ca_pool) {
        tlsConfig.root_ca_pool = [];
      }
      
      // Add CA certificate to root_ca_pool if not already present
      if (!tlsConfig.root_ca_pool.includes(certificatePem)) {
        tlsConfig.root_ca_pool.push(certificatePem);
      }
      
      // Update TLS config
      await axios.patch(`${this.apiUrl}/config/apps/tls`, {
        root_ca_pool: tlsConfig.root_ca_pool
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return {
        success: true,
        message: 'CA certificate trusted successfully'
      };
    } catch (error) {
      console.error('Failed to trust CA certificate:', error);
      throw new Error(`Failed to trust CA certificate: ${error.message}`);
    }
  }
  
  /**
   * Untrust a CA certificate
   * @param {string} certificatePem - PEM-encoded CA certificate
   * @returns {Promise<Object>} Result of the operation
   */
  async untrustCACertificate(certificatePem) {
    try {
      // Get current TLS config
      const response = await axios.get(`${this.apiUrl}/config/apps/tls`);
      const tlsConfig = response.data;
      
      // Remove CA certificate from root_ca_pool if present
      if (tlsConfig.root_ca_pool && tlsConfig.root_ca_pool.includes(certificatePem)) {
        tlsConfig.root_ca_pool = tlsConfig.root_ca_pool.filter(cert => cert !== certificatePem);
      }
      
      // Update TLS config
      await axios.patch(`${this.apiUrl}/config/apps/tls`, {
        root_ca_pool: tlsConfig.root_ca_pool
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return {
        success: true,
        message: 'CA certificate untrusted successfully'
      };
    } catch (error) {
      console.error('Failed to untrust CA certificate:', error);
      throw new Error(`Failed to untrust CA certificate: ${error.message}`);
    }
  }
  
  /**
   * Register an ACME account
   * @param {string} url - ACME directory URL
   * @param {string} email - Email for ACME account
   * @returns {Promise<string>} ACME account ID
   */
  async registerACMEAccount(url, email) {
    try {
      const payload = {
        ca: url,
        email: email
      };
      
      const response = await axios.post(`${this.apiUrl}/acme/accounts`, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Extract account ID from response
      const accountId = response.data.id;
      
      return accountId;
    } catch (error) {
      console.error('Failed to register ACME account:', error);
      throw new Error(`Failed to register ACME account: ${error.message}`);
    }
  }
  
  /**
   * Parse certificate information
   * @param {string} certificatePem - PEM-encoded certificate
   * @returns {Object} Certificate information
   */
  parseCertificateInfo(certificatePem) {
    try {
      // Create temporary file for certificate
      const certPath = path.join(this.tempDir, `cert_${Date.now()}.pem`);
      fs.writeFileSync(certPath, certificatePem);
      
      // Use OpenSSL to get certificate information
      const output = execSync(`openssl x509 -in "${certPath}" -noout -text`).toString();
      
      // Parse issuer
      const issuerMatch = output.match(/Issuer: (.+)/);
      const issuer = issuerMatch ? issuerMatch[1] : 'Unknown';
      
      // Parse validity dates
      const validFromMatch = output.match(/Not Before: (.+)/);
      const validToMatch = output.match(/Not After : (.+)/);
      
      const validFrom = validFromMatch ? new Date(validFromMatch[1]) : new Date();
      const validTo = validToMatch ? new Date(validToMatch[1]) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      
      // Clean up
      fs.unlinkSync(certPath);
      
      return {
        issuer,
        validFrom,
        validTo
      };
    } catch (error) {
      console.error('Failed to parse certificate information:', error);
      
      // Return default values if parsing fails
      return {
        issuer: 'Unknown',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      };
    }
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
