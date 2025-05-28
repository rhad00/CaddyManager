const express = require('express');
const backupService = require('../../services/backupService');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const fs = require('fs');
const path = require('path');
const router = express.Router();

/**
 * @route GET /api/backups
 * @desc Get all backups
 * @access Private (Admin only)
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
 * @route POST /api/backups
 * @desc Create a new backup
 * @access Private (Admin only)
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
      message: `Server error during backup creation: ${error.message}` 
    });
  }
});

/**
 * @route GET /api/backups/:id
 * @desc Download a backup file
 * @access Private (Admin only)
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
      message: `Server error while retrieving backup file: ${error.message}` 
    });
  }
});

/**
 * @route POST /api/backups/:id/restore
 * @desc Restore from a backup
 * @access Private (Admin only)
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
      message: `Server error during backup restoration: ${error.message}` 
    });
  }
});

/**
 * @route DELETE /api/backups/:id
 * @desc Delete a backup
 * @access Private (Admin only)
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
      message: `Server error during backup deletion: ${error.message}` 
    });
  }
});

/**
 * @route POST /api/backups/upload
 * @desc Upload a backup file
 * @access Private (Admin only)
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
