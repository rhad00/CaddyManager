const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const tls = require('tls');
const { sequelize, Proxy, Header, Middleware } = require('../models');
const { Op } = require('sequelize');
require('dotenv').config();

/**
 * Minimal promise-chain mutex — no external dependency required.
 * All callers that need to read-modify-write the Caddy config must
 * acquire this lock to prevent TOCTOU races and stale-index corruption.
 */
class Mutex {
  constructor() {
    this._queue = Promise.resolve();
  }

  /** Acquire the lock; returns a release function to call in a finally block. */
  acquire() {
    let release;
    const next = new Promise((resolve) => { release = resolve; });
    const current = this._queue;
    this._queue = this._queue.then(() => next);
    return current.then(() => release);
  }
}

/**
 * Service for interacting with Caddy's Admin API
 */
class CaddyService {
  constructor() {
    this.apiUrl = process.env.CADDY_API_URL || 'http://localhost:2019';
    this.serverName = process.env.CADDY_SERVER_NAME || 'srv0';
    this.configBackupDir = process.env.CONFIG_BACKUP_DIR || path.join(__dirname, '../../config_backups');
    this.configBackupFile = path.join(this.configBackupDir, 'caddy_config_backup.json');
    this._configMutex = new Mutex();
     // defer any async initialization to initializeConfig
  }

  ensureHttpServer(config) {
    config.apps = config.apps || {};
    config.apps.http = config.apps.http || {};
    config.apps.http.servers = config.apps.http.servers || {};
    config.apps.http.servers[this.serverName] = config.apps.http.servers[this.serverName] || {
      listen: [':80'],
      routes: []
    };

    return config.apps.http.servers[this.serverName];
  }

  getServerRoutesApiPath() {
    return `${this.apiUrl}/config/apps/http/servers/${this.serverName}/routes`;
  }

  /**
   * Ensure Cloudflare DNS ACME automation policy exists in the Caddy config
   * This will add a TLS automation policy using the Cloudflare DNS provider
   * and reference the token via the environment variable placeholder so the
   * Caddy process can read it at runtime.
   * @param {Object} config - The Caddy JSON config to modify
   * @param {string[]} domains - The domains this policy should cover
   * @param {boolean} force - Whether to add the policy even if CF_API_TOKEN is not detected in backend env
   */
  ensureCloudflarePolicy(config, domains = [], force = false) {
    try {
      const tokenPresent = !!process.env.CF_API_TOKEN;
      console.log(`[CaddyService] ensureCloudflarePolicy: Token present? ${tokenPresent}, Force? ${force}`);

      if (!tokenPresent && !force) {
        console.log('[CaddyService] ensureCloudflarePolicy: Skipping policy addition because CF_API_TOKEN is missing and force is false');
        return config;
      }

      config.apps = config.apps || {};
      config.apps.tls = config.apps.tls || {};
      config.apps.tls.automation = config.apps.tls.automation || {};
      config.apps.tls.automation.policies = config.apps.tls.automation.policies || [];

      const newSubjects = Array.isArray(domains) ? [...domains] : [domains];

      // Find the canonical Cloudflare ACME policy — identified by the
      // presence of a Cloudflare DNS challenge issuer.  We maintain ONE such
      // policy and merge domains into it rather than accumulating N policies.
      const policies = config.apps.tls.automation.policies;
      const existingPolicyIdx = policies.findIndex(p =>
        Array.isArray(p.issuers) &&
        p.issuers.some(
          iss => iss.challenges &&
                 iss.challenges.dns &&
                 iss.challenges.dns.provider &&
                 iss.challenges.dns.provider.name === 'cloudflare'
        )
      );

      if (existingPolicyIdx !== -1) {
        // Merge new domains into the existing policy's subjects array.
        const existingPolicy = policies[existingPolicyIdx];
        const existingSubjects = Array.isArray(existingPolicy.subjects)
          ? existingPolicy.subjects
          : [];
        const merged = Array.from(new Set([...existingSubjects, ...newSubjects]));
        existingPolicy.subjects = merged;
        console.log('[CaddyService] Merged Cloudflare DNS policy subjects:', merged.join(','));
      } else {
        // Create the first (and only) Cloudflare ACME policy.
        const policy = {
          subjects: newSubjects,
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
        };
        policies.push(policy);
        console.log('[CaddyService] Added Cloudflare DNS automation policy for domains:', newSubjects.join(','));
      }

      return config;
    } catch (err) {
      console.error('Failed to ensure Cloudflare policy on config:', err.message);
      return config;
    }
  }

