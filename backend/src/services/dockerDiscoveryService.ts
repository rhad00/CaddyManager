import type { Readable } from 'stream';
import Docker from 'dockerode';
import { Op, type CreationAttributes } from 'sequelize';
import winston from 'winston';
import { DiscoveredService, Proxy, Template, Header, Middleware } from '../models';
import { SSL_TYPES, isValidDomain } from '../utils/proxyValidation';
import {
  labelsOf,
  containerNameOf,
  validateFeatureLabels,
  labelFeatures,
  featureUpdates,
  REVIEWED_FIELDS,
  type DockerContainer,
  type LabelConfig,
  type LabelFeatures,
} from '../utils/discoveryLabels';
import * as securityHeadersService from './securityHeadersService';

// Loaded when first used: caddyService is still a CommonJS module (its conversion is a later step)
// and requires this service back
const getCaddyService = (): typeof import('./caddyService') => require('./caddyService');

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A container as `docker inspect` returns it: the label helpers' view plus what is read here */
export interface InspectedContainer extends DockerContainer {
  State?: { Running?: boolean };
  NetworkSettings?: { Networks?: Record<string, { NetworkID?: string; IPAddress?: string }> };
}

/** The labels as parseContainerLabels reads them */
export interface ParsedLabelConfig extends LabelConfig {
  domain?: string;
  port: string;
  ssl_type: string;
  template?: string;
  path_prefix: string;
  security_headers: boolean;
  compression: boolean;
}

/** A Docker event (current API: Action and Actor.ID; status and id are the legacy fields) */
export interface DockerEvent {
  Action?: string;
  status?: string;
  Actor?: { ID?: string };
  id?: string;
}

export interface DockerDiscoveryStatus {
  initialized: boolean;
  watching: boolean;
  label_prefix: string;
  poll_interval: number;
  auto_remove_stopped: boolean;
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

export class DockerDiscoveryService {
  docker: Docker | null = null;
  initialized = false;
  pollInterval: number;
  labelPrefix: string;
  autoRemoveStopped: boolean;
  eventStream: NodeJS.ReadableStream | null = null;

  constructor() {
    this.pollInterval = parseInt(process.env.DOCKER_POLL_INTERVAL ?? '', 10) || 30000; // 30s default
    this.labelPrefix = process.env.DOCKER_LABEL_PREFIX || 'caddymanager';
    this.autoRemoveStopped = process.env.AUTO_REMOVE_STOPPED === 'true';
  }

