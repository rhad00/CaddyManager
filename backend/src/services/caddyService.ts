import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import tls from 'tls';
import dotenv from 'dotenv';
import { Op, type CreationAttributes } from 'sequelize';
import { sequelize, Proxy, Header, Middleware, Certificate } from '../models';
import type { TlsDomainResult, TlsStatus } from '../models/proxy';
import type { TemplateHeader, TemplateMiddleware } from '../models/template';
import { parseUpstream } from '../utils/upstream';
import {
  createRouteFromProxy,
  shouldUseHTTPSTransport,
  buildSelectionPolicy,
  buildTlsTransport,
  type CaddyHandler,
  type CaddyRoute,
  type ProxyRouteInput,
  type SelectionPolicy,
  type TlsTransport,
} from '../utils/caddyRoute';
import {
  withCustomCertificates,
  withoutCustomCertificates,
  type CaddyConfig,
  type StoredCertificate,
  type TlsApp,
} from '../utils/caddyTls';
import { errorMessage } from '../utils/errorMessage';
dotenv.config();

/** A route as Caddy returns it (the ones CaddyManager did not write are only inspected) */
interface CaddyRouteEntry {
  match?: Array<{ host?: string | string[] }>;
  handle?: CaddyHandler[];
}

interface CaddyServer {
  listen: string[];
  routes: CaddyRouteEntry[];
  logs?: { default_logger_name: string };
  [extra: string]: unknown;
}

interface AutomationPolicy {
  subjects?: string[];
  issuers?: Array<{
    module?: string;
    challenges?: { dns?: { provider?: { name?: string; api_token?: string } } };
    [extra: string]: unknown;
  }>;
  [extra: string]: unknown;
}

/** The parts of Caddy's JSON config this service reads or writes; everything else passes through. */
export interface CaddyJsonConfig extends CaddyConfig {
  apps?: {
    http?: { servers?: Record<string, CaddyServer>; [extra: string]: unknown };
    tls?: TlsApp & { automation?: { policies?: AutomationPolicy[]; [extra: string]: unknown } };
    [app: string]: unknown;
  };
  logging?: { logs?: Record<string, unknown>; [extra: string]: unknown };
}

export interface TlsVerification {
  ok: boolean;
  results: TlsDomainResult[];
}

export interface ProxyOperationResult {
  success: boolean;
  message: string;
  routeIndex: number | null;
  tlsStatus: TlsStatus | null;
}

/** What deleteProxy needs of a proxy whose row is already gone */
export interface DeletedProxyData {
  id?: string;
  caddy_route_index?: number | null;
  ssl_type?: string;
}

/** The parts of a template that applyTemplate copies onto a proxy */
export interface TemplateInput {
  headers?: TemplateHeader[] | null;
  middleware?: TemplateMiddleware[] | null;
}

/** A backup document; includeInBackup adds the Caddy config to it */
export interface BackupData {
  caddy_config?: CaddyConfig | null;
  caddy_config_error?: string;
  [extra: string]: unknown;
}

/** The first handler's upstreams when the route is a reverse proxy */
const upstreamsOf = (route: CaddyRouteEntry): Array<{ dial: string }> | undefined => {
  const handler = route.handle?.[0];
  if (!handler || handler.handler !== 'reverse_proxy') return undefined;
  return handler.upstreams as Array<{ dial: string }> | undefined;
};

/**
 * Minimal promise-chain mutex — no external dependency required.
 * All callers that need to read-modify-write the Caddy config must
 * acquire this lock to prevent TOCTOU races and stale-index corruption.
 */
class Mutex {
  _queue: Promise<unknown> = Promise.resolve();

  /** Acquire the lock; returns a release function to call in a finally block. */
  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const current = this._queue;
    this._queue = this._queue.then(() => next);
    return current.then(() => release);
  }
}

/**
 * Service for interacting with Caddy's Admin API
 */
