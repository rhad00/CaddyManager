import axios from 'axios';
import { Proxy } from '../models/Proxy';

interface CaddyRouteMatch {
  host: string[];
}

interface CaddyReverseProxyHandler {
  handler: 'reverse_proxy';
  upstreams: {
    dial: string;
  }[];
  headers: {
    request: {
      set: Record<string, string>;
    };
  };
}

interface CaddyEncodeHandler {
  handler: 'encode';
  encodings: {
    gzip: Record<string, never>;
    zstd: Record<string, never>;
  };
}

interface CaddyRoute {
  match: CaddyRouteMatch[];
  handle: (CaddyReverseProxyHandler | CaddyEncodeHandler)[];
}

interface CaddyServer {
  listen: string[];
  routes: CaddyRoute[];
  automatic_https?: {
    disable?: boolean;
  };
  tls_connection_policies?: {
    certificate_selection: {
      any_tag: string[];
    };
  }[];
  tls?: {
    certificates?: {
      load_files: {
        certificate: string;
        key: string;
        tags: string[];
      }[];
    };
    issuer?: {
      module: string;
    };
  };
}

interface CaddyConfig {
  admin: {
    listen: string;
  };
  apps: {
    http: {
      servers: {
        [key: string]: CaddyServer;
      };
    };
  };
}

export class CaddyService {
  private static apiUrl = process.env.CADDY_API_URL || 'http://caddy:2019';

  /**
   * Get the current Caddy configuration
   */
  static async getConfig(): Promise<CaddyConfig> {
    try {
      const response = await axios.get(`${this.apiUrl}/config/`);
      return response.data;
    } catch (error) {
      console.error('Failed to get Caddy config:', error);
      throw error;
    }
  }

  /**
   * Update Caddy configuration with a proxy
   */
  static async applyProxy(proxy: Proxy): Promise<void> {
    try {
      // Get current config
      let config = await this.getConfig();

      // Create or update server config
      config = this.updateConfigWithProxy(config, proxy);

      // Apply new config
      await axios.post(`${this.apiUrl}/load`, config);

      // Update proxy status
      await proxy.update({ status: 'active' });
    } catch (error) {
      console.error('Failed to apply proxy config:', error);
      await proxy.update({ status: 'error' });
      throw error;
    }
  }

  /**
   * Remove a proxy from Caddy configuration
   */
  static async removeProxy(proxy: Proxy): Promise<void> {
    try {
      // Get current config
      let config = await this.getConfig();

      // Remove proxy routes
      config = this.removeProxyFromConfig(config, proxy);

      // Apply new config
      await axios.post(`${this.apiUrl}/load`, config);

      // Update proxy status
      await proxy.update({ status: 'removed' });
    } catch (error) {
      console.error('Failed to remove proxy config:', error);
      throw error;
    }
  }

  /**
   * Update Caddy config object with proxy settings
   */
  private static updateConfigWithProxy(config: CaddyConfig, proxy: Proxy): CaddyConfig {
    // Get proxy-specific configuration
    const proxyConfig = proxy.toCaddyConfig();

    // Ensure http server exists
    if (!config.apps.http.servers) {
      config.apps.http.servers = {};
    }

    // Merge proxy servers into main config
    config.apps.http.servers = {
      ...config.apps.http.servers,
      ...proxyConfig.apps.http.servers,
    };

    return config;
  }

  /**
   * Remove proxy routes from Caddy config
   */
  private static removeProxyFromConfig(config: CaddyConfig, proxy: Proxy): CaddyConfig {
    const { domains } = proxy.config;

    domains.forEach(domain => {
      const serverName = `server_${domain.name.replace(/\./g, '_')}`;
      delete config.apps.http.servers[serverName];
    });

    return config;
  }
}
