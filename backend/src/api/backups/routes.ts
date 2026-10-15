import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import multer from 'multer';
import { backupService, BackupFormatError } from '../../services/backupService';
import { ProxyImportError } from '../../utils/proxyImport';
import { authMiddleware, roleMiddleware, requireApiKeyPermission } from '../../middleware/auth';

export const router = express.Router();

/** The signed-in user, as the backup service reads it (authMiddleware has set it) */
const currentUser = (req: Request): { id: string } => req.user as { id: string };

// Rate-limit mutating backup operations to prevent resource exhaustion.
// Restore writes to disk and re-loads Caddy config; allow 3 per minute.
const backupMutationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many backup operations, please try again later' }
});

// Uploads are larger but not destructive: their own, looser allowance
const backupUploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many backup uploads, please try again later' }
});

/**
 * @swagger
 * tags:
 *   name: Backups
 *   description: Configuration backup management (admin only)
 *
 * /backups:
 *   get:
 *     summary: List all backups
 *     tags: [Backups]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array of backup metadata objects
 *       401:
 *         $ref: '#/components/schemas/Error'
 *       403:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', [authMiddleware, roleMiddleware('admin')], async (_req: Request, res: Response) => {
  try {
    const backups = await backupService.getBackups();
    
    res.status(200).json({
      success: true,
      backups
    });
  } catch (error) {
    console.error('Get backups error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving backups' 
    });
  }
});

/**
 * @swagger
 * /backups:
 *   post:
 *     summary: Create a new backup
 *     tags: [Backups]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       201:
 *         description: Backup created
 *       401:
 *         $ref: '#/components/schemas/Error'
 *       403:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/', [backupMutationRateLimit, authMiddleware, roleMiddleware('admin')], async (req: Request, res: Response) => {
  try {
    const result = await backupService.createBackup(currentUser(req));
    
    res.status(201).json({
      success: true,
      backup: result.backup
    });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during backup creation' 
    });
  }
});

/**
 * @swagger
 * /backups/{id}:
 *   get:
 *     summary: Download a backup file
 *     tags: [Backups]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Backup JSON file download
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/:id', [authMiddleware, roleMiddleware('admin')], async (req: Request<{ id: string }>, res: Response) => {
  try {
    const result = await backupService.getBackupFile(req.params.id);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.backup.filename}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(result.filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Get backup file error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving backup file' 
    });
  }
});

/**
 * @swagger
 * /backups/{id}/restore:
 *   post:
 *     summary: Restore configuration from a backup
 *     tags: [Backups]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Backup restored successfully
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/:id/restore', [backupMutationRateLimit, authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('admin')], async (req: Request<{ id: string }>, res: Response) => {
  try {
    const result = await backupService.restoreBackup(req.params.id, currentUser(req));

    res.status(200).json({
      success: true,
      message: result.message,
      result
    });
  } catch (error) {
    if (error instanceof ProxyImportError) {
      return res.status(400).json({ success: false, message: error.message, errors: error.errors });
    }
    console.error('Restore backup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during backup restoration' 
    });
  }
});

/**
 * @swagger
 * /backups/{id}:
 *   delete:
 *     summary: Delete a backup
 *     tags: [Backups]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Backup deleted
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', [authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('admin')], async (req: Request<{ id: string }>, res: Response) => {
  try {
    await backupService.deleteBackup(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'Backup deleted successfully'
    });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during backup deletion' 
    });
  }
});

/**
 * @swagger
 * /backups/upload:
 *   post:
 *     summary: Upload a backup file
 *     description: >
 *       Adds a backup made by this or another installation (multipart field "file", JSON or an
 *       encrypted backup; the key must match BACKUP_ENCRYPTION_KEY). The content is validated like a
 *       restore would, then stored; restore it with POST /backups/{id}/restore. The size limit is
 *       BACKUP_UPLOAD_MAX_MB (default 50).
 *     tags: [Backups]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Backup stored
 *       400:
 *         description: Not a usable backup
 *       413:
 *         description: File too large
 */
const maxUploadBytes = (): number => (Number(process.env.BACKUP_UPLOAD_MAX_MB) || 50) * 1024 * 1024;

router.post('/upload', [backupUploadRateLimit, authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('admin')], (req: Request, res: Response) => {
  const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes(), files: 1, fields: 5 } }).single('file');

  receive(req, res, async (uploadError?: unknown) => {
    if (uploadError instanceof multer.MulterError) {
      const tooLarge = uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        message: tooLarge ? 'Backup file is too large' : `Upload rejected: ${uploadError.message}`
      });
    }
    if (uploadError) {
      console.error('Backup upload error:', uploadError);
      return res.status(400).json({ success: false, message: 'Upload could not be read' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Send the backup as the multipart field "file"' });
    }

    try {
      const result = await backupService.importBackup(req.file.buffer, currentUser(req));
      res.status(201).json({ success: true, message: 'Backup uploaded', backup: result.backup });
    } catch (error) {
      if (error instanceof ProxyImportError) {
        return res.status(400).json({ success: false, message: error.message, errors: error.errors });
      }
      if (error instanceof BackupFormatError) {
        return res.status(400).json({ success: false, message: error.message });
      }
      console.error('Backup upload error:', error);
      res.status(500).json({ success: false, message: 'Server error during backup upload' });
    }
  });
});