  /**
   * Ensure Caddy access logging is configured in the given config object.
   * Writes structured JSON access logs to a file readable by the backend log service.
   */
  ensureAccessLogging(config) {
    try {
      const logFile = process.env.CADDY_ACCESS_LOG || '/app/logs/access.log';

      const serverConfig = this.ensureHttpServer(config);
      serverConfig.logs = {
        default_logger_name: 'access'
      };

      // Add top-level logging configuration
      config.logging = config.logging || {};
      config.logging.logs = config.logging.logs || {};
      config.logging.logs.access = {
        writer: {
          output: 'file',
          filename: logFile,
        },
        encoder: { format: 'json' },
        include: [`http.log.access.${this.serverName}`],
      };

      return config;
    } catch (err) {
      console.error('Failed to ensure access logging config:', err.message);
      return config;
    }
  }

  /**
   * Ensure config backup directory exists
   */
  async ensureConfigBackupDir() {
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
  async initializeConfig() {
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
        const config = JSON.parse(configData);

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
      throw new Error(`Failed to initialize Caddy configuration: ${error.message}`);
    }
  }

  /**
   * Rebuild Caddy configuration from database
   */
  async rebuildConfigFromDatabase() {
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
      const uniqueDomains = new Set();
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
      const caddyManagerRoutes = serverConfig.routes.filter(route =>
        (route.handle && route.handle[0] && route.handle[0].handler === "reverse_proxy" &&
          (route.handle[0].upstreams && route.handle[0].upstreams.some(u => u.dial.includes("backend:3000"))))
        ||
        (route.handle && route.handle[0] && route.handle[0].handler === "reverse_proxy" &&
          (route.handle[0].upstreams && route.handle[0].upstreams.some(u => u.dial.includes("frontend:80"))))
      );

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

      // Load the updated configuration
      // Ensure Cloudflare automation policy exists for any ACME/cloudflare proxies
      const allDomains = proxies.flatMap(p => Array.isArray(p.domains) ? p.domains : [p.domains]);
      const hasCloudflareProxy = proxies.some(p => p.ssl_type === 'cloudflare');
      this.ensureCloudflarePolicy(currentConfig, allDomains, hasCloudflareProxy);
      this.ensureAccessLogging(currentConfig);
      await this.loadConfig(currentConfig);

      // Backup the configuration
      await this.backupConfig(currentConfig);

      console.log(`Rebuilt configuration with ${proxies.length} proxies from database`);
    } catch (error) {
      console.error('Failed to rebuild configuration from database:', error);
      throw new Error(`Failed to rebuild configuration: ${error.message}`);
    }
  }

  /**
   * Get the current Caddy configuration
   * @returns {Promise<Object>} The current configuration
   */
  async getConfig() {
    try {
      const response = await axios.get(`${this.apiUrl}/config/`);
      return response.data;
    } catch (error) {
      console.error('Failed to get Caddy configuration:', error.message);
      throw new Error(`Failed to get configuration: ${error.message}`);
    }
  }

  /**
   * Load a complete configuration into Caddy
   * @param {Object} config - The configuration to load
   */
  async loadConfig(config) {
    try {
      await axios.post(`${this.apiUrl}/load`, config, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Failed to load Caddy configuration:', error.message);
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Backup the current Caddy configuration
   */
  async backupCurrentConfig() {
    try {
      const config = await this.getConfig();
      await this.backupConfig(config);
    } catch (error) {
      console.error('Failed to backup current configuration:', error);
      throw new Error(`Failed to backup configuration: ${error.message}`);
    }
  }

  /**
   * Backup a Caddy configuration
   * @param {Object} config - The configuration to backup
   */
  async backupConfig(config) {
    try {
      await fs.writeFile(
        this.configBackupFile,
        JSON.stringify(config, null, 2),
        'utf8'
      );
      console.log(`Configuration backed up to ${this.configBackupFile}`);
    } catch (error) {
      console.error('Failed to backup configuration:', error);
      throw new Error(`Failed to backup configuration: ${error.message}`);
    }
  }

  /**
   * Create a route configuration from a proxy
   * @param {Object} proxy - The proxy object from the database
   * @returns {Object} The route configuration
   */
  createRouteFromProxy(proxy) {
    // Start with the handlers array
    const handlers = [];

    // Add rate limiting if enabled
    if (proxy.rate_limit && proxy.rate_limit.enabled) {
      handlers.push({
        handler: "rate_limit",
        rate_limits: {
          default: {
            key: "{http.request.remote.host}",
            window: "1s",
            max_events: proxy.rate_limit.burst || proxy.rate_limit.requests_per_second
          }
        }
      });
    }

    // Add IP filtering if enabled using Caddy's built-in remote_ip matcher
    if (proxy.ip_filtering && proxy.ip_filtering.enabled && proxy.ip_filtering.ip_list && proxy.ip_filtering.ip_list.length > 0) {
      const ipRanges = proxy.ip_filtering.ip_list.slice(0, 10); // Maximum 10 IPs/ranges
      
      if (proxy.ip_filtering.mode === "deny") {
        // Deny mode: block specified IPs
        handlers.push({
          handler: "subroute",
          routes: [{
            match: [{
              remote_ip: {
                ranges: ipRanges
              }
            }],
            handle: [{
              handler: "static_response",
              status_code: 403,
              body: "Access denied"
            }]
          }]
        });
      } else {
        // Allow mode: only allow specified IPs (deny all others)
        handlers.push({
          handler: "subroute",
          routes: [{
            match: [{
              not: [{
                remote_ip: {
                  ranges: ipRanges
                }
              }]
            }],
            handle: [{
              handler: "static_response",
              status_code: 403,
              body: "Access denied"
            }]
          }]
        });
      }
    }

    // Add basic authentication if enabled
    if (proxy.basic_auth && proxy.basic_auth.enabled) {
      handlers.push({
        handler: "basic_auth",
        users: {
          [proxy.basic_auth.username]: proxy.basic_auth.hashed_password
        }
      });
    }


    // Add compression if enabled
    if (proxy.compression_enabled) {
      handlers.push({
        handler: "encode",
        encodings: {
          gzip: {},
          zstd: {}
        }
      });
    }

    let reverseProxyHandler;

    // Handle path-based routing or default reverse proxy
    if (proxy.path_routing && proxy.path_routing.enabled && proxy.path_routing.routes && proxy.path_routing.routes.length > 0) {
      // For path-based routing, we'll create a subroute handler
      handlers.push({
        handler: "subroute",
        routes: proxy.path_routing.routes.map(route => ({
          match: [{
            path: [route.path]
          }],
          handle: [{
            handler: "reverse_proxy",
            upstreams: [{
              dial: route.upstream_url
            }]
          }]
        }))
      });
    } else {
      // Create the default reverse proxy handler
      // Determine upstreams: load balancing multi-upstream takes priority over single url
      let upstreams;
      let lbPolicy = null;

      if (proxy.load_balancing && proxy.load_balancing.enabled && proxy.load_balancing.upstreams && proxy.load_balancing.upstreams.length > 0) {
        upstreams = proxy.load_balancing.upstreams.map(u => {
          const entry = { dial: u.url };
          if (u.weight !== undefined && u.weight !== null) entry.max_requests = u.weight; // weight maps to max_requests for weighted round-robin
          return entry;
        });
        const policy = proxy.load_balancing.policy || 'round_robin';
        lbPolicy = { selection_policy: { policy } };
      } else {
        upstreams = [{ dial: proxy.upstream_url }];
      }

      reverseProxyHandler = {
        handler: "reverse_proxy",
        upstreams
      };

      // Add load balancing policy if multiple upstreams
      if (lbPolicy) {
        reverseProxyHandler.load_balancing = lbPolicy;
      }

      // Add active health checks if enabled
      if (proxy.health_checks && proxy.health_checks.enabled) {
        reverseProxyHandler.health_checks = {
          active: {
            path: proxy.health_checks.path || '/health',
            interval: proxy.health_checks.interval || '30s',
            timeout: proxy.health_checks.timeout || '5s',
            max_fails: proxy.health_checks.max_fails || 3
          }
        };
      }

      // Process headers
      if (proxy.headers && proxy.headers.length > 0) {
        const enabledHeaders = proxy.headers.filter(header => header.enabled);
        const requestHeaders = {};
        const responseHeaders = {};

        // Group headers by type
        for (const header of enabledHeaders) {
          const headerName = header.header_name;
          const headerValue = header.header_value;

          if (header.header_type === 'request') {
            requestHeaders[headerName] = [headerValue];
          } else if (header.header_type === 'response') {
            responseHeaders[headerName] = [headerValue];
          }
        }

        // Add headers to reverse proxy configuration
        if (Object.keys(requestHeaders).length > 0 || Object.keys(responseHeaders).length > 0) {
          reverseProxyHandler.headers = {};

          if (Object.keys(requestHeaders).length > 0) {
            reverseProxyHandler.headers.request = {
              set: requestHeaders
            };
          }

          if (Object.keys(responseHeaders).length > 0) {
            reverseProxyHandler.headers.response = {
              set: responseHeaders
            };
          }
        }
      }

      // Add transport config if using HTTPS
      if (this.shouldUseHTTPSTransport(proxy.upstream_url)) {
        const skipVerify = proxy.skip_tls_verify !== undefined ? proxy.skip_tls_verify : false;
        reverseProxyHandler.transport = {
          protocol: "http",
          tls: {
            insecure_skip_verify: skipVerify
          }
        };
      }

      handlers.push(reverseProxyHandler);
    }

    // Create the route with all handlers
    const route = {
      match: [{
        host: Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains]
      }],
      handle: handlers
    };

    // Make sure the route has a terminal handler (reverse_proxy)
    if (!route.handle.some(h => h.handler === 'reverse_proxy' || h.handler === 'subroute')) {
      console.error('Route is missing terminal handler:', route);
      throw new Error('Invalid route configuration: missing terminal handler');
    }

    return route;
  }

  /**
   * Check if the upstream URL should use HTTPS transport configuration
   * @param {string} upstreamUrl - The upstream URL to check
   * @returns {boolean} True if HTTPS transport should be used
   */
  shouldUseHTTPSTransport(upstreamUrl) {
    return upstreamUrl.includes(':443') || upstreamUrl.startsWith('https://');
  }

  /**
   * Add a proxy to Caddy configuration
   * @param {Object} proxy - The proxy object from the database
   * @returns {Promise<Object>} The result of the operation
   */
  async addProxy(proxy) {
    const release = await this._configMutex.acquire();
    try {
      // Get current config
      const config = await this.getConfig();

      // Ensure the HTTP server exists
      const serverConfig = this.ensureHttpServer(config);

      // Check for existing routes with the same domains and upstream URL
      const existingRoutes = serverConfig.routes;
      const proxyDomains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
      const domainKey = proxyDomains.sort().join(',');

      const existingRoute = existingRoutes.find(route => {
        if (route.match && route.match[0] && route.match[0].host &&
          route.handle && route.handle[0] && route.handle[0].handler === "reverse_proxy" &&
          route.handle[0].upstreams && route.handle[0].upstreams[0]) {
          const routeDomains = route.match[0].host;
          const routeDomainKey = Array.isArray(routeDomains) ? routeDomains.sort().join(',') : routeDomains;
          const routeUpstream = route.handle[0].upstreams[0].dial;
          return routeDomainKey === domainKey && routeUpstream === proxy.upstream_url;
        }
        return false;
      });

      // If a route with these domains and upstream exists, throw an error
      if (existingRoute) {
        throw new Error('A proxy with the same domain and upstream URL already exists');
      }

      // Create the route for this proxy
      const route = this.createRouteFromProxy(proxy);

      // Use POST to add the route
      await axios.post(
        this.getServerRoutesApiPath(),
        route,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Get updated config to find the new route's index
      const updatedConfig = await this.getConfig();
      const updatedServerConfig = this.ensureHttpServer(updatedConfig);
      const newRouteIndex = updatedServerConfig.routes.length - 1;

      // Update the proxy with its route index
      await proxy.update({
        caddy_route_index: newRouteIndex
      });

      // Backup the updated configuration
      await this.backupCurrentConfig();

      // If the proxy uses ACME or Cloudflare for TLS, ensure Cloudflare policy and perform a short TLS verification to detect ACME failures
      let tlsStatus = null;
      try {
        if (proxy.ssl_type === 'acme' || proxy.ssl_type === 'cloudflare') {
          const domains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
          try {
            // Ensure the Cloudflare policy is present on current config before verifying
            const config = await this.getConfig();
            const force = proxy.ssl_type === 'cloudflare';
            this.ensureCloudflarePolicy(config, domains, force);
            await this.loadConfig(config);
          } catch (err) {
            console.error('Failed to ensure Cloudflare policy before TLS verification:', err.message);
          }
          tlsStatus = await this.verifyTlsForDomains(domains, 10000);
          if (!tlsStatus.ok) {
            console.error('TLS verification failed for proxy domains:', tlsStatus);
          }

          // Persist TLS status on the proxy record so frontend can display it
          try {
            await proxy.update({ tls_status: tlsStatus, tls_checked_at: new Date() });
          } catch (err) {
            console.error('Failed to persist TLS status on proxy record:', err.message);
          }
        }
      } catch (err) {
        console.error('Error while verifying TLS for domains:', err.message);
        tlsStatus = { ok: false, error: err.message };
      }

      return {
        success: true,
        message: 'Proxy added to Caddy configuration',
        routeIndex: newRouteIndex,
        tlsStatus
      };
    } catch (error) {
      console.error('Failed to add proxy to Caddy configuration:', error);
      throw new Error(`Failed to add proxy: ${error.message}`);
    } finally {
      release();
    }
  }

  /**
   * Update a proxy in Caddy configuration
   * @param {Object} proxy - The updated proxy object from the database
   * @returns {Promise<Object>} The result of the operation
   */
  async updateProxy(proxy) {
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
      // Ensure Cloudflare policy for this proxy's domains if needed
      if (proxy.ssl_type === 'cloudflare' || proxy.ssl_type === 'acme') {
        const force = proxy.ssl_type === 'cloudflare';
        this.ensureCloudflarePolicy(config, Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains], force);
      }
      await this.loadConfig(config);

      // Backup the configuration
      await this.backupCurrentConfig();
      // If the proxy uses ACME for TLS, perform a short TLS verification
      let tlsStatus = null;
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
            console.error('Failed to persist TLS status on proxy record (update):', err.message);
          }
        }
      } catch (err) {
        console.error('Error while verifying TLS for domains:', err.message);
        tlsStatus = { ok: false, error: err.message };
      }

      return {
        success: true,
        message: 'Proxy updated in Caddy configuration',
        routeIndex: proxy.caddy_route_index,
        tlsStatus
      };
    } catch (error) {
      console.error('Failed to update proxy in Caddy configuration:', error);
      throw new Error(`Failed to update proxy: ${error.message}`);
    } finally {
      safeRelease();
    }
  }

  /**
   * Delete a proxy from Caddy configuration
   * @param {Object} proxy - The proxy object to delete
   * @returns {Promise<Object>} The result of the operation
   */
  async deleteProxy(proxy) {
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
              caddy_route_index: p.caddy_route_index - 1
            });
          }

          // Backup the updated configuration
          await this.backupCurrentConfig();
        } catch (error) {
          console.error('Failed to delete proxy from Caddy (continuing anyway):', error);
        }
      }

      // Always delete the proxy from the database
      await proxy.destroy();

      return {
        success: true,
        message: 'Proxy deleted from Caddy configuration'
      };
    } catch (error) {
      console.error('Failed to delete proxy from Caddy configuration:', error);
      throw new Error(`Failed to delete proxy: ${error.message}`);
    } finally {
      release();
    }
  }

  /**
   * Apply a template to a proxy in Caddy configuration
   * @param {Object} proxy - The proxy object
   * @param {Object} template - The template object
   * @returns {Promise<Object>} The result of the operation
   */
  async applyTemplate(proxy, template) {
    try {
      // First get the current config to show what will change
      const oldConfig = await this.getConfig();
      const oldServerConfig = this.ensureHttpServer(oldConfig);
      const oldRoute = oldServerConfig.routes[proxy.caddy_route_index];

      // First apply the template headers to the proxy
      await sequelize.transaction(async (transaction) => {
        // Remove any existing headers
        await Header.destroy({
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
            }, { transaction })
          ));
        }
      });

      // Reload proxy with new headers and update Caddy
      await proxy.reload({ include: [{ model: Header, as: 'headers' }] });
      return await this.updateProxy(proxy);
    } catch (error) {
      console.error('Failed to apply template to proxy in Caddy configuration:', error);
      throw new Error(`Failed to apply template: ${error.message}`);
    }
  }

  /**
   * Include Caddy configuration in a backup
   * @param {Object} backupData - The backup data object
   * @returns {Promise<Object>} The updated backup data
   */
  async includeInBackup(backupData) {
    try {
      // Get current config
      const config = await this.getConfig();

      // Add to backup data
      backupData.caddy_config = config;

      return backupData;
    } catch (error) {
      console.error('Failed to include Caddy configuration in backup:', error);
      // Don't fail the entire backup if this fails
      backupData.caddy_config_error = error.message;
      return backupData;
    }
  }

  /**
   * Restore Caddy configuration from a backup
   * @param {Object} backupData - The backup data object
   * @returns {Promise<Object>} The result of the operation
   */
  async restoreFromBackup(backupData) {
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
      throw new Error(`Failed to restore configuration: ${error.message}`);
    }
  }

  // Helper: perform TLS verification for a list of domains
  verifyTlsForDomains(domains = [], timeoutMs = 10000) {
    const checkDomain = (domain) => {
      return new Promise((resolve) => {
        const socket = tls.connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: false }, () => {
          try {
            const cert = socket.getPeerCertificate();
            socket.end();
            if (cert && Object.keys(cert).length > 0) {
              resolve({ domain, ok: true, certSubject: cert.subject, validFrom: cert.valid_from, validTo: cert.valid_to });
            } else {
              resolve({ domain, ok: false, error: 'No certificate presented' });
            }
          } catch (err) {
            resolve({ domain, ok: false, error: err.message });
          }
        });

        socket.setTimeout(timeoutMs, () => {
          socket.destroy();
          resolve({ domain, ok: false, error: 'TLS handshake timed out' });
        });

        socket.on('error', (err) => {
          resolve({ domain, ok: false, error: err.message });
        });
      });
    };

    return Promise.all(domains.map(d => checkDomain(d))).then(results => {
      const ok = results.every(r => r.ok === true);
      return { ok, results };
    });
  }
}

module.exports = new CaddyService();
