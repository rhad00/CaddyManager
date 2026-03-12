const express = require('express');
const fs = require('fs');
const { Certificate, CertificateAuthority } = require('../../models');
const certificateService = require('../../services/certificateService');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const { logAction } = require('../../services/auditService');
const multer = require('multer');
const upload = multer({ dest: 'uploads/', limits: { fileSize: 1024 * 1024 } }); // 1MB limit
const router = express.Router();

/**
 * Validate PEM file content
 * @param {string} filePath - Path to the uploaded file
 * @param {string} expectedType - Expected PEM type ('CERTIFICATE' or 'PRIVATE KEY' or 'RSA PRIVATE KEY')
 * @returns {{ valid: boolean, message?: string }}
 */
const validatePemFile = (filePath, expectedType) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    const validHeaders = expectedType === 'CERTIFICATE'
      ? ['-----BEGIN CERTIFICATE-----']
      : ['-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN EC PRIVATE KEY-----'];
    const validFooters = expectedType === 'CERTIFICATE'
      ? ['-----END CERTIFICATE-----']
      : ['-----END PRIVATE KEY-----', '-----END RSA PRIVATE KEY-----', '-----END EC PRIVATE KEY-----'];

    const hasValidHeader = validHeaders.some(h => content.includes(h));
    const hasValidFooter = validFooters.some(f => content.includes(f));

    if (!hasValidHeader || !hasValidFooter) {
      return { valid: false, message: `Invalid PEM format: expected ${expectedType}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, message: 'Unable to read uploaded file' };
  }
};

/**
 * @route GET /api/certificates
 * @desc Get all certificates
 * @access Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const certificates = await Certificate.findAll({
      attributes: { exclude: ['private_key_pem'] }
    });
    
    res.status(200).json({
      success: true,
      certificates
    });
  } catch (error) {
    console.error('Get certificates error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving certificates' 
    });
  }
});

/**
 * @route GET /api/certificates/:id
 * @desc Get certificate details
 * @access Private
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const certificate = await Certificate.findByPk(req.params.id, {
      attributes: { exclude: ['private_key_pem'] }
    });
    
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }
    
    res.status(200).json({
      success: true,
      certificate
    });
  } catch (error) {
    console.error('Get certificate error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving certificate' 
    });
  }
});

/**
 * @route GET /api/certificates/domains/:domain
 * @desc Get certificates for a specific domain
 * @access Private
 */
router.get('/domains/:domain', authMiddleware, async (req, res) => {
  try {
    const domain = req.params.domain;
    const certificates = await certificateService.getCertificatesForDomain(domain);
    
    res.status(200).json({
      success: true,
      certificates
    });
  } catch (error) {
    console.error('Get certificates for domain error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving certificates for domain' 
    });
  }
});

/**
 * @route POST /api/certificates/upload
 * @desc Upload custom certificate
 * @access Private (Admin only)
 */
router.post('/upload', [authMiddleware, roleMiddleware('admin'), upload.fields([
  { name: 'certificate', maxCount: 1 },
  { name: 'privateKey', maxCount: 1 }
])], async (req, res) => {
  try {
    if (!req.files || !req.files.certificate || !req.files.privateKey) {
      return res.status(400).json({
        success: false,
        message: 'Certificate and private key files are required'
      });
    }
    
    const { name, domains } = req.body;
    
    if (!name || !domains) {
      return res.status(400).json({
        success: false,
        message: 'Name and domains are required'
      });
    }

    // Validate PEM format of uploaded files
    const certValidation = validatePemFile(req.files.certificate[0].path, 'CERTIFICATE');
    if (!certValidation.valid) {
      return res.status(400).json({ success: false, message: certValidation.message });
    }
    const keyValidation = validatePemFile(req.files.privateKey[0].path, 'PRIVATE KEY');
    if (!keyValidation.valid) {
      return res.status(400).json({ success: false, message: keyValidation.message });
    }

    const result = await certificateService.uploadCertificate(
      name,
      domains,
      req.files.certificate[0].path,
      req.files.privateKey[0].path
    );
    
    // Log certificate upload
    await logAction({
      userId: req.user.id,
      action: 'CERTIFICATE_UPLOADED',
      resource: 'certificate',
      resourceId: result.id,
      details: {
        name,
        domains
      },
      status: 'success'
    }, req);
    
    res.status(201).json({
      success: true,
      message: 'Certificate uploaded successfully',
      certificate: result
    });
  } catch (error) {
    console.error('Upload certificate error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while uploading certificate' 
    });
  }
});

/**
 * @route DELETE /api/certificates/:id
 * @desc Delete a certificate
 * @access Private (Admin only)
 */
router.delete('/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const certificate = await Certificate.findByPk(req.params.id);
    
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }
    
    // Log certificate deletion
    await logAction({
      userId: req.user.id,
      action: 'CERTIFICATE_DELETED',
      resource: 'certificate',
      resourceId: certificate.id,
      details: {
        name: certificate.name,
        domains: certificate.domains
      },
      status: 'success'
    }, req);
    
    await certificateService.deleteCertificate(certificate);
    
    res.status(200).json({
      success: true,
      message: 'Certificate deleted successfully'
    });
  } catch (error) {
    console.error('Delete certificate error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting certificate' 
    });
  }
});

/**
 * @route POST /api/certificates/generate
 * @desc Generate a self-signed certificate
 * @access Private (Admin only)
 */
router.post('/generate', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const { name, domains, validityDays } = req.body;
    
    if (!name || !domains) {
      return res.status(400).json({
        success: false,
        message: 'Name and domains are required'
      });
    }
    
    const result = await certificateService.generateSelfSignedCertificate(
      name,
      domains,
      validityDays || 365
    );
    
    // Log certificate generation
    await logAction({
      userId: req.user.id,
      action: 'CERTIFICATE_GENERATED',
      resource: 'certificate',
      resourceId: result.id,
      details: {
        name,
        domains,
        type: 'self-signed',
        validityDays: validityDays || 365
      },
      status: 'success'
    }, req);
    
    res.status(201).json({
      success: true,
      message: 'Self-signed certificate generated successfully',
      certificate: result
    });
  } catch (error) {
    console.error('Generate certificate error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while generating certificate' 
    });
  }
});

/**
 * @route POST /api/certificates/:id/renew
 * @desc Renew a certificate
 * @access Private (Admin only)
 */
router.post('/:id/renew', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const certificate = await Certificate.findByPk(req.params.id);
    
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }
    
    const result = await certificateService.renewCertificate(certificate);
    
    // Log certificate renewal
    await logAction({
      userId: req.user.id,
      action: 'CERTIFICATE_RENEWED',
      resource: 'certificate',
      resourceId: certificate.id,
      details: {
        name: certificate.name,
        domains: certificate.domains
      },
      status: 'success'
    }, req);
    
    res.status(200).json({
      success: true,
      message: 'Certificate renewal initiated',
      result
    });
  } catch (error) {
    console.error('Renew certificate error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while renewing certificate' 
    });
  }
});

/**
 * @route GET /api/certificates/cas
 * @desc Get all certificate authorities
 * @access Private
 */
router.get('/cas', authMiddleware, async (req, res) => {
  try {
    const cas = await CertificateAuthority.findAll();
    
    res.status(200).json({
      success: true,
      cas
    });
  } catch (error) {
    console.error('Get CAs error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving certificate authorities' 
    });
  }
});

/**
 * @route POST /api/certificates/cas
 * @desc Add a custom certificate authority
 * @access Private (Admin only)
 */
router.post('/cas', [authMiddleware, roleMiddleware('admin'), upload.single('certificate')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CA certificate file is required'
      });
    }
    
    const { name, type, url, email, trusted } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Name and type are required'
      });
    }

    // Validate PEM format of CA certificate
    const caValidation = validatePemFile(req.file.path, 'CERTIFICATE');
    if (!caValidation.valid) {
      return res.status(400).json({ success: false, message: caValidation.message });
    }

    const result = await certificateService.addCertificateAuthority(
      name,
      type,
      req.file.path,
      url,
      email,
      trusted === 'true'
    );
    
    res.status(201).json({
      success: true,
      message: 'Certificate authority added successfully',
      ca: result
    });
  } catch (error) {
    console.error('Add CA error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while adding certificate authority' 
    });
  }
});

/**
 * @route DELETE /api/certificates/cas/:id
 * @desc Remove a certificate authority
 * @access Private (Admin only)
 */
router.delete('/cas/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const ca = await CertificateAuthority.findByPk(req.params.id);
    
    if (!ca) {
      return res.status(404).json({
        success: false,
        message: 'Certificate authority not found'
      });
    }
    
    await certificateService.deleteCertificateAuthority(ca);
    
    res.status(200).json({
      success: true,
      message: 'Certificate authority removed successfully'
    });
  } catch (error) {
    console.error('Delete CA error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while removing certificate authority' 
    });
  }
});

/**
 * @route PUT /api/certificates/cas/:id/trust
 * @desc Trust/untrust a certificate authority
 * @access Private (Admin only)
 */
router.put('/cas/:id/trust', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const ca = await CertificateAuthority.findByPk(req.params.id);
    
    if (!ca) {
      return res.status(404).json({
        success: false,
        message: 'Certificate authority not found'
      });
    }
    
    const { trusted } = req.body;
    
    if (trusted === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Trusted status is required'
      });
    }
    
    const result = await certificateService.updateCATrustStatus(ca, trusted);
    
    res.status(200).json({
      success: true,
      message: `Certificate authority ${trusted ? 'trusted' : 'untrusted'} successfully`,
      ca: result
    });
  } catch (error) {
    console.error('Update CA trust error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating certificate authority trust status' 
    });
  }
});

/**
 * @route GET /api/certificates/acme/accounts
 * @desc List ACME accounts
 * @access Private (Admin only)
 */
router.get('/acme/accounts', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const accounts = await certificateService.getACMEAccounts();
    
    res.status(200).json({
      success: true,
      accounts
    });
  } catch (error) {
    console.error('Get ACME accounts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving ACME accounts' 
    });
  }
});

/**
 * @route POST /api/certificates/acme/accounts
 * @desc Add an ACME account
 * @access Private (Admin only)
 */
router.post('/acme/accounts', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const { email, caId } = req.body;
    
    if (!email || !caId) {
      return res.status(400).json({
        success: false,
        message: 'Email and CA ID are required'
      });
    }
    
    const ca = await CertificateAuthority.findByPk(caId);
    
    if (!ca) {
      return res.status(404).json({
        success: false,
        message: 'Certificate authority not found'
      });
    }
    
    const result = await certificateService.addACMEAccount(email, ca);
    
    res.status(201).json({
      success: true,
      message: 'ACME account added successfully',
      account: result
    });
  } catch (error) {
    console.error('Add ACME account error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while adding ACME account' 
    });
  }
});

/**
 * @route DELETE /api/certificates/acme/accounts/:id
 * @desc Remove an ACME account
 * @access Private (Admin only)
 */
router.delete('/acme/accounts/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const result = await certificateService.deleteACMEAccount(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'ACME account removed successfully',
      result
    });
  } catch (error) {
    console.error('Delete ACME account error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while removing ACME account' 
    });
  }
});

module.exports = router;
