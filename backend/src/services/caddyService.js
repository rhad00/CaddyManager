const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { sequelize, Proxy, Header, Middleware } = require('../models');
const { Op } = require('sequelize');
require('dotenv').config();

/**
 * Service for interacting with Caddy's Admin API
 */
class CaddyService {
  constructor() {
    this.apiUrl = process.env.CADDY_API_URL || 'http://localhost:2019';
    this.configBackupDir = process.env.CONFIG_BACKUP_DIR || path.join(__dirname, '../../config_backups');
    this.configBackupFile = path.join(this.configBackupDir, 'caddy_config_backup.json');
    
    // Ensure config backup directory exists
    this.ensureConfigBackupDir();
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
      
      // Ensure the HTTP server exists in the config
      if (!currentConfig.apps || !currentConfig.apps.http || !currentConfig.apps.http.servers) {
        currentConfig.apps = currentConfig.apps || {};
        currentConfig.apps.http = currentConfig.apps.http || {};
        currentConfig.apps.http.servers = currentConfig.apps.http.servers || {};
      }
      
      // Ensure the default server exists
      if (!currentConfig.apps.http.servers.srv0) {
        currentConfig.apps.http.servers.srv0 = {
          listen: [":80"],
          routes: []
        };
      }
      
      // Filter out duplicate routes and keep track of unique domains
      const uniqueDomains = new Set();
      const uniqueProxies = proxies.filter(proxy => {
        const domains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
        const domainKey = domains.sort().join(',');
        if (uniqueDomains.has(domainKey)) {
          return false;
        }
        uniqueDomains.add(domainKey);
        return true;
      });

      // Clear existing routes (except for the CaddyManager routes)
      const caddyManagerRoutes = currentConfig.apps.http.servers.srv0.routes.filter(route => 
        (route.handle && route.handle[0] && route.handle[0].handler === "reverse_proxy" && 
         (route.handle[0].upstreams && route.handle[0].upstreams.some(u => u.dial.includes("backend:3000"))))
        ||
        (route.handle && route.handle[0] && route.handle[0].handler === "reverse_proxy" && 
         (route.handle[0].upstreams && route.handle[0].upstreams.some(u => u.dial.includes("frontend:80"))))
      );
      
      currentConfig.apps.http.servers.srv0.routes = caddyManagerRoutes;
      
      // Add routes for each unique proxy
      for (const proxy of uniqueProxies) {
        const route = this.createRouteFromProxy(proxy);
        currentConfig.apps.http.servers.srv0.routes.push(route);
        
        // Update the proxy with its route index
        const routeIndex = currentConfig.apps.http.servers.srv0.routes.length - 1;
        await proxy.update({
          caddy_route_index: routeIndex
        });
      }
      
      // Load the updated configuration
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
        rate: proxy.rate_limit.requests_per_second,
        burst: proxy.rate_limit.burst,
        window: "1s"
      });
    }

    // Add IP filtering if enabled
    if (proxy.ip_filtering && proxy.ip_filtering.enabled) {
      handlers.push({
        handler: "request_filter",
        paths: ["/*"],
        filters: [{
          type: "remote_ip",
          [proxy.ip_filtering.mode === "allow" ? "allow" : "deny"]: proxy.ip_filtering.ip_list
        }]
      });
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
      reverseProxyHandler = {
        handler: "reverse_proxy",
        upstreams: [{
          dial: proxy.upstream_url
        }]
      };

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
        reverseProxyHandler.transport = {
          protocol: "http",
          tls: {
            insecure_skip_verify: true
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
    try {
      // Get current config
      const config = await this.getConfig();
      
      // Ensure the HTTP server exists
      if (!config.apps || !config.apps.http || !config.apps.http.servers || !config.apps.http.servers.srv0) {
        throw new Error('Invalid Caddy configuration: HTTP server not found');
      }

      // Check for existing routes with the same domains and upstream URL
      const existingRoutes = config.apps.http.servers.srv0.routes;
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
        `${this.apiUrl}/config/apps/http/servers/srv0/routes`,
        route,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Get updated config to find the new route's index
      const updatedConfig = await this.getConfig();
      const newRouteIndex = updatedConfig.apps.http.servers.srv0.routes.length - 1;
      
      // Update the proxy with its route index
      await proxy.update({
        caddy_route_index: newRouteIndex
      });
      
      // Backup the updated configuration
      await this.backupCurrentConfig();
      
      return {
        success: true,
        message: 'Proxy added to Caddy configuration',
        routeIndex: newRouteIndex
      };
    } catch (error) {
      console.error('Failed to add proxy to Caddy configuration:', error);
      throw new Error(`Failed to add proxy: ${error.message}`);
    }
  }
  
  /**
   * Update a proxy in Caddy configuration
   * @param {Object} proxy - The updated proxy object from the database
   * @returns {Promise<Object>} The result of the operation
   */
  async updateProxy(proxy) {
    try {
      // Check if we have a route index for this proxy
      if (proxy.caddy_route_index === null || proxy.caddy_route_index === undefined) {
        // No route index, treat as a new proxy
        return await this.addProxy(proxy);
      }
      
      // Get current config
      const config = await this.getConfig();
      
      // Create and apply the updated route
      const route = this.createRouteFromProxy(proxy);
      config.apps.http.servers.srv0.routes[proxy.caddy_route_index] = route;
      await this.loadConfig(config);

      // Backup the configuration
      await this.backupCurrentConfig();
      
      return {
        success: true,
        message: 'Proxy updated in Caddy configuration',
        routeIndex: proxy.caddy_route_index
      };
    } catch (error) {
      console.error('Failed to update proxy in Caddy configuration:', error);
      throw new Error(`Failed to update proxy: ${error.message}`);
    }
  }
  
  /**
   * Delete a proxy from Caddy configuration
   * @param {Object} proxy - The proxy object to delete
   * @returns {Promise<Object>} The result of the operation
   */
  async deleteProxy(proxy) {
    try {
      // Delete from Caddy configuration if it exists there
      if (proxy.caddy_route_index !== null && proxy.caddy_route_index !== undefined) {
        try {
          // Use DELETE to remove the route
          await axios.delete(
            `${this.apiUrl}/config/apps/http/servers/srv0/routes/${proxy.caddy_route_index}`
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
      const oldRoute = oldConfig.apps.http.servers.srv0.routes[proxy.caddy_route_index];

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
}

module.exports = new CaddyService();