export class CaddyService {
  apiUrl: string;
  serverName: string;
  configBackupDir: string;
  configBackupFile: string;
  _configMutex: Mutex;

  constructor() {
    this.apiUrl = process.env.CADDY_API_URL || 'http://localhost:2019';
    this.serverName = process.env.CADDY_SERVER_NAME || 'srv0';
    this.configBackupDir = process.env.CONFIG_BACKUP_DIR || path.join(__dirname, '../../config_backups');
    this.configBackupFile = path.join(this.configBackupDir, 'caddy_config_backup.json');
    this._configMutex = new Mutex();
     // defer any async initialization to initializeConfig
  }

  ensureHttpServer(config: CaddyJsonConfig): CaddyServer {
    config.apps = config.apps || {};
    config.apps.http = config.apps.http || {};
    config.apps.http.servers = config.apps.http.servers || {};
    config.apps.http.servers[this.serverName] = config.apps.http.servers[this.serverName] || {
      listen: [':80'],
      routes: []
    };

    return config.apps.http.servers[this.serverName];
  }

  getServerRoutesApiPath(): string {
    return `${this.apiUrl}/config/apps/http/servers/${this.serverName}/routes`;
  }

  /**
   * Make the Cloudflare DNS-01 automation policy cover exactly `domains`.
   * One policy is kept for all Cloudflare proxies; it is removed when none remain.
   * Other automation policies are left untouched. The token is resolved by Caddy from
   * its own environment ({env.CF_API_TOKEN}), so the backend does not need it.
   * @param config - Caddy JSON config (modified in place and returned)
   * @param domains - domains of all active Cloudflare proxies
   * @returns config
   */
  setCloudflarePolicy(config: CaddyJsonConfig, domains: string[]): CaddyJsonConfig {
    const subjects = [...new Set(domains)].sort();
    const isCloudflarePolicy = (policy: AutomationPolicy): boolean =>
      Array.isArray(policy.issuers) &&
      policy.issuers.some(iss => iss.challenges?.dns?.provider?.name === 'cloudflare');

    const existing = config.apps?.tls?.automation?.policies || [];
    const others = existing.filter(policy => !isCloudflarePolicy(policy));

    if (subjects.length === 0) {
      if (config.apps?.tls?.automation?.policies) {
        config.apps.tls.automation.policies = others;
      }
      return config;
    }

    config.apps = config.apps || {};
    config.apps.tls = config.apps.tls || {};
    config.apps.tls.automation = config.apps.tls.automation || {};
    config.apps.tls.automation.policies = [
      ...others,
      {
        subjects,
        issuers: [{
          module: 'acme',
          challenges: {
            dns: {
              provider: {
                name: 'cloudflare',
                api_token: '{env.CF_API_TOKEN}'
              }
            }
          }
        }]
      }
    ];
    return config;
  }

  /**
   * Domains of all active proxies that use the Cloudflare DNS-01 challenge
   */
  async cloudflareDomains(): Promise<string[]> {
    const proxies = await Proxy.findAll({ where: { ssl_type: 'cloudflare', status: 'active' } });
    return proxies.flatMap(p => (Array.isArray(p.domains) ? p.domains : [p.domains]));
  }

  /**
   * Ensure Caddy access logging is configured in the given config object.
   * Writes structured JSON access logs to a file readable by the backend log service.
   */
  ensureAccessLogging(config: CaddyJsonConfig): CaddyJsonConfig {
    try {
      const logFile = process.env.CADDY_ACCESS_LOG || '/app/logs/access.log';

      // The server emits access logs to `http.log.access.<default_logger_name>`
      const loggerName = 'access';
      const serverConfig = this.ensureHttpServer(config);
      serverConfig.logs = {
        default_logger_name: loggerName
      };

      // Add top-level logging configuration
      config.logging = config.logging || {};
      config.logging.logs = config.logging.logs || {};
      config.logging.logs.access = {
        writer: {
          output: 'file',
          filename: logFile,
          // Caddy creates log files 0600 by default; the backend reads this file as a
          // different (non-root) user through a shared volume
          mode: '0644',
        },
        encoder: { format: 'json' },
        include: [`http.log.access.${loggerName}`],
      };

      return config;
    } catch (err) {
      console.error('Failed to ensure access logging config:', errorMessage(err));
      return config;
    }
  }

