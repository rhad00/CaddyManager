import { Proxy } from '../models/Proxy';
import { CaddyService } from './caddyService';
import { createError } from '../middleware/errorHandler';

interface IProxyConfig {
  domains: Array<{
    name: string;
    ssl_type: 'acme' | 'custom' | 'none';
    custom_cert_id?: string;
  }>;
  upstream: {
    url: string;
    headers?: Record<string, string>;
  };
  http_to_https: boolean;
  compression: boolean;
  cache_enabled: boolean;
  cache_duration?: string;
  custom_headers?: Record<string, string>;
}

export class ProxyService {
  static async createProxy(data: {
    name: string;
    config: IProxyConfig;
    createdById: string;
  }): Promise<Proxy> {
    try {
      // First create a temporary proxy object to validate with Caddy
      const tempProxy = Proxy.build({
        name: data.name,
        config: data.config,
        createdById: data.createdById,
        status: 'pending',
      });

      // Try to apply configuration to Caddy first
      await CaddyService.applyProxy(tempProxy);

      // If Caddy accepts the config, save to database
      const proxy = await tempProxy.save();
      return proxy;
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        error.name === 'SequelizeUniqueConstraintError'
      ) {
        throw createError(`Proxy with name "${data.name}" already exists`, 400);
      }
      throw error;
    }
  }

  static async updateProxy(
    id: string,
    data: {
      name?: string;
      config?: IProxyConfig;
      isActive?: boolean;
    },
  ): Promise<Proxy> {
    const proxy = await Proxy.findByPk(id);
    if (!proxy) {
      throw createError('Proxy not found', 404);
    }

    // Update proxy record
    await proxy.update({
      ...data,
      status: 'pending',
    });

    // Apply updated configuration to Caddy
    if (proxy.isActive) {
      await CaddyService.applyProxy(proxy);
    }

    return proxy;
  }

  static async deleteProxy(id: string): Promise<void> {
    const proxy = await Proxy.findByPk(id);
    if (!proxy) {
      throw createError('Proxy not found', 404);
    }

    // Remove configuration from Caddy
    await CaddyService.removeProxy(proxy);

    // Delete proxy record
    await proxy.destroy();
  }

  static async getProxy(id: string): Promise<Proxy> {
    const proxy = await Proxy.findByPk(id);
    if (!proxy) {
      throw createError('Proxy not found', 404);
    }
    return proxy;
  }

  static async listProxies(
    options: {
      userId?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ rows: Proxy[]; count: number }> {
    const { userId, isActive, limit = 10, offset = 0 } = options;

    const where: {
      createdById?: string;
      isActive?: boolean;
    } = {};
    if (userId) where.createdById = userId;
    if (typeof isActive === 'boolean') where.isActive = isActive;

    return Proxy.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });
  }

  static async toggleProxy(id: string): Promise<Proxy> {
    const proxy = await Proxy.findByPk(id);
    if (!proxy) {
      throw createError('Proxy not found', 404);
    }

    const isActive = !proxy.isActive;

    if (isActive) {
      // Activate proxy
      await CaddyService.applyProxy(proxy);
    } else {
      // Deactivate proxy
      await CaddyService.removeProxy(proxy);
    }

    await proxy.update({ isActive });
    return proxy;
  }

  static validateProxyConfig(config: IProxyConfig): void {
    // Validate domains
    if (!config.domains || !Array.isArray(config.domains) || config.domains.length === 0) {
      throw createError('At least one domain is required', 400);
    }

    for (const domain of config.domains) {
      if (!domain.name || typeof domain.name !== 'string') {
        throw createError('Invalid domain name', 400);
      }
      if (!['acme', 'custom', 'none'].includes(domain.ssl_type)) {
        throw createError('Invalid SSL type', 400);
      }
    }

    // Validate upstream
    if (!config.upstream || !config.upstream.url) {
      throw createError('Upstream URL is required', 400);
    }

    // Validate headers if present
    if (config.upstream.headers && typeof config.upstream.headers !== 'object') {
      throw createError('Invalid upstream headers format', 400);
    }

    // Additional validation can be added here
  }
}
