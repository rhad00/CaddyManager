import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { Op, type CreationAttributes } from 'sequelize';
import {
  sequelize,
  User,
  Proxy,
  Header,
  Middleware,
  Template,
  Backup
} from '../models';
import { prepareImportedProxies, ProxyImportError } from '../utils/proxyImport';
import type { TemplateHeader, TemplateMiddleware } from '../models/template';
import { caddyService } from './caddyService';
import { errorMessage } from '../utils/errorMessage';

const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);
dotenv.config();

/** What a backup file holds once parsed (the proxies are validated by prepareImportedProxies) */
interface BackupFile {
  version?: string;
  timestamp?: string;
  proxies?: unknown;
  templates?: Array<{
    name: string;
    description: string | null;
    headers: TemplateHeader[];
    middleware: TemplateMiddleware[];
  }>;
}

/** The user a backup is made or restored for (a token may carry only the id) */
interface BackupUser {
  id?: string;
}

/** An uploaded backup that cannot be used (unreadable, wrong key, wrong format): the client's mistake */
export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

export interface CreateBackupResult {
  success: boolean;
  backup: Backup;
  filePath: string;
}

export interface RestoreBackupResult {
  success: boolean;
  message: string;
  caddy: { applied: boolean; error?: string };
  timestamp: string;
}

// ── Encryption helpers ────────────────────────────────────────────────────────
const ENCRYPTION_ALGO = 'aes-256-gcm';

function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
  if (!keyHex) return null;
  const normalizedKey = keyHex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }

  return Buffer.from(normalizedKey, 'hex');
}

function encryptBuffer(plainBuf: Buffer): { encrypted: boolean; data: Buffer } {
  const key = getEncryptionKey();
  if (!key) return { encrypted: false, data: plainBuf };
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const cipherBuf = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: 4-byte magic "CMEK" + 16-byte IV + 16-byte authTag + ciphertext
  const header = Buffer.alloc(4);
  header.write('CMEK');
  return { encrypted: true, data: Buffer.concat([header, iv, authTag, cipherBuf]) };
}

function decryptBuffer(buf: Buffer): Buffer {
  if (buf.length < 4 || buf.subarray(0, 4).toString() !== 'CMEK') {
    // Not encrypted — return as-is
    return buf;
  }
  const key = getEncryptionKey();
  if (!key) throw new Error('BACKUP_ENCRYPTION_KEY is required to decrypt this backup');
  const iv = buf.subarray(4, 20);
  const authTag = buf.subarray(20, 36);
  const cipherBuf = buf.subarray(36);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
}

/**
 * Service for backup and restore functionality
 */
export class BackupService {
  backupDir: string;

  constructor() {
    this.backupDir = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
    
    // Ensure backup directory exists
    this.ensureBackupDir();
  }
  
