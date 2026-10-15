import express, { type Request, type Response } from 'express';
import fs from 'fs';
import { Certificate, CertificateAuthority } from '../../models';
import { certificateService } from '../../services/certificateService';
import { authMiddleware, roleMiddleware } from '../../middleware/auth';
import { certificateUploadLimiter } from '../../middleware/rateLimiter';
import { logAction } from '../../services/auditService';
import { currentUser } from '../../utils/requestUser';
import { errorMessage } from '../../utils/errorMessage';
import { CertificateError, toCertificateResponse } from '../../utils/certificates';
import multer from 'multer';
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 1024 * 1024, // 1MB per file
    files: 2,
    fields: 10,
    parts: 12,
    fieldNameSize: 100,
    fieldSize: 16 * 1024,
  }
});

export const router = express.Router();

const cleanupUploadedFiles = async (filePaths?: Array<string | undefined>): Promise<void> => {
  await Promise.all((filePaths || []).filter((filePath): filePath is string => Boolean(filePath)).map(async (filePath) => {
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore cleanup errors for already-removed temp files.
    }
  }));
};

/**
 * Validate PEM file content
 * @param filePath - Path to the uploaded file
 * @param expectedType - Expected PEM type ('CERTIFICATE' or 'PRIVATE KEY')
 */
const validatePemFile = (filePath: string, expectedType: 'CERTIFICATE' | 'PRIVATE KEY'): { valid: boolean; message?: string } => {
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
 * @swagger
 * tags:
 *   name: Certificates
 *   description: TLS certificate management
 *
 * /certificates:
 *   get:
 *     summary: List all certificates
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array of certificate objects
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
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
 * @swagger
 * /certificates/{id}:
 *   get:
 *     summary: Get certificate details
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Certificate object
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
/**
 * @swagger
 * /certificates/domains/{domain}:
 *   get:
 *     summary: Get certificates covering a specific domain
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of matching certificates
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/domains/:domain', authMiddleware, async (req: Request<{ domain: string }>, res: Response) => {
  try {
    const domain = /** @type {string} */ (req.params.domain); // a named route parameter is always a single string
    const certificates = await certificateService.getCertificatesForDomain(domain);

    res.status(200).json({
      success: true,
      certificates: certificates.map(toCertificateResponse)
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
 * @swagger
 * /certificates/upload:
 *   post:
 *     summary: Upload a custom certificate and private key
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [certificate, privateKey, name, domains]
 *             properties:
 *               certificate:
 *                 type: string
 *                 format: binary
 *               privateKey:
 *                 type: string
 *                 format: binary
 *               name: { type: string }
 *               domains: { type: string }
 *     responses:
 *       201:
 *         description: Certificate uploaded
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/upload', [authMiddleware, roleMiddleware('admin'), certificateUploadLimiter, upload.fields([
  { name: 'certificate', maxCount: 1 },
  { name: 'privateKey', maxCount: 1 }
])], async (req: Request, res: Response) => {
  const uploaded = req.files as { certificate?: Express.Multer.File[]; privateKey?: Express.Multer.File[] } | undefined;
  const uploadedFilePaths = [
    uploaded?.certificate?.[0]?.path,
    uploaded?.privateKey?.[0]?.path
  ];

  try {
    if (!uploaded || !uploaded.certificate || !uploaded.privateKey) {
      return res.status(400).json({
        success: false,
        message: 'Certificate and private key files are required'
      });
    }
    
    // domains is optional: it defaults to the certificate's DNS names
    const { name, domains } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    // Validate PEM format of uploaded files
    const certValidation = validatePemFile(uploaded.certificate[0].path, 'CERTIFICATE');
    if (!certValidation.valid) {
      return res.status(400).json({ success: false, message: certValidation.message });
    }
    const keyValidation = validatePemFile(uploaded.privateKey[0].path, 'PRIVATE KEY');
    if (!keyValidation.valid) {
      return res.status(400).json({ success: false, message: keyValidation.message });
    }

    const result = await certificateService.uploadCertificate(
      name,
      domains,
      uploaded.certificate[0].path,
      uploaded.privateKey[0].path,
      (currentUser(req).id as string) || null
    );
    
    // Log certificate upload
    await logAction({
      userId: currentUser(req).id,
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
      certificate: toCertificateResponse(result)
    });
  } catch (error) {
    console.error('Upload certificate error:', error);
    if (error instanceof CertificateError) {
      return res.status(400).json({ success: false, message: errorMessage(error) });
    }
    res.status(500).json({
      success: false, 
      message: 'Server error while uploading certificate' 
    });
  } finally {
    await cleanupUploadedFiles(uploadedFilePaths);
  }
});