  /**
   * Initialize Docker client
   */
  async initialize(): Promise<boolean> {
    try {
      // Try to connect to Docker socket
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      this.docker = docker;

      // Test connection
      await docker.ping();
      this.initialized = true;

      logger.info('[DockerDiscovery] Successfully connected to Docker daemon');
      return true;
    } catch (error) {
      logger.error('[DockerDiscovery] Failed to connect to Docker daemon:', errorMessage(error));
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
   * - caddymanager.path_prefix=/api (only this path is proxied)
   * - caddymanager.rate_limit=50 (requests per second)
   * - caddymanager.ip_filter=10.0.0.0/8,192.168.1.10 (allow list)
   * - caddymanager.security_headers=true
   * - caddymanager.compression=false
   */
  parseContainerLabels(container: InspectedContainer | null | undefined): ParsedLabelConfig | null {
    const labels = labelsOf(container);

    // Check if auto-discovery is enabled
    if (labels[`${this.labelPrefix}.enable`] !== 'true') {
      return null;
    }

    const config: ParsedLabelConfig = {
      domain: labels[`${this.labelPrefix}.domain`],
      port: labels[`${this.labelPrefix}.port`] || '80',
      ssl_type: labels[`${this.labelPrefix}.ssl`] || 'acme',
      template: labels[`${this.labelPrefix}.template`],
      path_prefix: labels[`${this.labelPrefix}.path_prefix`] || '',
      rate_limit: labels[`${this.labelPrefix}.rate_limit`],
      ip_filter: labels[`${this.labelPrefix}.ip_filter`],
      security_headers: labels[`${this.labelPrefix}.security_headers`] === 'true',
      compression: labels[`${this.labelPrefix}.compression`] !== 'false' // Enabled by default
      // Caddy's reverse_proxy passes WebSocket upgrades through, so there is no websocket label
    };

    return config;
  }

  /**
   * Check label values against the rules the proxies API applies. The upstream host comes
   * from Docker (container name or network IP), so the private-address rule does not apply.
   * @param config - result of parseContainerLabels
   * @returns the problem, or null when the labels are usable
   */
  validateLabelConfig(config: ParsedLabelConfig): string | null {
    if (!config.domain || !isValidDomain(config.domain)) {
      return `invalid domain label "${config.domain}"`;
    }
    const port = Number(config.port);
    if (!/^\d+$/.test(String(config.port)) || port < 1 || port > 65535) {
      return `invalid port label "${config.port}"`;
    }
    if (!SSL_TYPES.includes(config.ssl_type)) {
      return `invalid ssl label "${config.ssl_type}" (expected one of: ${SSL_TYPES.join(', ')})`;
    }
    return validateFeatureLabels(config);
  }

  /**
   * Get upstream URL for a container
   */
  getContainerUpstream(container: InspectedContainer, port: string): string | null {
    const networks = Object.values(container.NetworkSettings?.Networks || {});
    if (networks.length === 0) {
      logger.warn('[DockerDiscovery] Container has no networks attached');
      return null;
    }

    const containerName = containerNameOf(container);

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
  async startWatching(): Promise<void> {
    const docker = this.docker;
    if (!this.initialized || !docker) {
      logger.warn('[DockerDiscovery] Cannot start watching: Docker not initialized');
      return;
    }

    logger.info('[DockerDiscovery] Starting Docker container watch...');

    // Initial scan of existing containers
    await this.scanExistingContainers();

    try {
      // Watch for container events
      const eventStream = await docker.getEvents({
        filters: {
          type: ['container'],
          event: ['start', 'stop', 'die', 'destroy']
        }
      });
      this.eventStream = eventStream;

      eventStream.on('data', async (chunk: Buffer) => {
        try {
          const event = JSON.parse(chunk.toString()) as DockerEvent;
          await this.handleDockerEvent(event);
        } catch (error) {
          logger.error('[DockerDiscovery] Error handling event:', error);
        }
      });

      eventStream.on('error', (error: Error) => {
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
  stopWatching(): void {
    if (this.eventStream) {
      (this.eventStream as Readable).destroy();
      this.eventStream = null;
      logger.info('[DockerDiscovery] Docker watch stopped');
    }
  }

  /**
   * Scan existing containers on startup
   */
  async scanExistingContainers(): Promise<void> {
    const docker = this.docker;
    if (!docker) return;
    try {
      const containers = await docker.listContainers();

      logger.info(`[DockerDiscovery] Scanning ${containers.length} running containers...`);

      for (const containerInfo of containers) {
        try {
          const container = await docker.getContainer(containerInfo.Id).inspect();
          const config = this.parseContainerLabels(container);

          if (config) {
            await this.createOrUpdateProxy(container, config);
          }
        } catch (error) {
          logger.error(`[DockerDiscovery] Error scanning container ${containerInfo.Id}:`, errorMessage(error));
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
  async handleDockerEvent(event: DockerEvent): Promise<void> {
    // Current Docker APIs send Action and Actor.ID; status and id are the legacy fields
    const action = event.Action || event.status;
    const id = event.Actor?.ID || event.id;
    if (!id) {
      logger.debug(`[DockerDiscovery] Ignoring ${action || 'unknown'} event without a container ID`);
      return;
    }
    const shortId = id.slice(0, 12);

    logger.debug(`[DockerDiscovery] Event: ${action} for container ${shortId}`);

    if (action === 'start') {
      try {
        if (!this.docker) throw new Error('Docker not initialized');
        const container = await this.docker.getContainer(id).inspect();
        const config = this.parseContainerLabels(container);

        if (config) {
          await this.createOrUpdateProxy(container, config);
        }
      } catch (error) {
        logger.error(`[DockerDiscovery] Error handling start event for ${shortId}:`, errorMessage(error));
      }
    } else if (action && ['stop', 'die', 'destroy'].includes(action)) {
      await this.handleContainerStop(id);
    }
  }

  /**
   * Create or update proxy for a discovered container
   */
  async createOrUpdateProxy(container: InspectedContainer, config: ParsedLabelConfig): Promise<void> {
    const containerId = container.Id as string;
    const containerName = containerNameOf(container);
    const running = Boolean(container.State?.Running);

    if (!config.domain) {
      logger.debug(`[DockerDiscovery] Skipping ${containerName}: no domain specified`);
      return;
    }

    const labelProblem = this.validateLabelConfig(config);
    if (labelProblem) {
      logger.warn(`[DockerDiscovery] Skipping ${containerName}: ${labelProblem}`);
      return;
    }

    const upstream = this.getContainerUpstream(container, config.port);
    if (!upstream) {
      logger.warn(`[DockerDiscovery] Skipping ${containerName}: no network found`);
      return;
    }
    const features = labelFeatures(config, upstream);

    try {
      // Check if service already discovered
      let discovered = await DiscoveredService.findOne({
        where: { source_type: 'docker', source_id: containerId }
      });

      if (discovered) {
        const previousFeatures = this.storedFeatures(discovered);
        discovered.last_seen = new Date();
        discovered.status = running ? 'active' : 'stopped';
        discovered.domain = config.domain;
        discovered.upstream_url = upstream;
        discovered.source_name = containerName;
        discovered.labels = labelsOf(container);
        await discovered.save();

        logger.info(`[DockerDiscovery] Updated service for ${containerName}`);

        if (discovered.proxy_id) {
          await this.updateLinkedProxy(discovered.proxy_id, containerName, config, upstream, features, previousFeatures);
        }
      } else {
        discovered = await DiscoveredService.create({
          source_type: 'docker',
          source_id: containerId,
          source_name: containerName,
          domain: config.domain,
          upstream_url: upstream,
          ssl_type: config.ssl_type,
          template_name: config.template ?? null,
          labels: labelsOf(container),
          auto_managed: true,
          status: running ? 'active' : 'stopped'
        });

        logger.info(`[DockerDiscovery] Discovered new service: ${containerName}`);
      }

      if (!discovered.proxy_id) {
        await this.createDisabledProxy(discovered, containerName, config, upstream, features);
      }
    } catch (error) {
      logger.error(`[DockerDiscovery] Error creating proxy for ${containerName}:`, errorMessage(error));
    }
  }

  /**
   * The proxy fields the labels produced at the last scan, from the stored labels.
   */
  storedFeatures(discovered: DiscoveredService): LabelFeatures {
    const previousConfig = this.parseContainerLabels({ Config: { Labels: (discovered.labels || {}) as Record<string, string> } });
    return labelFeatures(previousConfig || {}, discovered.upstream_url as string);
  }

  /**
   * Bring an existing proxy in line with CHANGED container labels. Whoever can label
   * containers must not be able to retarget an approved proxy or change its access
   * controls: such a change sends it back to admin review. Labels that did not change
   * touch nothing, and a value an admin set by hand is kept (see featureUpdates).
   */
  async updateLinkedProxy(
    proxyId: string,
    containerName: string,
    config: ParsedLabelConfig,
    upstream: string,
    features: LabelFeatures,
    previousFeatures: LabelFeatures
  ): Promise<void> {
    const proxy = await Proxy.findByPk(proxyId);
    if (!proxy) return;

    const { updates, diverged } = featureUpdates(proxy, previousFeatures, features);
    if (diverged.length > 0) {
      logger.info(`[DockerDiscovery] Labels of ${containerName} changed ${diverged.join(', ')}, but an admin changed them on the proxy; keeping the admin's values`);
    }

    const currentDomains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
    const reviewed = Object.keys(updates).filter((field) => REVIEWED_FIELDS.includes(field));
    if (currentDomains.length !== 1 || currentDomains[0] !== config.domain) reviewed.push('domains');
    if (proxy.upstream_url !== upstream) reviewed.push('upstream_url');

    if (reviewed.length === 0 && Object.keys(updates).length === 0) return;

    if (reviewed.length > 0 && proxy.status === 'active') {
      proxy.status = 'disabled';
      logger.warn(`[DockerDiscovery] Labels of ${containerName} changed ${reviewed.join(', ')}; proxy disabled pending admin review`);
    }

    proxy.domains = [config.domain as string];
    proxy.upstream_url = upstream;
    Object.assign(proxy, updates);
    await proxy.save();

    if ('security_headers_enabled' in updates) {
      await (updates.security_headers_enabled
        ? securityHeadersService.applySecurityHeaders(proxy.id, Header)
        : securityHeadersService.removeSecurityHeaders(proxy.id, Header));
    }

    await getCaddyService().rebuildConfigFromDatabase();
    logger.info(`[DockerDiscovery] Updated proxy for ${containerName}`);
  }

  /**
   * New proxies are always created DISABLED so an admin can review and enable them;
   * Caddy is not touched until then.
   */
  async createDisabledProxy(
    discovered: DiscoveredService,
    containerName: string,
    config: ParsedLabelConfig,
    upstream: string,
    features: LabelFeatures
  ): Promise<void> {
    const proxy = await Proxy.create({
      name: `Auto: ${containerName}`,
      domains: [config.domain as string],
      upstream_url: upstream,
      ssl_type: config.ssl_type,
      ...features,
      status: 'disabled'
    } as CreationAttributes<Proxy>);

    // Link first, so a failure below cannot leave an orphan that the next scan duplicates
    discovered.proxy_id = proxy.id;
    await discovered.save();

    try {
      if (features.security_headers_enabled) {
        await securityHeadersService.applySecurityHeaders(proxy.id, Header);
      }
      if (config.template) {
        await this.applyTemplate(proxy.id, config.template, containerName);
      }
    } catch (error) {
      logger.error(`[DockerDiscovery] Proxy for ${containerName} created without all of its headers or template:`, errorMessage(error));
    }

    logger.info(`[DockerDiscovery] Discovered ${containerName} → ${config.domain} (proxy created DISABLED, pending admin review)`);
  }

  /**
   * Copy a template's headers and middlewares onto a proxy.
   */
  async applyTemplate(proxyId: string, templateName: string, containerName: string): Promise<void> {
    const template = await Template.findOne({ where: { name: templateName } });
    if (!template) {
      logger.warn(`[DockerDiscovery] Template '${templateName}' not found`);
      return;
    }

    const headers = Array.isArray(template.headers) ? template.headers : [];
    if (headers.length > 0) {
      await Header.bulkCreate(headers.map((h) => ({
        proxy_id: proxyId,
        header_type: h.header_type,
        header_name: h.header_name,
        header_value: h.header_value,
        enabled: true
      } as CreationAttributes<Header>)));
    }

    const middlewares = Array.isArray(template.middleware) ? template.middleware : [];
    if (middlewares.length > 0) {
      await Middleware.bulkCreate(middlewares.map((m) => ({
        proxy_id: proxyId,
        middleware_type: m.middleware_type,
        configuration: m.configuration,
        order: m.order || 0,
        enabled: m.enabled !== false
      } as CreationAttributes<Middleware>)));
    }
    logger.info(`[DockerDiscovery] Applied template '${templateName}' to ${containerName}`);
  }

  /**
   * Handle container stop/removal
   */
  async handleContainerStop(containerId: string): Promise<void> {
    try {
      const discovered = await DiscoveredService.findOne({
        where: { source_type: 'docker', source_id: containerId }
      });

      if (discovered && discovered.auto_managed) {
        discovered.status = 'stopped';
        await discovered.save();

        logger.info(`[DockerDiscovery] Container ${containerId.slice(0, 12)} stopped`);

        // Optionally remove proxy (based on config)
        if (this.autoRemoveStopped && discovered.proxy_id) {
          const proxy = await Proxy.findByPk(discovered.proxy_id);
          if (proxy) {
            await proxy.destroy();
            await getCaddyService().rebuildConfigFromDatabase();
            logger.info(`[DockerDiscovery] Removed proxy for stopped container`);
          }

          // Remove discovered service record
          await discovered.destroy();
        }
      }
    } catch (error) {
      logger.error('[DockerDiscovery] Error handling container stop:', errorMessage(error));
    }
  }

  /**
   * Reconcile services (cleanup stale entries). last_seen is only refreshed by a scan or
   * a start event, so age alone says nothing about a long-running container: ask Docker
   * which containers still run, and only remove the services whose container is gone.
   */
  async reconcileServices(): Promise<void> {
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
      if (staleServices.length === 0) return;

      // If Docker cannot be listed, remove nothing: an outage is not a missing container
      if (!this.docker) throw new Error('Docker not initialized');
      const runningIds = new Set((await this.docker.listContainers()).map((c) => c.Id));
      const missing: DiscoveredService[] = [];

      for (const service of staleServices) {
        if (runningIds.has(service.source_id)) {
          service.last_seen = new Date();
          await service.save();
          continue;
        }

        service.status = 'removed';
        await service.save();
        missing.push(service);

        if (service.proxy_id && service.auto_managed) {
          const proxy = await Proxy.findByPk(service.proxy_id);
          if (proxy) {
            await proxy.destroy();
            logger.info(`[DockerDiscovery] Cleaned up stale proxy: ${proxy.name}`);
          }
        }
      }

      if (missing.length > 0) {
        await getCaddyService().rebuildConfigFromDatabase();
        logger.info(`[DockerDiscovery] Reconciled ${missing.length} stale services`);
      }
    } catch (error) {
      logger.error('[DockerDiscovery] Error reconciling services:', error);
    }
  }

  /**
   * Manually sync a container by ID
   */
  async syncContainer(containerId: string): Promise<{ success: boolean; message: string }> {
    if (!this.initialized || !this.docker) {
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
  getStatus(): DockerDiscoveryStatus {
    return {
      initialized: this.initialized,
      watching: this.eventStream !== null,
      label_prefix: this.labelPrefix,
      poll_interval: this.pollInterval,
      auto_remove_stopped: this.autoRemoveStopped
    };
  }
}

export const dockerDiscoveryService = new DockerDiscoveryService();