  /**
   * Ensure backup directory exists
   */
  async ensureBackupDir(): Promise<void> {
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
   * @param user - User creating the backup
   * @param backupType - Type of backup
   * @returns Backup information
   */
  async createBackup(user: BackupUser | null, backupType: 'auto' | 'manual' = 'manual'): Promise<CreateBackupResult> {
    try {
      // Ensure backup directory exists
      await this.ensureBackupDir();
      
      // Generate backup filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = getEncryptionKey() ? '.json.enc' : '.json';
      const filename = `backup-${timestamp}${extension}`;
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
          const proxyData = proxy.toJSON() as unknown as Record<string, unknown>;
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
      
      // Write backup file (optionally encrypted)
      const jsonBuf = Buffer.from(JSON.stringify(backupData, null, 2));
      const { data: fileData } = encryptBuffer(jsonBuf);
      await writeFileAsync(filePath, fileData);
      
      // Get file size
      const stats = fs.statSync(filePath);
      
      // Resolve actual user ID from DB if possible (token may contain minimal data)
      let creatorId: string | null = null;
      try {
        if (user && user.id) {
          const dbUser = await User.findByPk(user.id);
          if (dbUser) {
            creatorId = dbUser.id;
          }
        }
      } catch (err) {
        console.error('Failed to resolve user for backup record:', errorMessage(err));
      }

      // Create backup record in database
      const backup = await Backup.create({
        filename,
        size: stats.size,
        backup_type: backupType,
        status: 'complete',
        created_by: creatorId
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
        try {
          const dbUser = await User.findByPk(user.id);
          const creatorId = dbUser ? dbUser.id : null;

          await Backup.create({
            filename: `failed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
            size: 0,
            backup_type: backupType,
            status: 'failed',
            created_by: creatorId
          });
        } catch (err) {
          console.error('Failed to create failed backup record:', errorMessage(err));
        }
      }
      
      throw new Error(`Backup creation failed: ${errorMessage(error)}`);
    }
  }
  
  /**
   * Store an uploaded backup as a backup of this installation. The content is checked the way a
   * restore checks it (format, and every proxy against the API rules), so a file that would fail
   * to restore is refused now. It is stored under a generated name and, if a key is set,
   * encrypted with this installation's key.
   * @param content - the uploaded file, plain JSON or an encrypted backup
   * @throws BackupFormatError | ProxyImportError when the file is not usable
   */
  async importBackup(content: Buffer, user: BackupUser | null): Promise<CreateBackupResult> {
    let backupData: BackupFile;
    try {
      backupData = JSON.parse(decryptBuffer(content).toString('utf8')) as BackupFile;
    } catch (error) {
      const message = errorMessage(error);
      if (/BACKUP_ENCRYPTION_KEY/.test(message)) throw new BackupFormatError(message);
      throw new BackupFormatError('The file is not a readable backup (not JSON, or encrypted with a different key)');
    }
    if (!backupData || typeof backupData !== 'object' || !backupData.version
      || !Array.isArray(backupData.proxies) || !Array.isArray(backupData.templates)) {
      throw new BackupFormatError('Invalid backup file format: version, proxies and templates are required');
    }
    await prepareImportedProxies(backupData.proxies);

    await this.ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const { data } = encryptBuffer(Buffer.from(JSON.stringify(backupData, null, 2)));
    const filename = `backup-${timestamp}-uploaded${getEncryptionKey() ? '.json.enc' : '.json'}`;
    const filePath = path.join(this.backupDir, filename);
    await writeFileAsync(filePath, data);

    const dbUser = user && user.id ? await User.findByPk(user.id) : null;
    const backup = await Backup.create({
      filename,
      size: data.length,
      backup_type: 'manual',
      status: 'complete',
      created_by: dbUser ? dbUser.id : null
    });
    return { success: true, backup, filePath };
  }

  /**
   * Restore configuration from a backup file
   * @param backupId - ID of the backup to restore
   * @param user - User performing the restore
   * @returns Restore result
   */
  async restoreBackup(backupId: string, user: { id: string }): Promise<RestoreBackupResult> {
    const transaction = await sequelize.transaction();
    
    try {
      // Find backup record
      const backup = await Backup.findByPk(backupId);
      
      if (!backup) {
        throw new Error('Backup not found');
      }

      // Validate filename to prevent path traversal.  The filename is stored
      // in the DB, but DB values should never be trusted implicitly for path
      // operations — an attacker with DB write access could otherwise read or
      // overwrite arbitrary files on the host.
      const SAFE_BACKUP_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
      if (!SAFE_BACKUP_FILENAME.test(backup.filename)) {
        throw new Error('Backup record has an invalid filename and cannot be restored safely');
      }
      const resolvedPath = path.resolve(this.backupDir, backup.filename);
      const resolvedDir = path.resolve(this.backupDir);
      if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
        throw new Error('Backup path traversal detected — restore aborted');
      }
      
      // Read backup file (decrypt if necessary)
      const filePath = resolvedPath;
      const rawBuf = await readFileAsync(filePath);
      const plainBuf = decryptBuffer(rawBuf);
      const backupData = JSON.parse(plainBuf.toString('utf8')) as BackupFile;
      
      // Validate backup data
      if (!backupData.version || !backupData.proxies || !backupData.templates) {
        throw new Error('Invalid backup file format');
      }

      // Same validation and field whitelist as the API, before anything is deleted
      const proxies = await prepareImportedProxies(backupData.proxies);

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
      for (const { fields, headers, middlewares } of proxies) {
        const proxy = await Proxy.create({ ...fields, created_by: user.id } as CreationAttributes<Proxy>, { transaction });

        for (const header of headers) {
          await Header.create({ ...header, proxy_id: proxy.id } as CreationAttributes<Header>, { transaction });
        }

        for (const middleware of middlewares) {
          await Middleware.create({ ...middleware, proxy_id: proxy.id } as CreationAttributes<Middleware>, { transaction });
        }
      }

      // Commit transaction
      await transaction.commit();

      // Push the restored proxies to Caddy. The restore itself stands either way; a
      // failure here is reported so the admin can retry once Caddy is reachable.
      let caddy: RestoreBackupResult['caddy'] = { applied: true };
      try {
        await caddyService.rebuildConfigFromDatabase();
      } catch (caddyError) {
        console.error('Restored backup could not be applied to Caddy:', caddyError);
        caddy = { applied: false, error: errorMessage(caddyError) };
      }

      return {
        success: true,
        message: caddy.applied
          ? 'Backup restored successfully'
          : 'Backup restored, but applying it to Caddy failed',
        caddy,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      // Roll back unless the error happened after the commit
      if (!transaction.finished) await transaction.rollback();
      console.error('Restore failed:', error);
      // Keep the type so the API can answer 400 with the invalid entries
      if (error instanceof ProxyImportError) throw error;
      throw new Error(`Restore failed: ${errorMessage(error)}`);
    }
  }
  
  /**
   * Get list of available backups
   * @returns List of backups
   */
  async getBackups(): Promise<Backup[]> {
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
      throw new Error(`Failed to get backups: ${errorMessage(error)}`);
    }
  }
  
  /**
   * Get a specific backup file
   * @param backupId - ID of the backup
   * @returns Backup file information
   */
  async getBackupFile(backupId: string): Promise<CreateBackupResult> {
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
      throw new Error(`Failed to get backup file: ${errorMessage(error)}`);
    }
  }
  
  /**
   * Delete a backup
   * @param backupId - ID of the backup to delete
   * @returns Delete result
   */
  async deleteBackup(backupId: string): Promise<{ success: boolean; message: string }> {
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
      throw new Error(`Failed to delete backup: ${errorMessage(error)}`);
    }
  }
  
  /**
   * Delete backups older than BACKUP_RETENTION_DAYS (default 30).
   * Only deletes auto backups; manual backups are kept unless retain_days=0.
   */
  async enforceRetention(): Promise<void> {
    const retainDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
    if (!retainDays || retainDays <= 0) return; // 0 = disabled

    const cutoff = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000);

    const old = await Backup.findAll({
      where: {
        backup_type: 'auto',
        createdAt: { [Op.lt]: cutoff },
      },
    });

    for (const backup of old) {
      try {
        const filePath = path.join(this.backupDir, backup.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await backup.destroy();
        console.log(`Retention: deleted old backup ${backup.filename}`);
      } catch (err) {
        console.error(`Retention: failed to delete backup ${backup.filename}:`, errorMessage(err));
      }
    }
  }

  /**
   * Schedule automatic backups
   * @param intervalHours - Interval in hours between backups
   */
  scheduleAutoBackups(intervalHours = 24): void {
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
        // Enforce retention policy after each auto backup
        await this.enforceRetention();
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

export const backupService = new BackupService();