  /**
   * Ensure config backup directory exists
   */
  async ensureConfigBackupDir(): Promise<void> {
    try {
      await fs.mkdir(this.configBackupDir, { recursive: true });
      console.log(`Config backup directory ensured: ${this.configBackupDir}`);
    } catch (error) {
      console.error('Failed to create config backup directory:', error);
    }
  }

  /**
   * Initialize Caddy configuration on startup
   * This should be called when the application starts
   */
  async initializeConfig(): Promise<void> {
    try {
      // Ensure config backup directory exists before doing file operations
      await this.ensureConfigBackupDir();
      console.log('Initializing Caddy configuration...');

      // Check if we have a saved configuration backup
      let configExists = false;
      try {
        await fs.access(this.configBackupFile);
        configExists = true;
      } catch (error) {
        // File doesn't exist, will use default config
      }

      if (configExists) {
        // Load configuration from backup file
        console.log('Loading configuration from backup file...');
        const configData = await fs.readFile(this.configBackupFile, 'utf8');
        const config = JSON.parse(configData) as CaddyConfig;

        // Apply the configuration to Caddy
        await this.loadConfig(config);
        console.log('Configuration loaded from backup file');
      } else {
        // No backup file exists, check if we have proxies in the database
        console.log('No backup file found, checking database for proxies...');
        const proxies = await Proxy.findAll({
          include: [
            { model: Header, as: 'headers' },
            { model: Middleware, as: 'middlewares' }
          ]
        });

        if (proxies.length > 0) {
          // We have proxies in the database, rebuild the configuration
          console.log(`Found ${proxies.length} proxies in database, rebuilding configuration...`);
          await this.rebuildConfigFromDatabase();
        } else {
          // No proxies in database, use default configuration
          console.log('No proxies found in database, using default configuration');
          // The default configuration is already loaded from the Caddyfile
          // Just backup the current config for future reference
          await this.backupCurrentConfig();
        }
      }

      console.log('Caddy configuration initialization complete');
    } catch (error) {
      console.error('Failed to initialize Caddy configuration:', error);
      throw new Error(`Failed to initialize Caddy configuration: ${errorMessage(error)}`);
    }
  }

