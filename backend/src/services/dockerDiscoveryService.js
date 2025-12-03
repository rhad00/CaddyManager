const Docker = require('dockerode');
const { DiscoveredService, Proxy, Template } = require('../models');
const { Op } = require('sequelize');
const winston = require('winston');

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

class DockerDiscoveryService {
  constructor() {
    this.docker = null;
    this.initialized = false;
    this.pollInterval = parseInt(process.env.DOCKER_POLL_INTERVAL) || 30000; // 30s default
    this.labelPrefix = process.env.DOCKER_LABEL_PREFIX || 'caddymanager';
    this.autoRemoveStopped = process.env.AUTO_REMOVE_STOPPED === 'true';
    this.eventStream = null;
  }

  /**
   * Initialize Docker client
   */
  async initialize() {
    try {
      // Try to connect to Docker socket
      this.docker = new Docker({ socketPath: '/var/run/docker.sock' });

      // Test connection
      await this.docker.ping();
      this.initialized = true;

      logger.info('[DockerDiscovery] Successfully connected to Docker daemon');
      return true;
    } catch (error) {
      logger.error('[DockerDiscovery] Failed to connect to Docker daemon:', error.message);
      logger.info('[DockerDiscovery] Docker discovery will be disabled. Make sure Docker socket is mounted.');
      this.initialized = false;
      return false;
    }
  }

  /**
   * Parse labels from a Docker container
   * Expected labels:
   * - caddymanager.enable=true
   * - caddymanager.domain=api.example.com
   * - caddymanager.port=3000
   * - caddymanager.ssl=cloudflare|acme|none
   * - caddymanager.template=authelia
   * - caddymanager.path_prefix=/api
   */
  parseContainerLabels(container) {
    const labels = container.Labels || {};

    // Check if auto-discovery is enabled
    if (labels[`${this.labelPrefix}.enable`] !== 'true') {
      return null;
    }

    const config = {
      domain: labels[`${this.labelPrefix}.domain`],
      port: labels[`${this.labelPrefix}.port`] || '80',
      ssl_type: labels[`${this.labelPrefix}.ssl`] || 'acme',
      template: labels[`${this.labelPrefix}.template`],
      path_prefix: labels[`${this.labelPrefix}.path_prefix`] || '',
      rate_limit: labels[`${this.labelPrefix}.rate_limit`],
      ip_filter: labels[`${this.labelPrefix}.ip_filter`],
      security_headers: labels[`${this.labelPrefix}.security_headers`] === 'true',
      compression: labels[`${this.labelPrefix}.compression`] !== 'false', // Enabled by default
      websocket: labels[`${this.labelPrefix}.websocket`] === 'true'
    };

    return config;
  }

