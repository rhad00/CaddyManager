import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import yaml from 'js-yaml';
import winston from 'winston';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { CreationAttributes, WhereOptions } from 'sequelize';
import { GitRepository, ConfigChange, Proxy, Header, Middleware, User, sequelize } from '../models';
import type { ConfigChangeType } from '../models/configChange';
import { prepareImportedProxies, ProxyImportError } from '../utils/proxyImport';
import { caddyService } from './caddyService';
import { errorMessage } from '../utils/errorMessage';

/** What authEnv and gitFor read of a repository (the rest is only used by the sync code) */
type AuthRepo = Pick<GitRepository, 'provider' | 'access_token'>;

/** A proxy (or the parts of one) as recorded with a change; only some change types read these */
type ChangeValues = Record<string, unknown>;
interface ProxySnapshot {
  name: string;
  domains: string[];
  upstream_url: string;
}

export interface SyncResult {
  synced: boolean;
  message?: string;
  commit?: string;
  proxies?: number;
}

export interface RollbackResult {
  success: boolean;
  commit: string;
  proxies: number;
  recorded_as: string | null;
}

/** Proxy as exported to Git: without the basic-auth hash (or a legacy plaintext password). */
const withoutPasswordHash = <T extends { basic_auth?: object | null }>(proxy: T): T => {
  if (!proxy.basic_auth) return proxy;
  // eslint-disable-next-line no-unused-vars
  const { hashed_password, password, ...basicAuth } = proxy.basic_auth as Record<string, unknown>;
  return { ...proxy, basic_auth: basicAuth };
};

// Environment passed to git: locations, locale, TLS trust and proxy settings
const GIT_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'GIT_SSL_CAINFO',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
];

// simple-git 4 removes every GIT_* variable from the child's environment, and refuses a
// call that supplies one, unless it is named here: exactly the ones authEnv() builds
const GIT_ALLOWED_ENVIRONMENT = [
  'GIT_TERMINAL_PROMPT', 'GIT_SSL_CAINFO',
  'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',
];

// Username for token auth over HTTPS, per provider (the token is the password)
const TOKEN_USERNAMES: Record<string, string> = {
  github: 'x-access-token',
  gitlab: 'oauth2',
  gitea: 'oauth2',
  bitbucket: 'x-token-auth',
};

// Abbreviated or full commit SHA; anything else must never reach a git command line
const COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

export class GitRollbackError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'GitRollbackError';
    this.statusCode = statusCode;
  }
}

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

export class GitService {
  /** The error class of rollbacks, so route code can tell them apart: `instanceof gitService.GitRollbackError` */
  get GitRollbackError(): typeof GitRollbackError {
    return GitRollbackError;
  }