  /**
   * Rebuild Caddy configuration from database. This is the full DB-to-Caddy sync used
   * at startup and after bulk changes (GitOps sync, Docker discovery).
   */
  async rebuildConfigFromDatabase(): Promise<void> {
    const release = await this._configMutex.acquire();
    try {
      // Get current config as a starting point
      const currentConfig = await this.getConfig();

      // Get all proxies from database
      const proxies = await Proxy.findAll({
        include: [
          { model: Header, as: 'headers' },
          { model: Middleware, as: 'middlewares' }
        ]
      });

      const serverConfig = this.ensureHttpServer(currentConfig);

      // Filter out duplicate routes and keep track of unique domains
      // Disabled proxies are excluded from Caddy config
      const uniqueDomains = new Set<string>();
      const uniqueProxies = proxies.filter(proxy => {
        if (proxy.status != null && proxy.status !== 'active') return false;
        const domains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
        const domainKey = domains.sort().join(',');
        if (uniqueDomains.has(domainKey)) {
          return false;
        }
        uniqueDomains.add(domainKey);
        return true;
      });

      // Clear existing routes (except for the CaddyManager routes)
      const caddyManagerRoutes = serverConfig.routes.filter(route => {
        const upstreams = upstreamsOf(route);
        return Boolean(upstreams && (
          upstreams.some(u => u.dial.includes("backend:3000")) ||
          upstreams.some(u => u.dial.includes("frontend:80"))
        ));
      });

      serverConfig.routes = caddyManagerRoutes;

      // Add routes for each unique proxy
      for (const proxy of uniqueProxies) {
        const route = this.createRouteFromProxy(proxy);
        serverConfig.routes.push(route);

        // Update the proxy with its route index
        const routeIndex = serverConfig.routes.length - 1;
        await proxy.update({
          caddy_route_index: routeIndex
        });
      }

      // Proxies left out (disabled or duplicate domains) have no route any more
      const included = new Set(uniqueProxies);
      for (const proxy of proxies) {
        if (!included.has(proxy) && proxy.caddy_route_index != null) {
          await proxy.update({ caddy_route_index: null });
        }
      }

      // DNS-01 only for the domains of active Cloudflare proxies; plain ACME proxies keep
      // Caddy's default HTTP/TLS-ALPN challenges
      const cloudflareDomains = uniqueProxies
        .filter(p => p.ssl_type === 'cloudflare')
        .flatMap(p => Array.isArray(p.domains) ? p.domains : [p.domains]);
      this.setCloudflarePolicy(currentConfig, cloudflareDomains);
      this.ensureAccessLogging(currentConfig);
      await this.loadConfig(currentConfig);

      // Backup the configuration
      await this.backupConfig(currentConfig);

      console.log(`Rebuilt configuration with ${proxies.length} proxies from database`);
    } catch (error) {
      console.error('Failed to rebuild configuration from database:', error);
      throw new Error(`Failed to rebuild configuration: ${errorMessage(error)}`);
    } finally {
      release();
    }
  }

  /**
   * Get the current Caddy configuration
   * @returns The current configuration
   */
  async getConfig(): Promise<CaddyJsonConfig> {
    try {
      const response = await axios.get<CaddyJsonConfig>(`${this.apiUrl}/config/`);
      return response.data;
    } catch (error) {
      console.error('Failed to get Caddy configuration:', errorMessage(error));
      throw new Error(`Failed to get configuration: ${errorMessage(error)}`);
    }
  }

  /**
   * Current config with CaddyManager-managed private keys removed; safe to persist or export
   */
  async getCaddyConfig(): Promise<CaddyJsonConfig> {
    return withoutCustomCertificates(await this.getConfig());
  }

  /**
   * Uploaded and self-signed certificates to serve (private keys decrypted by the model)
   */
  async loadCustomCertificates(): Promise<Array<Certificate & StoredCertificate>> {
    const certificates = await Certificate.findAll({
      where: {
        type: ['uploaded', 'self-signed'],
        status: { [Op.ne]: 'revoked' }
      }
    });
    return certificates.filter((c): c is Certificate & StoredCertificate => Boolean(c.certificate_pem && c.private_key_pem));
  }

  /**
   * Re-push the running config so Caddy picks up added or removed custom certificates
   */
  async syncCustomCertificates(): Promise<void> {
    const release = await this._configMutex.acquire();
    try {
      const config = await this.getConfig();
      await this.loadConfig(config);
      await this.backupConfig(config);
    } finally {
      release();
    }
  }

