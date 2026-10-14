import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { BasicAuth } from '../utils/basicAuth';
import type { Header } from './header';
import type { Middleware } from './middleware';

export type SslType = 'acme' | 'cloudflare' | 'custom' | 'none';
export type ProxyStatus = 'active' | 'disabled';

// Shapes of the JSON columns (see the column comments below)
export interface RateLimitConfig { enabled?: boolean; requests_per_second?: number; burst?: number }
export interface IpFilteringConfig { enabled?: boolean; mode?: string; ip_list?: string[] }
export interface PathRoutingConfig { enabled?: boolean; routes?: Array<{ path: string; upstream_url: string }> }
export interface LoadBalancingConfig {
  enabled?: boolean;
  policy?: string;
  upstreams?: Array<{ url: string; weight?: number | string | null }>;
}
export interface HealthChecksConfig {
  enabled?: boolean;
  path?: string;
  interval?: string;
  timeout?: string;
  max_fails?: number;
}

/** Result of a TLS handshake against one domain of a proxy */
export interface TlsDomainResult {
  domain: string;
  ok: boolean;
  error?: string;
  certSubject?: unknown;
  issuer?: string | null;
  validFrom?: string;
  validTo?: string;
}

/** Last TLS verification of a proxy (written by caddyService.verifyTlsForDomains) */
export interface TlsStatus {
  ok?: boolean;
  error?: string;
  results?: TlsDomainResult[];
}

export class Proxy extends Model<InferAttributes<Proxy>, InferCreationAttributes<Proxy>> {
  declare id: CreationOptional<string>;
  declare name: string;
  /** Array of domain strings */
  declare domains: CreationOptional<string[]>;
  declare upstream_url: string;
  declare ssl_type: CreationOptional<SslType>;
  declare custom_ssl_cert_id: CreationOptional<string | null>;
  declare compression_enabled: CreationOptional<boolean>;
  declare cache_settings: CreationOptional<Record<string, unknown> | null>;
  /** Array of supported HTTP versions */
  declare http_versions: CreationOptional<string[]>;
  declare status: CreationOptional<ProxyStatus>;
  declare security_headers_enabled: CreationOptional<boolean>;
  declare rate_limit: CreationOptional<RateLimitConfig | null>;
  declare ip_filtering: CreationOptional<IpFilteringConfig | null>;
  declare basic_auth: CreationOptional<BasicAuth | null>;
  declare path_routing: CreationOptional<PathRoutingConfig | null>;
  declare load_balancing: CreationOptional<LoadBalancingConfig | null>;
  declare health_checks: CreationOptional<HealthChecksConfig | null>;
  declare caddy_route_index: CreationOptional<number | null>;
  declare tls_status: CreationOptional<TlsStatus | null>;
  declare tls_checked_at: CreationOptional<Date | null>;
  declare created_by: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Set when loaded with `include` (associations are declared in models/index.js)
  declare headers?: NonAttribute<Header[]>;
  declare middlewares?: NonAttribute<Middleware[]>;
}

Proxy.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  domains: {
    type: DataTypes.JSON, // Array of domain strings
    allowNull: false,
    defaultValue: []
  },
  upstream_url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ssl_type: {
    type: DataTypes.ENUM('acme', 'cloudflare', 'custom', 'none'),
    defaultValue: 'acme',
    allowNull: false
  },
  custom_ssl_cert_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  compression_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  cache_settings: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  http_versions: {
    type: DataTypes.JSON, // Array of supported HTTP versions
    allowNull: false,
    defaultValue: ['1.1', '2']
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active',
    allowNull: false
  },
  security_headers_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  rate_limit: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    comment: 'Rate limiting configuration: {enabled: boolean, requests_per_second: number, burst: number}'
  },
  ip_filtering: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    comment: 'IP filtering configuration: {enabled: boolean, mode: "allow" | "block", ip_list: string[]}'
  },
  basic_auth: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    comment: 'Basic auth configuration: {enabled: boolean, username: string, hashed_password: string}'
  },
  path_routing: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    comment: 'Path routing configuration: {enabled: boolean, routes: [{path: string, upstream_url: string}]}'
  },
  load_balancing: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    comment: 'Load balancing config: {enabled: boolean, policy: "round_robin"|"weighted_round_robin"|"least_conn"|"ip_hash"|"random"|"first", upstreams: [{url: string, weight?: number (round robin only)}]}'
  },
  health_checks: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    comment: 'Active health check config: {enabled: boolean, path: string (Caddy uri), interval: string, timeout: string, max_fails: number (Caddy active.fails)}'
  },
  caddy_route_index: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  tls_status: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Last TLS verification result (ok, results array or error)'
  },
  tls_checked_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'Proxy',
  timestamps: true // Adds createdAt and updatedAt
});
