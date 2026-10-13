const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const tls = require('tls');
const { sequelize, Proxy, Header, Middleware, Certificate } = require('../models');
const { Op } = require('sequelize');
const { parseUpstream } = require('../utils/upstream');
const { toCaddyAuthHandler } = require('../utils/basicAuth');
const { withCustomCertificates, withoutCustomCertificates } = require('../utils/caddyTls');
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
   * Make the Cloudflare DNS-01 automation policy cover exactly `domains`.
   * One policy is kept for all Cloudflare proxies; it is removed when none remain.
   * Other automation policies are left untouched. The token is resolved by Caddy from
   * its own environment ({env.CF_API_TOKEN}), so the backend does not need it.
   * @param {Object} config - Caddy JSON config (modified in place and returned)
   * @param {string[]} domains - domains of all active Cloudflare proxies
   * @returns {Object} config
   */
  setCloudflarePolicy(config, domains) {
    const subjects = [...new Set(domains)].sort();
    const isCloudflarePolicy = (policy) =>
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
   * @returns {Promise<string[]>}
   */
  async cloudflareDomains() {
    const proxies = await Proxy.findAll({ where: { ssl_type: 'cloudflare', status: 'active' } });
    return proxies.flatMap(p => (Array.isArray(p.domains) ? p.domains : [p.domains]));
  }

  /**
   * Ensure Caddy access logging is configured in the given config object.
   * Writes structured JSON access logs to a file readable by the backend log service.
   */
  ensureAccessLogging(config) {
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
   * Current config with CaddyManager-managed private keys removed; safe to persist or export
   * @returns {Promise<Object>}
   */
  async getCaddyConfig() {
    return withoutCustomCertificates(await this.getConfig());
  }

  /**
   * Uploaded and self-signed certificates to serve (private keys decrypted by the model)
   * @returns {Promise<Array>}
   */
  async loadCustomCertificates() {
    const certificates = await Certificate.findAll({
      where: {
        type: ['uploaded', 'self-signed'],
        status: { [Op.ne]: 'revoked' }
      }
    });
    return certificates.filter(c => c.certificate_pem && c.private_key_pem);
  }

  /**
   * Re-push the running config so Caddy picks up added or removed custom certificates
   */
  async syncCustomCertificates() {
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
   * @param {Object} config - The configuration to load
   */
  async loadConfig(config) {
    try {
      const fullConfig = withCustomCertificates(config, await this.loadCustomCertificates());
      await axios.post(`${this.apiUrl}/load`, fullConfig, {
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
   * Backup after Caddy has accepted a change. Caddy already runs the new config, so a
   * failed backup is logged instead of failing (and rolling back) the change.
   */
  async backupAfterChange() {
    try {
      await this.backupCurrentConfig();
    } catch (error) {
      console.error('Config backup failed after a successful Caddy change:', error.message);
    }
  }

  /**
   * Backup a Caddy configuration
   * @param {Object} config - The configuration to backup
   */
  async backupConfig(config) {
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
    const authHandler = toCaddyAuthHandler(proxy.basic_auth);
    if (authHandler) {
      handlers.push(authHandler);
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
        routes: proxy.path_routing.routes.map(route => {
          const upstream = parseUpstream(route.upstream_url);
          const pathHandler = {
            handler: "reverse_proxy",
            upstreams: [{ dial: upstream.dial }]
          };
          if (upstream.useTls) {
            pathHandler.transport = this.buildTlsTransport(proxy);
          }
          return {
            match: [{
              path: [route.path]
            }],
            handle: [pathHandler]
          };
        })
      });
    } else {
      // Create the default reverse proxy handler
      // Determine upstreams: load balancing multi-upstream takes priority over single url
      let upstreams;
      let lbPolicy = null;

      if (proxy.load_balancing && proxy.load_balancing.enabled && proxy.load_balancing.upstreams && proxy.load_balancing.upstreams.length > 0) {
        upstreams = proxy.load_balancing.upstreams.map(u => ({ dial: parseUpstream(u.url).dial }));
        lbPolicy = { selection_policy: this.buildSelectionPolicy(proxy.load_balancing) };
      } else {
        upstreams = [{ dial: parseUpstream(proxy.upstream_url).dial }];
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
        // Caddy's active checks use `uri` (`path` is deprecated) and `fails`
        // (consecutive failures before an upstream is marked down); `max_fails`
        // only exists on passive checks and makes Caddy reject the config.
        reverseProxyHandler.health_checks = {
          active: {
            uri: proxy.health_checks.path || '/health',
            interval: proxy.health_checks.interval || '30s',
            timeout: proxy.health_checks.timeout || '5s',
            fails: proxy.health_checks.max_fails || 3
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

      // Add transport config if using HTTPS. One transport serves every upstream of the
      // handler, so a load-balanced pool uses TLS when any of its members does.
      const upstreamUrls = lbPolicy
        ? proxy.load_balancing.upstreams.map(u => u.url)
        : [proxy.upstream_url];
      if (upstreamUrls.some(u => this.shouldUseHTTPSTransport(u))) {
        reverseProxyHandler.transport = this.buildTlsTransport(proxy);
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
    return parseUpstream(upstreamUrl).useTls;
  }

  /**
   * Caddy selection policy for a load-balanced pool.
   * Weights only apply to round robin: Caddy's weighted_round_robin takes a `weights`
   * array in upstream order. "weighted" is accepted as the documented alias.
   * @param {Object} loadBalancing - proxy.load_balancing
   * @returns {Object} selection_policy config
   */
  buildSelectionPolicy(loadBalancing) {
    const requested = loadBalancing.policy || 'round_robin';
    const upstreams = loadBalancing.upstreams || [];
    const hasWeights = upstreams.some(u => u.weight !== undefined && u.weight !== null && u.weight !== '');
    const roundRobin = ['round_robin', 'weighted', 'weighted_round_robin'].includes(requested);

    if (roundRobin && (hasWeights || requested !== 'round_robin')) {
      return {
        policy: 'weighted_round_robin',
        weights: upstreams.map(u => {
          const weight = parseInt(u.weight, 10);
          return Number.isInteger(weight) && weight > 0 ? weight : 1;
        })
      };
    }
    return { policy: requested };
  }

  /**
   * HTTP transport that speaks TLS to the upstream
   * @param {Object} proxy - The proxy (for skip_tls_verify)
   * @returns {Object} Caddy reverse_proxy transport config
   */
  buildTlsTransport(proxy) {
    return {
      protocol: "http",
      tls: {
        insecure_skip_verify: proxy.skip_tls_verify === true
      }
    };
  }

  /**
   * Add a proxy to Caddy configuration
   * @param {Object} proxy - The proxy object from the database
   * @returns {Promise<Object>} The result of the operation
   */
  async addProxy(proxy) {
    const release = await this._configMutex.acquire();
    let newRouteIndex = null;
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
        if (route.match && route.match[0] && route.match[0].host &&
          route.handle && route.handle[0] && route.handle[0].handler === "reverse_proxy" &&
          route.handle[0].upstreams && route.handle[0].upstreams[0]) {
          const routeDomains = route.match[0].host;
          const routeDomainKey = Array.isArray(routeDomains) ? routeDomains.sort().join(',') : routeDomains;
          const routeUpstream = route.handle[0].upstreams[0].dial;
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
      let tlsStatus = null;
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
      // The caller discards the proxy, so the route must not stay live in Caddy
      if (routePosted) {
        try {
          await axios.delete(`${this.getServerRoutesApiPath()}/${newRouteIndex}`);
        } catch (cleanupError) {
          console.error(`Failed to remove route ${newRouteIndex} after a failed add:`, cleanupError.message);
        }
      }
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
      // Recompute the DNS-01 policy: this proxy may have joined, left or changed domains
      this.setCloudflarePolicy(config, await this.cloudflareDomains());
      await this.loadConfig(config);

      await this.backupAfterChange();
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
   * Delete a proxy from Caddy configuration. The caller deletes the database row first;
   * this only removes the route, shifts later route indices and updates the DNS-01 policy.
   * @param {Object} proxy - Plain data of the deleted proxy (id, caddy_route_index, ssl_type)
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

      // Drop its domains from the DNS-01 policy
      if (proxy.ssl_type === 'cloudflare') {
        try {
          const config = await this.getConfig();
          this.setCloudflarePolicy(config, await this.cloudflareDomains());
          await this.loadConfig(config);
        } catch (error) {
          console.error('Failed to update Cloudflare policy after delete:', error.message);
        }
      }

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

      // Add to backup data; custom certificates are restored from the database instead
      backupData.caddy_config = withoutCustomCertificates(config);

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
              const issuer = cert.issuer ? (cert.issuer.O || cert.issuer.CN || null) : null;
              resolve({ domain, ok: true, certSubject: cert.subject, issuer, validFrom: cert.valid_from, validTo: cert.valid_to });
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