  /**
   * Load a complete configuration into Caddy.
   * Custom certificates live only in the database (backups and exports strip their
   * keys), so they are merged into every config pushed to Caddy.
   * @param config - The configuration to load
   */
  async loadConfig(config: CaddyConfig): Promise<void> {
    try {
      const fullConfig = withCustomCertificates(config, await this.loadCustomCertificates());
      await axios.post(`${this.apiUrl}/load`, fullConfig, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Failed to load Caddy configuration:', errorMessage(error));
      throw new Error(`Failed to load configuration: ${errorMessage(error)}`);
    }
  }

  /**
   * Backup the current Caddy configuration
   */
  async backupCurrentConfig(): Promise<void> {
    try {
      const config = await this.getConfig();
      await this.backupConfig(config);
    } catch (error) {
      console.error('Failed to backup current configuration:', error);
      throw new Error(`Failed to backup configuration: ${errorMessage(error)}`);
    }
  }

  /**
   * Backup after Caddy has accepted a change. Caddy already runs the new config, so a
   * failed backup is logged instead of failing (and rolling back) the change.
   */
  async backupAfterChange(): Promise<void> {
    try {
      await this.backupCurrentConfig();
    } catch (error) {
      console.error('Config backup failed after a successful Caddy change:', errorMessage(error));
    }
  }

  /**
   * Backup a Caddy configuration
   * @param config - The configuration to backup
   */
  async backupConfig(config: CaddyConfig): Promise<void> {
    try {
      // Never write custom certificate private keys to disk in plaintext
      await fs.writeFile(
        this.configBackupFile,
        JSON.stringify(withoutCustomCertificates(config), null, 2),
        'utf8'
      );
      console.log(`Configuration backed up to ${this.configBackupFile}`);
    } catch (error) {
      console.error('Failed to backup configuration:', error);
      throw new Error(`Failed to backup configuration: ${errorMessage(error)}`);
    }
  }

  /**
   * Create a route configuration from a proxy (see utils/caddyRoute)
   * @param proxy - The proxy object from the database
   * @returns The route configuration
   */
  createRouteFromProxy(proxy: ProxyRouteInput): CaddyRoute {
    return createRouteFromProxy(proxy);
  }

  /** Check if the upstream URL should use HTTPS transport configuration */
  shouldUseHTTPSTransport(upstreamUrl: string): boolean {
    return shouldUseHTTPSTransport(upstreamUrl);
  }

  /** Caddy selection policy for a load-balanced pool (see utils/caddyRoute) */
  buildSelectionPolicy(loadBalancing: Parameters<typeof buildSelectionPolicy>[0]): SelectionPolicy {
    return buildSelectionPolicy(loadBalancing);
  }

  /** HTTP transport that speaks TLS to the upstream (see utils/caddyRoute) */
  buildTlsTransport(proxy: Pick<ProxyRouteInput, 'skip_tls_verify'>): TlsTransport {
    return buildTlsTransport(proxy);
  }

  /**
   * Add a proxy to Caddy configuration
   * @param proxy - The proxy object from the database
   * @returns The result of the operation
   */
  async addProxy(proxy: Proxy): Promise<ProxyOperationResult> {
    const release = await this._configMutex.acquire();
    let newRouteIndex: number | null = null;
    let routePosted = false;
    try {
      // Get current config
      const config = await this.getConfig();

      // Ensure the HTTP server exists
      const serverConfig = this.ensureHttpServer(config);

      // Check for existing routes with the same domains and upstream URL
      const existingRoutes = serverConfig.routes;
      const proxyDomains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
      const domainKey = proxyDomains.sort().join(',');
      const proxyDial = parseUpstream(proxy.upstream_url).dial;

      const existingRoute = existingRoutes.find(route => {
        const routeDomains = route.match?.[0]?.host;
        const routeUpstreams = upstreamsOf(route);
        if (routeDomains && routeUpstreams && routeUpstreams[0]) {
          const routeDomainKey = Array.isArray(routeDomains) ? routeDomains.sort().join(',') : routeDomains;
          const routeUpstream = routeUpstreams[0].dial;
          // Routes written before upstream normalisation stored the raw URL in dial
          return routeDomainKey === domainKey &&
            (routeUpstream === proxyDial || routeUpstream === proxy.upstream_url);
        }
        return false;
      });

      // If a route with these domains and upstream exists, throw an error
      if (existingRoute) {
        throw new Error('A proxy with the same domain and upstream URL already exists');
      }

      // Create the route for this proxy
      const route = this.createRouteFromProxy(proxy);

      // POST appends; the config mutex keeps the index stable until we are done
      newRouteIndex = existingRoutes.length;
      await axios.post(
        this.getServerRoutesApiPath(),
        route,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      routePosted = true;

      // Update the proxy with its route index
      await proxy.update({
        caddy_route_index: newRouteIndex
      });

      await this.backupAfterChange();

      // If the proxy uses ACME or Cloudflare for TLS, ensure Cloudflare policy and perform a short TLS verification to detect ACME failures
      let tlsStatus: TlsStatus | null = null;
      try {
        if (proxy.ssl_type === 'acme' || proxy.ssl_type === 'cloudflare') {
          const domains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
          try {
            // Cover this proxy with the DNS-01 policy before verifying
            if (proxy.ssl_type === 'cloudflare') {
              const config = await this.getConfig();
              this.setCloudflarePolicy(config, await this.cloudflareDomains());
              await this.loadConfig(config);
            }
          } catch (err) {
            console.error('Failed to ensure Cloudflare policy before TLS verification:', errorMessage(err));
          }
          tlsStatus = await this.verifyTlsForDomains(domains, 10000);
          if (!tlsStatus.ok) {
            console.error('TLS verification failed for proxy domains:', tlsStatus);
          }

          // Persist TLS status on the proxy record so frontend can display it
          try {
            await proxy.update({ tls_status: tlsStatus, tls_checked_at: new Date() });
          } catch (err) {
            console.error('Failed to persist TLS status on proxy record:', errorMessage(err));
          }
        }
      } catch (err) {
        console.error('Error while verifying TLS for domains:', errorMessage(err));
        tlsStatus = { ok: false, error: errorMessage(err) };
      }

      return {
        success: true,
        message: 'Proxy added to Caddy configuration',
        routeIndex: newRouteIndex,
        tlsStatus
      };
    } catch (error) {
      console.error('Failed to add proxy to Caddy configuration:', error);
      // The caller discards the proxy, so the route must not stay live in Caddy
      if (routePosted) {
        try {
          await axios.delete(`${this.getServerRoutesApiPath()}/${newRouteIndex}`);
        } catch (cleanupError) {
          console.error(`Failed to remove route ${newRouteIndex} after a failed add:`, errorMessage(cleanupError));
        }
      }
      throw new Error(`Failed to add proxy: ${errorMessage(error)}`);
    } finally {
      release();
    }
  }

  /**
   * Update a proxy in Caddy configuration
   * @param proxy - The updated proxy object from the database
   * @returns The result of the operation
   */
  async updateProxy(proxy: Proxy): Promise<ProxyOperationResult> {
    let released = false;
    const release = await this._configMutex.acquire();
    const safeRelease = () => { if (!released) { released = true; release(); } };
    try {
      // Check if we have a route index for this proxy
      if (proxy.caddy_route_index === null || proxy.caddy_route_index === undefined) {
        // No route index — release current lock and delegate to addProxy (which
        // acquires its own lock), so we don't hold two locks simultaneously.
        safeRelease();
        return await this.addProxy(proxy);
      }

      // Get current config
      const config = await this.getConfig();
      const serverConfig = this.ensureHttpServer(config);

      // Create and apply the updated route
      const route = this.createRouteFromProxy(proxy);
      serverConfig.routes[proxy.caddy_route_index] = route;
      // Recompute the DNS-01 policy: this proxy may have joined, left or changed domains
      this.setCloudflarePolicy(config, await this.cloudflareDomains());
      await this.loadConfig(config);

      await this.backupAfterChange();
      // If the proxy uses ACME for TLS, perform a short TLS verification
      let tlsStatus: TlsStatus | null = null;
      try {
        if (proxy.ssl_type === 'acme' || proxy.ssl_type === 'cloudflare') {
          const domains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
          tlsStatus = await this.verifyTlsForDomains(domains, 10000);
          if (!tlsStatus.ok) {
            console.error('TLS verification failed for proxy domains (update):', tlsStatus);
          }

          // Persist TLS status on the proxy record
          try {
            await proxy.update({ tls_status: tlsStatus, tls_checked_at: new Date() });
          } catch (err) {
            console.error('Failed to persist TLS status on proxy record (update):', errorMessage(err));
          }
        }
      } catch (err) {
        console.error('Error while verifying TLS for domains:', errorMessage(err));
        tlsStatus = { ok: false, error: errorMessage(err) };
      }

      return {
        success: true,
        message: 'Proxy updated in Caddy configuration',
        routeIndex: proxy.caddy_route_index,
        tlsStatus
      };
    } catch (error) {
      console.error('Failed to update proxy in Caddy configuration:', error);
      throw new Error(`Failed to update proxy: ${errorMessage(error)}`);
    } finally {
      safeRelease();
    }
  }

  /**
   * Delete a proxy from Caddy configuration. The caller deletes the database row first;
   * this only removes the route, shifts later route indices and updates the DNS-01 policy.
   * @param proxy - Plain data of the deleted proxy (id, caddy_route_index, ssl_type)
   * @returns The result of the operation
   */
  async deleteProxy(proxy: DeletedProxyData): Promise<{ success: boolean; message: string }> {
    const release = await this._configMutex.acquire();
    try {
      // Delete from Caddy configuration if it exists there
      if (proxy.caddy_route_index !== null && proxy.caddy_route_index !== undefined) {
        try {
          // Use DELETE to remove the route
          await axios.delete(
            `${this.getServerRoutesApiPath()}/${proxy.caddy_route_index}`
          );

          // Get all proxies with higher route indices
          const proxiesToUpdate = await Proxy.findAll({
            where: {
              caddy_route_index: {
                [Op.gt]: proxy.caddy_route_index
              }
            }
          });

          // Update their route indices
          for (const p of proxiesToUpdate) {
            await p.update({
              caddy_route_index: (p.caddy_route_index as number) - 1
            });
          }

          // Backup the updated configuration
          await this.backupCurrentConfig();
        } catch (error) {
          console.error('Failed to delete proxy from Caddy (continuing anyway):', error);
        }
      }

      // Drop its domains from the DNS-01 policy
      if (proxy.ssl_type === 'cloudflare') {
        try {
          const config = await this.getConfig();
          this.setCloudflarePolicy(config, await this.cloudflareDomains());
          await this.loadConfig(config);
        } catch (error) {
          console.error('Failed to update Cloudflare policy after delete:', errorMessage(error));
        }
      }

      return {
        success: true,
        message: 'Proxy deleted from Caddy configuration'
      };
    } catch (error) {
      console.error('Failed to delete proxy from Caddy configuration:', error);
      throw new Error(`Failed to delete proxy: ${errorMessage(error)}`);
    } finally {
      release();
    }
  }

  /**
   * Apply a template to a proxy in Caddy configuration
   * @param proxy - The proxy object
   * @param template - The template object
   * @returns The result of the operation
   */
  async applyTemplate(proxy: Proxy, template: TemplateInput): Promise<ProxyOperationResult> {
    try {
      // First get the current config to show what will change
      const oldConfig = await this.getConfig();
      const oldServerConfig = this.ensureHttpServer(oldConfig);
      const oldRoute = oldServerConfig.routes[proxy.caddy_route_index as number];

      // First apply the template headers and middlewares to the proxy
      await sequelize.transaction(async (transaction) => {
        // Remove any existing headers and middlewares
        await Header.destroy({
          where: { proxy_id: proxy.id },
          transaction
        });
        await Middleware.destroy({
          where: { proxy_id: proxy.id },
          transaction
        });

        // Add template headers
        if (template.headers && template.headers.length > 0) {
          await Promise.all(template.headers.map(header =>
            Header.create({
              proxy_id: proxy.id,
              header_type: header.header_type,
              header_name: header.header_name,
              header_value: header.header_value,
              enabled: true // Explicitly enable headers from template
            } as CreationAttributes<Header>, { transaction })
          ));
        }

        // Add template middlewares
        for (const middleware of template.middleware || []) {
          await Middleware.create({
            proxy_id: proxy.id,
            middleware_type: middleware.middleware_type,
            configuration: middleware.configuration,
            order: middleware.order || 0,
            enabled: middleware.enabled !== false
          } as CreationAttributes<Middleware>, { transaction });
        }
      });

      // Reload proxy with its new headers and middlewares and update Caddy (the update
      // builds the route from this instance, so both must be loaded)
      await proxy.reload({
        include: [
          { model: Header, as: 'headers' },
          { model: Middleware, as: 'middlewares' }
        ]
      });
      return await this.updateProxy(proxy);
    } catch (error) {
      console.error('Failed to apply template to proxy in Caddy configuration:', error);
      throw new Error(`Failed to apply template: ${errorMessage(error)}`);
    }
  }

  /**
   * Include Caddy configuration in a backup
   * @param backupData - The backup data object
   * @returns The updated backup data
   */
  async includeInBackup(backupData: BackupData): Promise<BackupData> {
    try {
      // Get current config
      const config = await this.getConfig();

      // Add to backup data; custom certificates are restored from the database instead
      backupData.caddy_config = withoutCustomCertificates(config);

      return backupData;
    } catch (error) {
      console.error('Failed to include Caddy configuration in backup:', error);
      // Don't fail the entire backup if this fails
      backupData.caddy_config_error = errorMessage(error);
      return backupData;
    }
  }

  /**
   * Restore Caddy configuration from a backup
   * @param backupData - The backup data object
   * @returns The result of the operation
   */
  async restoreFromBackup(backupData: BackupData): Promise<{ success: boolean; message: string }> {
    try {
      // Check if we have Caddy configuration in the backup
      if (!backupData.caddy_config) {
        throw new Error('No Caddy configuration found in backup data');
      }

      // Load the configuration
      await this.loadConfig(backupData.caddy_config);

      // Backup the restored configuration
      await this.backupConfig(backupData.caddy_config);

      return {
        success: true,
        message: 'Caddy configuration restored from backup'
      };
    } catch (error) {
      console.error('Failed to restore Caddy configuration from backup:', error);
      throw new Error(`Failed to restore configuration: ${errorMessage(error)}`);
    }
  }

  // Helper: perform TLS verification for a list of domains
  verifyTlsForDomains(domains: string[] = [], timeoutMs = 10000): Promise<TlsVerification> {
    const checkDomain = (domain: string): Promise<TlsDomainResult> => {
      return new Promise((resolve) => {
        const socket = tls.connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: false }, () => {
          try {
            const cert = socket.getPeerCertificate();
            socket.end();
            if (cert && Object.keys(cert).length > 0) {
              const issuerName = cert.issuer ? (cert.issuer.O || cert.issuer.CN || null) : null;
              const issuer = Array.isArray(issuerName) ? issuerName.join(', ') : issuerName;
              resolve({ domain, ok: true, certSubject: cert.subject, issuer, validFrom: cert.valid_from, validTo: cert.valid_to });
            } else {
              resolve({ domain, ok: false, error: 'No certificate presented' });
            }
          } catch (err) {
            resolve({ domain, ok: false, error: errorMessage(err) });
          }
        });

        socket.setTimeout(timeoutMs, () => {
          socket.destroy();
          resolve({ domain, ok: false, error: 'TLS handshake timed out' });
        });

        socket.on('error', (err) => {
          resolve({ domain, ok: false, error: errorMessage(err) });
        });
      });
    };

    return Promise.all(domains.map(d => checkDomain(d))).then(results => {
      const ok = results.every(r => r.ok === true);
      return { ok, results };
    });
  }
}

export const caddyService = new CaddyService();
