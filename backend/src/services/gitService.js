const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const winston = require('winston');
const { GitRepository, ConfigChange, Proxy, Header, Middleware } = require('../models');

// Create logger for this service
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class GitService {
  constructor() {
    this.repoDir = process.env.GIT_REPO_DIR || path.join(__dirname, '../../git-repos');
    this.algorithm = 'aes-256-gcm';
    // Use provided secret or generate one (should be consistent across restarts)
    this.secretKey = process.env.GIT_SECRET_KEY
      ? Buffer.from(process.env.GIT_SECRET_KEY, 'hex')
      : crypto.randomBytes(32);

    this.initialized = false;
  }

  /**
   * Initialize Git service on startup
   */
  async initialize() {
    try {
      await fs.mkdir(this.repoDir, { recursive: true });
      logger.info(`[GitService] Git repository directory: ${this.repoDir}`);

      // Warn if no secret key is set
      if (!process.env.GIT_SECRET_KEY) {
        logger.warn('[GitService] GIT_SECRET_KEY not set. Using random key (tokens will not persist across restarts)');
        logger.warn('[GitService] Set GIT_SECRET_KEY in environment for production use');
      }

      // Start auto-sync for enabled repos
      const repos = await GitRepository.findAll({
        where: { enabled: true, auto_sync: true }
      });

      for (const repo of repos) {
        this.startAutoSync(repo);
      }

      this.initialized = true;
      logger.info(`[GitService] Initialized with ${repos.length} auto-sync repositories`);
    } catch (error) {
      logger.error('[GitService] Initialization error:', error);
    }
  }

  /**
   * Encrypt sensitive data (tokens, SSH keys)
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error('[GitService] Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encrypted) {
    try {
      const parts = encrypted.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = parts[2];

      const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      logger.error('[GitService] Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Get local repository path
   */
  getRepoPath(repoId) {
    return path.join(this.repoDir, repoId);
  }

  /**
   * Add authentication to Git URL
   */
  addAuthToUrl(gitRepo) {
    try {
      const url = new URL(gitRepo.repository_url);

      if (gitRepo.access_token) {
        const token = this.decrypt(gitRepo.access_token);

        // GitHub/GitLab use token as username
        if (gitRepo.provider === 'github' || gitRepo.provider === 'gitlab') {
          url.username = token;
          url.password = 'x-oauth-basic';
        } else if (gitRepo.provider === 'gitea') {
          url.username = token;
          url.password = '';
        } else {
          // Bitbucket and others
          url.username = 'x-token-auth';
          url.password = token;
        }
      }

      return url.toString();
    } catch (error) {
      logger.error('[GitService] Error adding auth to URL:', error);
      throw error;
    }
  }

  /**
   * Clone or update repository
   */
  async cloneOrUpdateRepo(gitRepo) {
    const repoPath = this.getRepoPath(gitRepo.id);
    const git = simpleGit();

    try {
      const exists = await fs.access(repoPath).then(() => true).catch(() => false);

      if (!exists) {
        logger.info(`[GitService] Cloning repository: ${gitRepo.repository_url}`);

        const urlWithAuth = this.addAuthToUrl(gitRepo);
        await git.clone(urlWithAuth, repoPath, ['--branch', gitRepo.branch]);

        logger.info(`[GitService] Repository cloned to ${repoPath}`);
      } else {
        logger.info(`[GitService] Updating repository: ${gitRepo.name}`);

        const repoGit = simpleGit(repoPath);
        await repoGit.pull('origin', gitRepo.branch);

        logger.info('[GitService] Repository updated');
      }

      gitRepo.last_sync = new Date();
      await gitRepo.save();

      return repoPath;
    } catch (error) {
      logger.error(`[GitService] Error cloning/updating repo:`, error);
      throw error;
    }
  }

  /**
   * Export current CaddyManager configuration to files
   */
  async exportConfigToFile(repoPath) {
    try {
      const configDir = path.join(repoPath, 'config');
      await fs.mkdir(configDir, { recursive: true });

      // Export proxies with all related data
      const proxies = await Proxy.findAll({
        include: [
          { model: Header, as: 'headers' },
          { model: Middleware, as: 'middlewares' }
        ]
      });

      // Convert to plain objects
      const proxiesData = proxies.map(p => p.toJSON());

      // Export as JSON
      const proxiesJson = JSON.stringify(proxiesData, null, 2);
      await fs.writeFile(path.join(configDir, 'proxies.json'), proxiesJson);

      // Export as YAML (more human-readable)
      const proxiesYaml = yaml.dump(proxiesData);
      await fs.writeFile(path.join(configDir, 'proxies.yaml'), proxiesYaml);

      // Export Caddy config
      const caddyService = require('./caddyService');
      const caddyConfig = await caddyService.getCaddyConfig();
      await fs.writeFile(
        path.join(configDir, 'caddy.json'),
        JSON.stringify(caddyConfig, null, 2)
      );

      // Export metadata
      const metadata = {
        exported_at: new Date().toISOString(),
        version: require('../../package.json').version,
        proxy_count: proxies.length
      };
      await fs.writeFile(
        path.join(configDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      logger.info(`[GitService] Exported ${proxies.length} proxies to ${configDir}`);
    } catch (error) {
      logger.error('[GitService] Error exporting config:', error);
      throw error;
    }
  }

  /**
   * Generate commit message from template
   */
  generateCommitMessage(gitRepo, changeType, resourceType, oldValues, newValues) {
    const template = gitRepo.commit_message_template;

    let changes = '';
    if (changeType === 'proxy_create') {
      changes = `Created proxy: ${newValues.name}\nDomains: ${newValues.domains.join(', ')}`;
    } else if (changeType === 'proxy_update') {
      changes = `Updated proxy: ${newValues.name}`;
      if (oldValues && oldValues.domains !== newValues.domains) {
        changes += `\nDomains: ${oldValues.domains.join(', ')} → ${newValues.domains.join(', ')}`;
      }
      if (oldValues && oldValues.upstream_url !== newValues.upstream_url) {
        changes += `\nUpstream: ${oldValues.upstream_url} → ${newValues.upstream_url}`;
      }
    } else if (changeType === 'proxy_delete') {
      changes = `Deleted proxy: ${oldValues.name}`;
    } else if (changeType === 'template_apply') {
      changes = `Applied template to proxy: ${newValues.name}`;
    } else if (changeType === 'backup_restore') {
      changes = `Restored configuration from backup`;
    } else {
      changes = `Configuration change: ${changeType}`;
    }

    return template.replace('{{changes}}', changes);
  }

  /**
   * Commit configuration changes to Git
   */
  async commitConfigChange(gitRepoId, changeType, resourceType, resourceId, userId, oldValues, newValues) {
    try {
      const gitRepo = await GitRepository.findByPk(gitRepoId);
      if (!gitRepo || !gitRepo.enabled || !gitRepo.auto_commit) {
        logger.debug('[GitService] Skipping commit: repo not configured for auto-commit');
        return null;
      }

      const repoPath = await this.cloneOrUpdateRepo(gitRepo);
      const git = simpleGit(repoPath);

      // Export current configuration to files
      await this.exportConfigToFile(repoPath);

      // Check if there are changes
      const status = await git.status();
      if (status.files.length === 0) {
        logger.debug('[GitService] No changes to commit');
        return null;
      }

      // Generate diff before staging
      const diffResult = await git.diff();

      // Generate commit message
      const commitMessage = this.generateCommitMessage(
        gitRepo,
        changeType,
        resourceType,
        oldValues,
        newValues
      );

      // Configure git user
      await git.addConfig('user.name', 'CaddyManager');
      await git.addConfig('user.email', 'noreply@caddymanager.local');

      // Commit and push
      await git.add('.');
      await git.commit(commitMessage);

      const urlWithAuth = this.addAuthToUrl(gitRepo);
      await git.push(urlWithAuth, gitRepo.branch);

      // Get commit SHA
      const log = await git.log(['-1']);
      const commitSha = log.latest.hash;

      // Record change in database
      const configChange = await ConfigChange.create({
        git_repository_id: gitRepo.id,
        change_type: changeType,
        resource_type: resourceType,
        resource_id: resourceId,
        user_id: userId,
        commit_sha: commitSha,
        commit_message: commitMessage,
        diff: diffResult,
        old_values: oldValues,
        new_values: newValues,
        committed_at: new Date()
      });

      gitRepo.last_commit_sha = commitSha;
      await gitRepo.save();

      logger.info(`[GitService] Committed change: ${commitSha.substr(0, 7)} - ${changeType}`);
      return configChange;
    } catch (error) {
      logger.error('[GitService] Error committing change:', error);
      // Don't throw - we don't want Git issues to break proxy operations
      return null;
    }
  }

  /**
   * Sync from Git (GitOps mode) - pull changes and apply
   */
  async syncFromGit(gitRepoId) {
    try {
      const gitRepo = await GitRepository.findByPk(gitRepoId);
      if (!gitRepo) {
        throw new Error('Git repository not found');
      }

      const repoPath = await this.cloneOrUpdateRepo(gitRepo);
      const git = simpleGit(repoPath);

      // Check if there are new commits
      const log = await git.log(['-1']);
      const latestSha = log.latest.hash;

      if (latestSha === gitRepo.last_commit_sha) {
        logger.debug('[GitService] No new commits to sync');
        return { synced: false, message: 'No new commits' };
      }

      // Read configuration from files
      const configDir = path.join(repoPath, 'config');
      const proxiesPath = path.join(configDir, 'proxies.json');

      const proxiesData = await fs.readFile(proxiesPath, 'utf8');
      const proxies = JSON.parse(proxiesData);

      // Apply configuration (with transaction)
      const { sequelize } = require('../models');
      const t = await sequelize.transaction();

      try {
        // Note: This is a simple sync that replaces all proxies
        // In production, you might want smart merging

        logger.info('[GitService] Applying configuration from Git...');

        // Clear existing proxies
        await Proxy.destroy({ where: {}, transaction: t });

        // Create proxies from Git
        for (const proxyData of proxies) {
          const { headers, middlewares, ...proxyFields } = proxyData;

          const proxy = await Proxy.create(proxyFields, { transaction: t });

          // Create associated headers
          if (headers && headers.length > 0) {
            for (const header of headers) {
              await Header.create({
                ...header,
                proxy_id: proxy.id
              }, { transaction: t });
            }
          }

          // Create associated middlewares
          if (middlewares && middlewares.length > 0) {
            for (const middleware of middlewares) {
              await Middleware.create({
                ...middleware,
                proxy_id: proxy.id
              }, { transaction: t });
            }
          }
        }

        await t.commit();

        // Update Caddy configuration
        const caddyService = require('./caddyService');
        await caddyService.updateCaddyConfig();

        gitRepo.last_commit_sha = latestSha;
        gitRepo.last_sync = new Date();
        await gitRepo.save();

        logger.info(`[GitService] Synced ${proxies.length} proxies from Git (${latestSha.substr(0, 7)})`);
        return { synced: true, commit: latestSha, proxies: proxies.length };
      } catch (error) {
        await t.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('[GitService] Error syncing from Git:', error);
      throw error;
    }
  }

  /**
   * Start automatic sync interval for GitOps mode
   */
  startAutoSync(gitRepo) {
    const interval = (gitRepo.sync_interval || 300) * 1000;

    setInterval(async () => {
      try {
        await this.syncFromGit(gitRepo.id);
      } catch (error) {
        logger.error(`[GitService] Auto-sync failed for ${gitRepo.name}:`, error.message);
      }
    }, interval);

    logger.info(`[GitService] Started auto-sync for ${gitRepo.name} (every ${gitRepo.sync_interval}s)`);
  }

  /**
   * Get commit history for a resource
   */
  async getCommitHistory(resourceType, resourceId, limit = 50) {
    try {
      const changes = await ConfigChange.findAll({
        where: resourceType && resourceId ?
          { resource_type: resourceType, resource_id: resourceId } : {},
        include: [
          { model: require('../models').User, as: 'user', attributes: ['id', 'email'] },
          { model: GitRepository, as: 'repository', attributes: ['id', 'name'] }
        ],
        order: [['committed_at', 'DESC']],
        limit
      });

      return changes;
    } catch (error) {
      logger.error('[GitService] Error getting commit history:', error);
      throw error;
    }
  }

  /**
   * Get diff between two commits
   */
  async getDiff(gitRepoId, fromCommit, toCommit = 'HEAD') {
    try {
      const gitRepo = await GitRepository.findByPk(gitRepoId);
      const repoPath = this.getRepoPath(gitRepo.id);
      const git = simpleGit(repoPath);

      const diff = await git.diff([`${fromCommit}..${toCommit}`]);
      return diff;
    } catch (error) {
      logger.error('[GitService] Error getting diff:', error);
      throw error;
    }
  }

  /**
   * Rollback to a specific commit
   */
  async rollbackToCommit(gitRepoId, commitSha) {
    try {
      const gitRepo = await GitRepository.findByPk(gitRepoId);
      const repoPath = this.getRepoPath(gitRepo.id);
      const git = simpleGit(repoPath);

      // Create a new branch for safety
      const backupBranch = `backup-${Date.now()}`;
      await git.checkoutBranch(backupBranch, gitRepo.branch);

      // Checkout the specific commit (detached HEAD)
      await git.checkout(commitSha);

      // Apply the configuration from that commit
      await this.syncFromGit(gitRepoId);

      // Return to main branch
      await git.checkout(gitRepo.branch);

      logger.info(`[GitService] Rolled back to commit ${commitSha.substr(0, 7)}`);
      return { success: true, commit: commitSha, backup_branch: backupBranch };
    } catch (error) {
      logger.error('[GitService] Error rolling back:', error);
      throw error;
    }
  }

  /**
   * Test repository connection
   */
  async testConnection(gitRepo) {
    try {
      const git = simpleGit();
      const urlWithAuth = this.addAuthToUrl(gitRepo);

      // Try to list remote
      await git.listRemote([urlWithAuth]);

      return { success: true, message: 'Connection successful' };
    } catch (error) {
      logger.error('[GitService] Connection test failed:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = new GitService();