  /**
   * Get upstream URL for a container
   */
  getContainerUpstream(container, port) {
    const networks = Object.values(container.NetworkSettings?.Networks || {});
    if (networks.length === 0) {
      logger.warn('[DockerDiscovery] Container has no networks attached');
      return null;
    }

    const containerName = container.Names?.[0]?.replace(/^\//, '') || container.Id.substr(0, 12);

    // Prefer container name over IP (better for Docker networks)
    // Check if we're in the same network
    const network = networks[0];
    if (network.NetworkID) {
      return `http://${containerName}:${port}`;
    }

    // Fallback to IP address
    const ipAddress = network.IPAddress;
    if (ipAddress) {
      return `http://${ipAddress}:${port}`;
    }

    return null;
  }

  /**
   * Start watching Docker events
   */
  async startWatching() {
    if (!this.initialized) {
      logger.warn('[DockerDiscovery] Cannot start watching: Docker not initialized');
      return;
    }

    logger.info('[DockerDiscovery] Starting Docker container watch...');

    // Initial scan of existing containers
    await this.scanExistingContainers();

    try {
      // Watch for container events
      this.eventStream = await this.docker.getEvents({
        filters: {
          type: ['container'],
          event: ['start', 'stop', 'die', 'destroy']
        }
      });

      this.eventStream.on('data', async (chunk) => {
        try {
          const event = JSON.parse(chunk.toString());
          await this.handleDockerEvent(event);
        } catch (error) {
          logger.error('[DockerDiscovery] Error handling event:', error);
        }
      });

      this.eventStream.on('error', (error) => {
        logger.error('[DockerDiscovery] Event stream error:', error);
        // Try to reconnect after 5 seconds
        setTimeout(() => this.startWatching(), 5000);
      });

      // Periodic reconciliation (every 5 minutes)
      setInterval(() => this.reconcileServices(), 300000);

      logger.info('[DockerDiscovery] Docker watch started successfully');
    } catch (error) {
      logger.error('[DockerDiscovery] Error starting watch:', error);
    }
  }

  /**
   * Stop watching Docker events
   */
  stopWatching() {
    if (this.eventStream) {
      this.eventStream.destroy();
      this.eventStream = null;
      logger.info('[DockerDiscovery] Docker watch stopped');
    }
  }

  /**
   * Scan existing containers on startup
   */
  async scanExistingContainers() {
    try {
      const containers = await this.docker.listContainers();

      logger.info(`[DockerDiscovery] Scanning ${containers.length} running containers...`);

      for (const containerInfo of containers) {
        try {
          const container = await this.docker.getContainer(containerInfo.Id).inspect();
          const config = this.parseContainerLabels(container);

          if (config) {
            await this.createOrUpdateProxy(container, config);
          }
        } catch (error) {
          logger.error(`[DockerDiscovery] Error scanning container ${containerInfo.Id}:`, error.message);
        }
      }

      logger.info('[DockerDiscovery] Initial container scan complete');
    } catch (error) {
      logger.error('[DockerDiscovery] Error scanning containers:', error);
    }
  }

  /**
   * Handle Docker events (start, stop, die, destroy)
   */
  async handleDockerEvent(event) {
    const { status, id, Actor } = event;
    const shortId = id.substr(0, 12);

    logger.debug(`[DockerDiscovery] Event: ${status} for container ${shortId}`);

    if (status === 'start') {
      try {
        const container = await this.docker.getContainer(id).inspect();
        const config = this.parseContainerLabels(container);

        if (config) {
          await this.createOrUpdateProxy(container, config);
        }
      } catch (error) {
        logger.error(`[DockerDiscovery] Error handling start event for ${shortId}:`, error.message);
      }
    } else if (['stop', 'die', 'destroy'].includes(status)) {
      await this.handleContainerStop(id);
    }
  }

  /**
   * Create or update proxy for a discovered container
   */
  async createOrUpdateProxy(container, config) {
    const { Id: containerId, Names, State } = container;
    const containerName = Names?.[0]?.replace(/^\//, '') || containerId.substr(0, 12);

    if (!config.domain) {
      logger.debug(`[DockerDiscovery] Skipping ${containerName}: no domain specified`);
      return;
    }

    const upstream = this.getContainerUpstream(container, config.port);
    if (!upstream) {
      logger.warn(`[DockerDiscovery] Skipping ${containerName}: no network found`);
      return;
    }

    try {
      // Import caddyService here to avoid circular dependency
      const caddyService = require('./caddyService');

      // Check if service already discovered
      let discovered = await DiscoveredService.findOne({
        where: { source_type: 'docker', source_id: containerId }
      });

      if (discovered) {
        // Update existing
        discovered.last_seen = new Date();
        discovered.status = State.Running ? 'active' : 'stopped';
        discovered.domain = config.domain;
        discovered.upstream_url = upstream;
        discovered.source_name = containerName;
        await discovered.save();

        logger.info(`[DockerDiscovery] Updated service for ${containerName}`);

        // Update proxy if it exists
        if (discovered.proxy_id) {
          const proxy = await Proxy.findByPk(discovered.proxy_id);
          if (proxy) {
            proxy.domains = [config.domain];
            proxy.upstream_url = upstream;
            proxy.compression_enabled = config.compression;
            proxy.websocket_enabled = config.websocket;
            await proxy.save();
            await caddyService.updateCaddyConfig();
            logger.info(`[DockerDiscovery] Updated proxy for ${containerName}`);
          }
        }
      } else {
        // Create new discovered service
        discovered = await DiscoveredService.create({
          source_type: 'docker',
          source_id: containerId,
          source_name: containerName,
          domain: config.domain,
          upstream_url: upstream,
          ssl_type: config.ssl_type,
          template_name: config.template,
          labels: container.Labels,
          auto_managed: true,
          status: State.Running ? 'active' : 'stopped'
        });

        logger.info(`[DockerDiscovery] Discovered new service: ${containerName}`);
      }

      // Create or update proxy
      if (!discovered.proxy_id) {
        // Create new proxy
        const proxy = await Proxy.create({
          name: `Auto: ${containerName}`,
          domains: [config.domain],
          upstream_url: upstream,
          ssl_type: config.ssl_type,
          compression_enabled: config.compression !== false,
          websocket_enabled: config.websocket === true,
          status: 'active'
        });

        // Apply template if specified
        if (config.template) {
          const template = await Template.findOne({ where: { name: config.template } });
          if (template) {
            // Import templateService to apply template
            const templateService = require('./templateService');
            await templateService.applyTemplateToProxy(proxy.id, template.id);
            logger.info(`[DockerDiscovery] Applied template '${config.template}' to ${containerName}`);
          } else {
            logger.warn(`[DockerDiscovery] Template '${config.template}' not found`);
          }
        }

        discovered.proxy_id = proxy.id;
        await discovered.save();

        await caddyService.updateCaddyConfig();
        logger.info(`[DockerDiscovery] Created proxy for ${containerName} -> ${config.domain}`);
      }
    } catch (error) {
      logger.error(`[DockerDiscovery] Error creating proxy for ${containerName}:`, error.message);
    }
  }

  /**
   * Handle container stop/removal
   */
  async handleContainerStop(containerId) {
    try {
      const discovered = await DiscoveredService.findOne({
        where: { source_type: 'docker', source_id: containerId }
      });

      if (discovered && discovered.auto_managed) {
        discovered.status = 'stopped';
        await discovered.save();

        logger.info(`[DockerDiscovery] Container ${containerId.substr(0, 12)} stopped`);

        // Optionally remove proxy (based on config)
        if (this.autoRemoveStopped && discovered.proxy_id) {
          const caddyService = require('./caddyService');
          const proxy = await Proxy.findByPk(discovered.proxy_id);
          if (proxy) {
            await proxy.destroy();
            await caddyService.updateCaddyConfig();
            logger.info(`[DockerDiscovery] Removed proxy for stopped container`);
          }

          // Remove discovered service record
          await discovered.destroy();
        }
      }
    } catch (error) {
      logger.error('[DockerDiscovery] Error handling container stop:', error.message);
    }
  }

  /**
   * Reconcile services (cleanup stale entries)
   */
  async reconcileServices() {
    try {
      logger.debug('[DockerDiscovery] Running reconciliation...');

      const staleThreshold = new Date(Date.now() - 600000); // 10 minutes
      const staleServices = await DiscoveredService.findAll({
        where: {
          source_type: 'docker',
          last_seen: { [Op.lt]: staleThreshold },
          status: 'active'
        }
      });

      for (const service of staleServices) {
        service.status = 'removed';
        await service.save();

        if (service.proxy_id && service.auto_managed) {
          const proxy = await Proxy.findByPk(service.proxy_id);
          if (proxy) {
            await proxy.destroy();
            logger.info(`[DockerDiscovery] Cleaned up stale proxy: ${proxy.name}`);
          }
        }
      }

      if (staleServices.length > 0) {
        const caddyService = require('./caddyService');
        await caddyService.updateCaddyConfig();
        logger.info(`[DockerDiscovery] Reconciled ${staleServices.length} stale services`);
      }
    } catch (error) {
      logger.error('[DockerDiscovery] Error reconciling services:', error);
    }
  }

  /**
   * Manually sync a container by ID
   */
  async syncContainer(containerId) {
    if (!this.initialized) {
      throw new Error('Docker not initialized');
    }

    try {
      const container = await this.docker.getContainer(containerId).inspect();
      const config = this.parseContainerLabels(container);

      if (!config) {
        throw new Error('Container does not have caddymanager.enable=true label');
      }

      await this.createOrUpdateProxy(container, config);
      return { success: true, message: 'Container synced successfully' };
    } catch (error) {
      logger.error(`[DockerDiscovery] Error syncing container ${containerId}:`, error);
      throw error;
    }
  }

  /**
   * Get status of Docker discovery service
   */
  getStatus() {
    return {
      initialized: this.initialized,
      watching: this.eventStream !== null,
      label_prefix: this.labelPrefix,
      poll_interval: this.pollInterval,
      auto_remove_stopped: this.autoRemoveStopped
    };
  }
}

module.exports = new DockerDiscoveryService();
