const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);
const { 
  sequelize,
  User,
  Proxy,
  Header,
  Middleware,
  Template,
  Backup
} = require('../models');
require('dotenv').config();

/**
 * Service for backup and restore functionality
 */
class BackupService {
  constructor() {
    this.backupDir = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
    
    // Ensure backup directory exists
    this.ensureBackupDir();
  }
  
  /**
   * Ensure backup directory exists
   */
  async ensureBackupDir() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        await mkdirAsync(this.backupDir, { recursive: true });
        console.log(`Created backup directory: ${this.backupDir}`);
      }
    } catch (error) {
      console.error('Failed to create backup directory:', error);
    }
  }
  
  /**
   * Create a backup of the current configuration
   * @param {Object} user - User creating the backup
   * @param {String} backupType - Type of backup (auto or manual)
   * @returns {Promise<Object>} Backup information
   */
  async createBackup(user, backupType = 'manual') {
    try {
      // Ensure backup directory exists
      await this.ensureBackupDir();
      
      // Generate backup filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup-${timestamp}.json`;
      const filePath = path.join(this.backupDir, filename);
      
      // Fetch all configuration data
      const [proxies, templates] = await Promise.all([
        Proxy.findAll({
          include: [
            { model: Header, as: 'headers' },
            { model: Middleware, as: 'middlewares' }
          ]
        }),
        Template.findAll()
      ]);
      
      // Create backup data object
      const backupData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        proxies: proxies.map(proxy => {
          const proxyData = proxy.toJSON();
          // Include headers and middleware if available
          if (proxy.headers) {
            proxyData.headers = proxy.headers.map(header => header.toJSON());
          }
          if (proxy.middlewares) {
            proxyData.middlewares = proxy.middlewares.map(middleware => middleware.toJSON());
          }
          return proxyData;
        }),
        templates: templates.map(template => template.toJSON())
      };
      
      // Write backup file
      await writeFileAsync(filePath, JSON.stringify(backupData, null, 2));
      
      // Get file size
      const stats = fs.statSync(filePath);
      
      // Create backup record in database
      const backup = await Backup.create({
        filename,
        size: stats.size,
        backup_type: backupType,
        status: 'complete',
        created_by: user.id
      });
      
      return {
        success: true,
        backup,
        filePath
      };
    } catch (error) {
      console.error('Backup creation failed:', error);
      
      // Create failed backup record if user is provided
      if (user && user.id) {
        await Backup.create({
          filename: `failed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
          size: 0,
          backup_type: backupType,
          status: 'failed',
          created_by: user.id
        });
      }
      
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }
  
  /**
   * Restore configuration from a backup file
   * @param {String} backupId - ID of the backup to restore
   * @param {Object} user - User performing the restore
   * @returns {Promise<Object>} Restore result
   */
  async restoreBackup(backupId, user) {
    const transaction = await sequelize.transaction();
    
    try {
      // Find backup record
      const backup = await Backup.findByPk(backupId);
      
      if (!backup) {
        throw new Error('Backup not found');
      }
      
      // Read backup file
      const filePath = path.join(this.backupDir, backup.filename);
      const backupContent = await readFileAsync(filePath, 'utf8');
      const backupData = JSON.parse(backupContent);
      
      // Validate backup data
      if (!backupData.version || !backupData.proxies || !backupData.templates) {
        throw new Error('Invalid backup file format');
      }
      
      // Clear existing data
      await Promise.all([
        Header.destroy({ where: {}, transaction }),
        Middleware.destroy({ where: {}, transaction }),
        Proxy.destroy({ where: {}, transaction }),
        Template.destroy({ where: {}, transaction })
      ]);
      
      // Restore templates
      for (const templateData of backupData.templates) {
        await Template.create({
          name: templateData.name,
          description: templateData.description,
          headers: templateData.headers,
          middleware: templateData.middleware
        }, { transaction });
      }
      
      // Restore proxies and their related data
      for (const proxyData of backupData.proxies) {
        // Create proxy
        const proxy = await Proxy.create({
          name: proxyData.name,
          domains: proxyData.domains,
          upstream_url: proxyData.upstream_url,
          ssl_type: proxyData.ssl_type,
          http_to_https_redirect: proxyData.http_to_https_redirect,
          compression_enabled: proxyData.compression_enabled,
          status: proxyData.status,
          created_by: user.id
        }, { transaction });
        
        // Create headers if available
        if (proxyData.headers && Array.isArray(proxyData.headers)) {
          for (const headerData of proxyData.headers) {
            await Header.create({
              proxy_id: proxy.id,
              header_type: headerData.header_type,
              header_name: headerData.header_name,
              header_value: headerData.header_value,
              enabled: headerData.enabled
            }, { transaction });
          }
        }
        
        // Create middleware if available
        if (proxyData.middlewares && Array.isArray(proxyData.middlewares)) {
          for (const middlewareData of proxyData.middlewares) {
            await Middleware.create({
              proxy_id: proxy.id,
              middleware_type: middlewareData.middleware_type,
              configuration: middlewareData.configuration,
              enabled: middlewareData.enabled,
              order: middlewareData.order
            }, { transaction });
          }
        }
      }
      
      // Commit transaction
      await transaction.commit();
      
      return {
        success: true,
        message: 'Backup restored successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      console.error('Restore failed:', error);
      throw new Error(`Restore failed: ${error.message}`);
    }
  }
  
  /**
   * Get list of available backups
   * @returns {Promise<Array>} List of backups
   */
  async getBackups() {
    try {
      const backups = await Backup.findAll({
        include: [
          { model: User, as: 'creator', attributes: ['id', 'email'] }
        ],
        order: [['createdAt', 'DESC']]
      });
      
      return backups;
    } catch (error) {
      console.error('Failed to get backups:', error);
      throw new Error(`Failed to get backups: ${error.message}`);
    }
  }
  
  /**
   * Get a specific backup file
   * @param {String} backupId - ID of the backup
   * @returns {Promise<Object>} Backup file information
   */
  async getBackupFile(backupId) {
    try {
      const backup = await Backup.findByPk(backupId);
      
      if (!backup) {
        throw new Error('Backup not found');
      }
      
      const filePath = path.join(this.backupDir, backup.filename);
      
      if (!fs.existsSync(filePath)) {
        throw new Error('Backup file not found');
      }
      
      return {
        success: true,
        backup,
        filePath
      };
    } catch (error) {
      console.error('Failed to get backup file:', error);
      throw new Error(`Failed to get backup file: ${error.message}`);
    }
  }
  
  /**
   * Delete a backup
   * @param {String} backupId - ID of the backup to delete
   * @returns {Promise<Object>} Delete result
   */
  async deleteBackup(backupId) {
    try {
      const backup = await Backup.findByPk(backupId);
      
      if (!backup) {
        throw new Error('Backup not found');
      }
      
      const filePath = path.join(this.backupDir, backup.filename);
      
      // Delete file if it exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Delete database record
      await backup.destroy();
      
      return {
        success: true,
        message: 'Backup deleted successfully'
      };
    } catch (error) {
      console.error('Failed to delete backup:', error);
      throw new Error(`Failed to delete backup: ${error.message}`);
    }
  }
  
  /**
   * Schedule automatic backups
   * @param {Number} intervalHours - Interval in hours between backups
   */
  scheduleAutoBackups(intervalHours = 24) {
    // Get admin user for automatic backups
    const getAdminUser = async () => {
      try {
        return await User.findOne({ where: { role: 'admin' } });
      } catch (error) {
        console.error('Failed to get admin user for auto backup:', error);
        return null;
      }
    };
    
    // Create automatic backup
    const createAutoBackup = async () => {
      try {
        const adminUser = await getAdminUser();
        
        if (!adminUser) {
          console.error('No admin user found for automatic backup');
          return;
        }
        
        await this.createBackup(adminUser, 'auto');
        console.log('Automatic backup created successfully');
      } catch (error) {
        console.error('Automatic backup failed:', error);
      }
    };
    
    // Schedule backup at the specified interval
    const intervalMs = intervalHours * 60 * 60 * 1000;
    setInterval(createAutoBackup, intervalMs);
    
    console.log(`Automatic backups scheduled every ${intervalHours} hours`);
  }
}

module.exports = new BackupService();
