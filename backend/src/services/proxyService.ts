import { Proxy } from '../models/Proxy';
import { User } from '../models/User';
import { CaddyService } from './caddyService';
import { createError } from '../middleware/errorHandler';

export class ProxyService {
  static async createProxy(data: {
    name: string;
    config: any;
    createdById: string;
  }): Promise<Proxy> {
    try {
      // Create proxy record
      const proxy = await Proxy.create({
        name: data.name,
        config: data.config,
        createdById: data.createdById,
        status: 'pending',
      });

      // Apply configuration to Caddy
      await CaddyService.applyProxy(proxy);

      return proxy;
    } catch (error: any) {
      if (error?.name === 'SequelizeUniqueConstraintError') {
        throw createError(`Proxy with name "${data.name}" already exists`, 400);
      }
      throw error;
    }
  }

  static async updateProxy(
    id: string,
    data: {
      name?: string;
      config?: any;
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

    const where: any = {};
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

  static async validateProxyConfig(config: any): Promise<void> {
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