/**
 * @swagger
 * /certificates/{id}:
 *   delete:
 *     summary: Delete a certificate
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Certificate deleted
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', [authMiddleware, roleMiddleware('admin')], async (req: Request<{ id: string }>, res: Response) => {
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
      userId: currentUser(req).id,
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
 * @swagger
 * /certificates/generate:
 *   post:
 *     summary: Generate a self-signed certificate
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, domains]
 *             properties:
 *               name: { type: string }
 *               domains:
 *                 type: array
 *                 items: { type: string }
 *               validityDays: { type: integer, default: 365 }
 *     responses:
 *       201:
 *         description: Self-signed certificate generated
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/generate', [authMiddleware, roleMiddleware('admin')], async (req: Request, res: Response) => {
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
      validityDays || 365,
      (currentUser(req).id as string) || null
    );
    
    // Log certificate generation
    await logAction({
      userId: currentUser(req).id,
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
      certificate: toCertificateResponse(result)
    });
  } catch (error) {
    console.error('Generate certificate error:', error);
    if (error instanceof CertificateError) {
      return res.status(400).json({ success: false, message: errorMessage(error) });
    }
    res.status(500).json({
      success: false, 
      message: 'Server error while generating certificate' 
    });
  }
});

/**
 * @swagger
 * /certificates/{id}/renew:
 *   post:
 *     summary: Renew a certificate
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Certificate renewed
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/:id/renew', [authMiddleware, roleMiddleware('admin')], async (req: Request<{ id: string }>, res: Response) => {
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
      userId: currentUser(req).id,
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
      message: result.message,
      result
    });
  } catch (error) {
    console.error('Renew certificate error:', error);
    if (error instanceof CertificateError) {
      return res.status(400).json({ success: false, message: errorMessage(error) });
    }
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
router.get('/cas', authMiddleware, async (req: Request, res: Response) => {
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
router.post('/cas', [authMiddleware, roleMiddleware('admin'), upload.single('certificate')], async (req: Request, res: Response) => {
  const uploadedFilePath = req.file?.path;

  try {
    const { name, type, url, email, trusted } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Name and type are required'
      });
    }

    // Only custom CAs carry a certificate file; ACME CAs are a directory URL + email
    if (req.file) {
      const caValidation = validatePemFile(req.file.path, 'CERTIFICATE');
      if (!caValidation.valid) {
        return res.status(400).json({ success: false, message: caValidation.message });
      }
    }

    const result = await certificateService.addCertificateAuthority(
      name,
      type,
      req.file ? req.file.path : null,
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
    if (error instanceof CertificateError) {
      return res.status(400).json({ success: false, message: errorMessage(error) });
    }
    res.status(500).json({
      success: false, 
      message: 'Server error while adding certificate authority' 
    });
  } finally {
    await cleanupUploadedFiles([uploadedFilePath]);
  }
});

/**
 * @route DELETE /api/certificates/cas/:id
 * @desc Remove a certificate authority
 * @access Private (Admin only)
 */
router.delete('/cas/:id', [authMiddleware, roleMiddleware('admin')], async (req: Request<{ id: string }>, res: Response) => {
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
router.put('/cas/:id/trust', [authMiddleware, roleMiddleware('admin')], async (req: Request<{ id: string }>, res: Response) => {
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
// Caddy's admin API has no ACME account endpoints; ACME accounts are created by Caddy
// itself from the issuer config. These routes previously proxied to non-existent
// endpoints and always failed (see MODERNIZATION.md 0.11e).
const acmeAccountsNotImplemented = (_req: Request, res: Response) => res.status(501).json({
  success: false,
  message: 'ACME accounts are managed by Caddy automatically; this endpoint is not implemented'
});
router.get('/acme/accounts', [authMiddleware, roleMiddleware('admin')], acmeAccountsNotImplemented);
router.post('/acme/accounts', [authMiddleware, roleMiddleware('admin')], acmeAccountsNotImplemented);
router.delete('/acme/accounts/:id', [authMiddleware, roleMiddleware('admin')], acmeAccountsNotImplemented);

/**
 * @swagger
 * /certificates/{id}:
 *   get:
 *     summary: Get certificate details
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Certificate object
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/:id', authMiddleware, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const certificate = await Certificate.findByPk(/** @type {string} */ (req.params.id), {
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
