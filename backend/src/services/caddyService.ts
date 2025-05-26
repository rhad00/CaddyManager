import axios from 'axios';
import { Proxy } from '../models/Proxy';

interface ICaddyRouteMatch {
  host: string[];
}

interface ICaddyReverseProxyHandler {
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

interface ICaddyEncodeHandler {
  handler: 'encode';
  encodings: {
    gzip: Record<string, never>;
    zstd: Record<string, never>;
  };
}

interface ICaddyTLSHandler {
  handler: 'tls';
}

interface ICaddyRoute {
  match: ICaddyRouteMatch[];
  handle: (ICaddyReverseProxyHandler | ICaddyEncodeHandler | ICaddyTLSHandler)[];
}

interface ICaddyServer {
  listen: string[];
  routes: ICaddyRoute[];
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

interface ICaddyConfig {
  admin: {
    listen: string;
  };
  apps: {
    http: {
      servers: {
        [key: string]: ICaddyServer;
      };
    };
  };
}

export class CaddyService {
  private static apiUrl = process.env.CADDY_API_URL || 'http://caddy:2019';

  /**
   * Get the current Caddy configuration
   */
  static async getConfig(): Promise<ICaddyConfig> {
    try {
      const response = await axios.get<ICaddyConfig>(`${this.apiUrl}/config/`);
      return response.data;
    } catch (error) {
      console.error('Failed to get Caddy config:', error);
      throw error;
    }
  }

  /**
   * Save current configuration to ensure persistence
   */
  static async saveConfig(): Promise<void> {
    try {
      const config = await this.getConfig();
      await axios.post(`${this.apiUrl}/config/`, config);
      // Use Caddy's config endpoint to persist the configuration
      await axios.post(`${this.apiUrl}/config/apps/persist`, {});
    } catch (error) {
      console.error('Failed to save Caddy config:', error);
      throw error;
    }
  }

  /**
   * Load saved configuration
   */
  static async loadConfig(): Promise<void> {
    try {
      // Get the saved configuration and apply it
      const config = await this.getConfig();
      await axios.post(`${this.apiUrl}/load`, config);
    } catch (error) {
      console.error('Failed to load Caddy config:', error);
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

      // Save config to ensure persistence
      await this.saveConfig();

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

      // Save config to ensure persistence
      await this.saveConfig();

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
  private static updateConfigWithProxy(config: ICaddyConfig, proxy: Proxy): ICaddyConfig {
    // Get proxy-specific configuration
    const proxyConfig = proxy.toCaddyConfig() as {
      apps: {
        http: {
          servers: {
            [key: string]: ICaddyServer;
          };
        };
      };
    };

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
  private static removeProxyFromConfig(config: ICaddyConfig, proxy: Proxy): ICaddyConfig {
    const { domains } = proxy.config;

    domains.forEach(domain => {
      const serverName = `server_${domain.name.replace(/\./g, '_')}`;
      delete config.apps.http.servers[serverName];
    });

    return config;
  }
}