  repoDir: string;
  readonly algorithm = 'aes-256-gcm';
  secretKey: Buffer;
  initialized = false;
  /** When each auto-sync repository was last attempted (ms), kept by the leader's loop */
  autoSyncLastRun = new Map<string, number>();
  private autoSyncTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.repoDir = process.env.GIT_REPO_DIR || path.join(__dirname, '../../git-repos');
    // Use provided secret or generate one (should be consistent across restarts)
    if (process.env.GIT_SECRET_KEY) {
      this.secretKey = Buffer.from(process.env.GIT_SECRET_KEY, 'hex');
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('GIT_SECRET_KEY is required in production. Generate with: openssl rand -hex 32');
    } else {
      this.secretKey = crypto.randomBytes(32);
    }
  }

  /**
   * Initialize Git service on startup
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.repoDir, { recursive: true });
      logger.info(`[GitService] Git repository directory: ${this.repoDir}`);

      // Warn if no secret key is set
      if (!process.env.GIT_SECRET_KEY) {
        logger.warn('[GitService] GIT_SECRET_KEY not set. Using random key (tokens will not persist across restarts)');
        logger.warn('[GitService] Set GIT_SECRET_KEY in environment for production use');
      }

      // One loop syncs every enabled auto-sync repository, however it was created or changed
      this.startAutoSync();

      this.initialized = true;
      logger.info('[GitService] Initialized, auto-sync loop started');
    } catch (error) {
      logger.error('[GitService] Initialization error:', error);
    }
  }

  /**
   * Encrypt sensitive data (tokens, SSH keys)
   */
  encrypt(text: string): string {
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
  decrypt(encrypted: string): string {
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
  getRepoPath(repoId: string): string {
    return path.join(this.repoDir, repoId);
  }

  /**
   * Environment for git commands against this repository. The token travels as an
   * Authorization header in a per-process git config (GIT_CONFIG_*), so it is never
   * written to .git/config, never on the command line and never in a logged URL.
   * Each provider accepts HTTPS basic auth with the token as password; the username
   * follows its convention (GitLab needs "oauth2", Bitbucket "x-token-auth").
   */
  authEnv(gitRepo: AuthRepo): Record<string, string> {
    // Only what git needs: simple-git refuses environments carrying editor/pager hooks,
    // and nothing else from the backend's environment should reach the child process
    const inherited = Object.fromEntries(
      GIT_ENV_ALLOWLIST.flatMap((name) => {
        const value = process.env[name];
        return value === undefined ? [] : [[name, value]];
      })
    );
    const env = { ...inherited, GIT_TERMINAL_PROMPT: '0' };
    if (!gitRepo.access_token) return env;

    const username = TOKEN_USERNAMES[gitRepo.provider] || 'oauth2';
    const basic = Buffer.from(`${username}:${this.decrypt(gitRepo.access_token)}`).toString('base64');
    return {
      ...env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraHeader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    };
  }

  /**
   * simple-git instance carrying the repository's credentials. simple-git blocks
   * GIT_CONFIG_COUNT by default because arbitrary config can run commands
   * (core.sshCommand, ...); here the only key is the constant http.extraHeader and the
   * value a base64 header we build, so that one switch is enabled.
   */
  gitFor(gitRepo: AuthRepo, dir?: string): SimpleGit {
    const options = {
      allowEnvironment: GIT_ALLOWED_ENVIRONMENT,
      unsafe: { allowUnsafeConfigEnvCount: Boolean(gitRepo.access_token) },
    };
    return (dir ? simpleGit(dir, options) : simpleGit(options)).env(this.authEnv(gitRepo));
  }

  /**
   * Clone or update repository
   */
  async cloneOrUpdateRepo(gitRepo: GitRepository): Promise<string> {
    const repoPath = this.getRepoPath(gitRepo.id);

    try {
      const exists = await fs.access(repoPath).then(() => true).catch(() => false);

      if (!exists) {
        logger.info(`[GitService] Cloning repository: ${gitRepo.repository_url}`);

        await this.gitFor(gitRepo).clone(gitRepo.repository_url, repoPath, ['--branch', gitRepo.branch]);

        logger.info(`[GitService] Repository cloned to ${repoPath}`);
      } else {
        logger.info(`[GitService] Updating repository: ${gitRepo.name}`);

        const repoGit = this.gitFor(gitRepo, repoPath);
        // Clones made by older versions kept the token inside origin's URL
        await repoGit.remote(['set-url', 'origin', gitRepo.repository_url]);
        // Back onto the tracked branch first: older rollbacks left clones detached or
        // on a backup-* branch, where a pull updates the wrong ref
        await repoGit.checkout(gitRepo.branch);
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
  async exportConfigToFile(repoPath: string): Promise<void> {
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
      // Password hashes stay out of the repository (a sync keeps the stored ones)
      const proxiesData = proxies.map((p) => withoutPasswordHash(p.toJSON()));

      // Export as JSON
      const proxiesJson = JSON.stringify(proxiesData, null, 2);
      await fs.writeFile(path.join(configDir, 'proxies.json'), proxiesJson);

      // Export as YAML (more human-readable)
      const proxiesYaml = yaml.dump(proxiesData);
      await fs.writeFile(path.join(configDir, 'proxies.yaml'), proxiesYaml);

      // Export Caddy config
      const caddyConfig = await caddyService.getCaddyConfig();
      await fs.writeFile(
        path.join(configDir, 'caddy.json'),
        JSON.stringify(caddyConfig, null, 2)
      );

      // Export metadata
      const metadata = {
        exported_at: new Date().toISOString(),
        version: (require('../../package.json') as { version: string }).version,
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
  generateCommitMessage(
    gitRepo: Pick<GitRepository, 'commit_message_template'>,
    changeType: string,
    resourceType?: string | null,
    oldValues?: ChangeValues | null,
    newValues?: ChangeValues | null
  ): string {
    const template = gitRepo.commit_message_template;
    const before = oldValues as unknown as ProxySnapshot;
    const after = newValues as unknown as ProxySnapshot;

    let changes = '';
    if (changeType === 'proxy_create') {
      changes = `Created proxy: ${after.name}\nDomains: ${after.domains.join(', ')}`;
    } else if (changeType === 'proxy_update') {
      changes = `Updated proxy: ${after.name}`;
      if (before && before.domains !== after.domains) {
        changes += `\nDomains: ${before.domains.join(', ')} → ${after.domains.join(', ')}`;
      }
      if (before && before.upstream_url !== after.upstream_url) {
        changes += `\nUpstream: ${before.upstream_url} → ${after.upstream_url}`;
      }
    } else if (changeType === 'proxy_delete') {
      changes = `Deleted proxy: ${before.name}`;
    } else if (changeType === 'template_apply') {
      changes = `Applied template to proxy: ${after.name}`;
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
  async commitConfigChange(
    gitRepoId: string,
    changeType: ConfigChangeType,
    resourceType?: string | null,
    resourceId?: string | null,
    userId?: string | null,
    oldValues?: ChangeValues | null,
    newValues?: ChangeValues | null
  ): Promise<ConfigChange | null> {
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

      await this.gitFor(gitRepo, repoPath).push('origin', gitRepo.branch);

      // Get commit SHA
      const log = await git.log(['-1']);
      const commitSha = log.latest?.hash;
      if (!commitSha) throw new Error('The new commit could not be read back');

      // Record change in database
      const configChange = await ConfigChange.create({
        git_repository_id: gitRepo.id,
        change_type: changeType,
        resource_type: resourceType ?? null,
        resource_id: resourceId ?? null,
        user_id: userId ?? null,
        commit_sha: commitSha,
        commit_message: commitMessage,
        diff: diffResult,
        old_values: oldValues ?? null,
        new_values: newValues ?? null,
        committed_at: new Date()
      });

      gitRepo.last_commit_sha = commitSha;
      await gitRepo.save();

      logger.info(`[GitService] Committed change: ${commitSha.slice(0, 7)} - ${changeType}`);
      return configChange;
    } catch (error) {
      logger.error('[GitService] Error committing change:', error);
      // Don't throw - we don't want Git issues to break proxy operations
      return null;
    }
  }

  /**
   * Replace all proxies with the definitions of a config/proxies.json document and push
   * the result to Caddy. Every entry is validated before anything is deleted.
   * @returns number of proxies applied
   */
  async applyProxyDefinitions(proxiesJson: string): Promise<number> {
    let definitions: unknown;
    try {
      definitions = JSON.parse(proxiesJson);
    } catch {
      throw new ProxyImportError(['config/proxies.json is not valid JSON']);
    }
    // Same validation and field whitelist as the API; refuse the whole import up front.
    // Exports carry no password hashes: keep the ones stored for the same proxy names.
    const stored = await Proxy.findAll({ attributes: ['name', 'basic_auth'] });
    const existingBasicAuth = new Map(stored.flatMap((p) => (p.basic_auth ? [[p.name, p.basic_auth] as const] : [])));
    const proxies = await prepareImportedProxies(definitions, { existingBasicAuth });

    const t = await sequelize.transaction();
    try {
      // Replaces all proxies; no merging
      await Proxy.destroy({ where: {}, transaction: t });
      for (const { fields, headers, middlewares } of proxies) {
        const proxy = await Proxy.create(fields as CreationAttributes<Proxy>, { transaction: t });
        for (const header of headers) {
          await Header.create({ ...header, proxy_id: proxy.id } as CreationAttributes<Header>, { transaction: t });
        }
        for (const middleware of middlewares) {
          await Middleware.create({ ...middleware, proxy_id: proxy.id } as CreationAttributes<Middleware>, { transaction: t });
        }
      }
      await t.commit();
    } catch (error) {
      if (!t.finished) await t.rollback();
      throw error;
    }

    await caddyService.rebuildConfigFromDatabase();
    return proxies.length;
  }

  /**
   * Sync from Git (GitOps mode) - pull changes and apply
   */
  async syncFromGit(gitRepoId: string): Promise<SyncResult> {
    try {
      const gitRepo = await GitRepository.findByPk(gitRepoId);
      if (!gitRepo) {
        throw new Error('Git repository not found');
      }

      const repoPath = await this.cloneOrUpdateRepo(gitRepo);
      const git = simpleGit(repoPath);

      // Check if there are new commits
      const log = await git.log(['-1']);
      const latestSha = log.latest?.hash;
      if (!latestSha) throw new Error('The repository has no commits');

      if (latestSha === gitRepo.last_commit_sha) {
        logger.debug('[GitService] No new commits to sync');
        return { synced: false, message: 'No new commits' };
      }

      logger.info('[GitService] Applying configuration from Git...');
      const proxiesData = await fs.readFile(path.join(repoPath, 'config', 'proxies.json'), 'utf8');
      // On failure (invalid file, Caddy error) last_commit_sha stays put, so the next sync
      // retries this commit
      const count = await this.applyProxyDefinitions(proxiesData);

      gitRepo.last_commit_sha = latestSha;
      gitRepo.last_sync = new Date();
      await gitRepo.save();

      logger.info(`[GitService] Synced ${count} proxies from Git (${latestSha.slice(0, 7)})`);
      return { synced: true, commit: latestSha, proxies: count };
    } catch (error) {
      logger.error('[GitService] Error syncing from Git:', error);
      throw error;
    }
  }

  /**
   * Start the auto-sync loop for GitOps mode (idempotent). It reads the repositories from the
   * database on every tick, so a repository created, edited, disabled or deleted through any
   * worker takes effect without a timer per call. Only the leader starts it.
   */
  startAutoSync(tickMs = 15000): void {
    if (this.autoSyncTimer) return;
    this.autoSyncTimer = setInterval(() => {
      this.runDueSyncs(Date.now()).catch((error) => {
        logger.error('[GitService] Auto-sync loop failed:', errorMessage(error));
      });
    }, tickMs);
    this.autoSyncTimer.unref?.();
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = null;
  }

  /** Sync the repositories whose interval has passed since they were last attempted */
  async runDueSyncs(now: number): Promise<void> {
    const repos = await GitRepository.findAll({ where: { enabled: true, auto_sync: true } });

    const present = new Set(repos.map((repo) => repo.id));
    for (const id of this.autoSyncLastRun.keys()) {
      if (!present.has(id)) this.autoSyncLastRun.delete(id);
    }

    for (const repo of repos) {
      const last = this.autoSyncLastRun.get(repo.id);
      if (last !== undefined && now - last < (repo.sync_interval || 300) * 1000) continue;
      // Recorded before the attempt: a failing repository waits for its interval like any other
      this.autoSyncLastRun.set(repo.id, now);
      try {
        await this.syncFromGit(repo.id);
      } catch (error) {
        logger.error(`[GitService] Auto-sync failed for ${repo.name}:`, errorMessage(error));
      }
    }
  }

  /**
   * Get commit history for a resource
   */
  async getCommitHistory(resourceType?: string | null, resourceId?: string | null, limit = 50): Promise<ConfigChange[]> {
    try {
      const changes = await ConfigChange.findAll({
        where: (resourceType && resourceId ?
          { resource_type: resourceType, resource_id: resourceId } : {}) as WhereOptions<ConfigChange>,
        include: [
          { model: User, as: 'user', attributes: ['id', 'email'] },
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
  async getDiff(gitRepoId: string, fromCommit: string, toCommit = 'HEAD'): Promise<string> {
    try {
      // Refs reach the git command line: only SHAs or HEAD, never anything option-like
      for (const ref of [fromCommit, toCommit]) {
        if (ref !== 'HEAD' && !COMMIT_SHA.test(String(ref))) {
          throw new GitRollbackError(`Invalid commit reference: ${ref}`, 400);
        }
      }
      const gitRepo = await GitRepository.findByPk(gitRepoId);
      if (!gitRepo) throw new Error('Git repository not found');
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
   * Resolve a (possibly abbreviated) SHA to a commit on the tracked branch.
   * @throws GitRollbackError 404 when unknown or not in the branch history
   */
  async resolveBranchCommit(git: SimpleGit, sha: string, branch: string): Promise<string> {
    let fullSha = '';
    try {
      fullSha = (await git.raw(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`])).trim();
    } catch {
      fullSha = '';
    }
    if (!fullSha) {
      throw new GitRollbackError(`Commit ${sha} not found`, 404);
    }

    // On the branch means: an ancestor of (or equal to) its head
    let mergeBase = '';
    try {
      mergeBase = (await git.raw(['merge-base', fullSha, 'HEAD'])).trim();
    } catch {
      mergeBase = '';
    }
    if (mergeBase !== fullSha) {
      throw new GitRollbackError(`Commit ${sha} is not on branch ${branch}`, 404);
    }
    return fullSha;
  }

  /**
   * Export the current configuration, commit it and push it. Returns the new commit's
   * SHA, or null when the export matches what is already committed.
   */
  async commitExport(gitRepo: GitRepository, git: SimpleGit, repoPath: string, message: string): Promise<string | null> {
    await this.exportConfigToFile(repoPath);
    const status = await git.status();
    if (status.files.length === 0) return null;

    await git.addConfig('user.name', 'CaddyManager');
    await git.addConfig('user.email', 'noreply@caddymanager.local');
    await git.add('.');
    await git.commit(message);
    await this.gitFor(gitRepo, repoPath).push('origin', gitRepo.branch);
    return (await git.revparse(['HEAD'])).trim();
  }

  /**
   * Roll the proxies back to the configuration of a commit on the tracked branch.
   *
   * The file is read with `git show`, without checking anything out. The result is then
   * recorded so the next auto-sync does not undo it: with auto-commit, a "Rollback to"
   * commit is pushed (Git and the database agree again); otherwise the branch head is
   * marked as seen, and the next commit pushed to the branch is applied as usual.
   */
  async rollbackToCommit(gitRepoId: string, commitSha: string): Promise<RollbackResult> {
    try {
      if (!COMMIT_SHA.test(String(commitSha))) {
        throw new GitRollbackError('Invalid commit SHA', 400);
      }
      const gitRepo = await GitRepository.findByPk(gitRepoId);
      if (!gitRepo) {
        throw new GitRollbackError('Git repository not found', 404);
      }

      const repoPath = await this.cloneOrUpdateRepo(gitRepo);
      const git = simpleGit(repoPath);
      const fullSha = await this.resolveBranchCommit(git, commitSha, gitRepo.branch);

      let proxiesJson: string;
      try {
        proxiesJson = await git.show([`${fullSha}:config/proxies.json`]);
      } catch {
        throw new GitRollbackError(`Commit ${commitSha} has no config/proxies.json`, 404);
      }

      const count = await this.applyProxyDefinitions(proxiesJson);

      const headSha = (await git.revparse(['HEAD'])).trim();
      const recordedAs = gitRepo.auto_commit
        ? await this.commitExport(gitRepo, git, repoPath, `Rollback to ${fullSha.slice(0, 7)} (CaddyManager)`)
        : null;
      gitRepo.last_commit_sha = recordedAs || headSha;
      gitRepo.last_sync = new Date();
      await gitRepo.save();

      logger.info(`[GitService] Rolled back to commit ${fullSha.slice(0, 7)}`);
      return { success: true, commit: fullSha, proxies: count, recorded_as: recordedAs };
    } catch (error) {
      logger.error('[GitService] Error rolling back:', error);
      throw error;
    }
  }

  /**
   * Test repository connection
   */
  async testConnection(gitRepo: AuthRepo & Pick<GitRepository, 'repository_url'>): Promise<{ success: boolean; message: string }> {
    try {
      // Try to list remote
      await this.gitFor(gitRepo).listRemote([gitRepo.repository_url]);

      return { success: true, message: 'Connection successful' };
    } catch (error) {
      logger.error('[GitService] Connection test failed:', error);
      return { success: false, message: errorMessage(error) };
    }
  }
}

export const gitService = new GitService();
