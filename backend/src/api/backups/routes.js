const express = require('express');
const backupService = require('../../services/backupService');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const fs = require('fs');
const path = require('path');
const router = express.Router();

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
router.get('/', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
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
router.post('/', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const result = await backupService.createBackup(req.user);
    
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
router.get('/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const result = await backupService.getBackupFile(req.params.id);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${result.backup.filename}`);
    
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
router.post('/:id/restore', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const result = await backupService.restoreBackup(req.params.id, req.user);
    
    res.status(200).json({
      success: true,
      message: 'Backup restored successfully',
      result
    });
  } catch (error) {
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
router.delete('/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const result = await backupService.deleteBackup(req.params.id);
    
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
 *     summary: Upload a backup file (not yet implemented)
 *     tags: [Backups]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       501:
 *         description: Not implemented
 */
router.post('/upload', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  // This would require a file upload middleware like multer
  // For now, we'll just return a not implemented response
  res.status(501).json({
    success: false,
    message: 'Backup upload not implemented yet'
  });
});

module.exports = router;
