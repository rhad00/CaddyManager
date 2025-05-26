import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsTo,
  ForeignKey,
  HasMany,
  HasOne,
  DefaultScope,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import { User } from './User';
import { Header } from './Header';
import { SecurityHeader } from './SecurityHeader';
import { RateLimit } from './RateLimit';
import { IpRestriction } from './IpRestriction';
import { PathRule } from './PathRule';
import { BasicAuth } from './BasicAuth';
import { SSLCertificate } from './SSLCertificate';

// Caddy configuration interfaces
interface ICaddyRouteMatch {
  host: string[];
}

interface ICaddyTLSHandler {
  handler: 'tls';
  certificate: {
    load_files: {
      certificate: string;
      key: string;
    };
  };
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
}

interface ICaddyConfig {
  apps: {
    http: {
      servers: {
        [key: string]: ICaddyServer;
      };
    };
  };
}

interface IDomainConfig {
  name: string;
  ssl_type: 'acme' | 'custom' | 'none';
  custom_cert_path?: string;
  custom_key_path?: string;
}

interface IUpstreamConfig {
  url: string;
  headers?: Record<string, string>;
}

interface IProxyConfig {
  domains: IDomainConfig[];
  upstream: IUpstreamConfig;
  http_to_https: boolean;
  compression: boolean;
  cache_enabled: boolean;
  cache_duration?: string;
  custom_headers?: Record<string, string>;
}

@DefaultScope(() => ({
  include: [{ model: User, attributes: ['id', 'email'] }],
}))
@Table({
  tableName: 'proxies',
  timestamps: true,
})
export class Proxy extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  get name(): string {
    return this.getDataValue('name') as string;
  }

  set name(value: string) {
    this.setDataValue('name', value);
  }

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  get config(): IProxyConfig {
    return this.getDataValue('config') as IProxyConfig;
  }

  set config(value: IProxyConfig) {
    this.setDataValue('config', value);
  }

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  get isActive(): boolean {
    return this.getDataValue('isActive') as boolean;
  }

  set isActive(value: boolean) {
    this.setDataValue('isActive', value);
  }

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  get status(): string | null {
    return this.getDataValue('status') as string | null;
  }

  set status(value: string | null) {
    this.setDataValue('status', value);
  }

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  get createdById(): string {
    return this.getDataValue('createdById') as string;
  }

  set createdById(value: string) {
    this.setDataValue('createdById', value);
  }

  @BelongsTo(() => User, 'createdById')
  createdBy!: User;

  // Middleware relationships
  @HasMany(() => Header)
  headers!: Header[];

  @HasOne(() => SecurityHeader)
  securityHeader!: SecurityHeader;

  @HasOne(() => RateLimit)
  rateLimit!: RateLimit;

  @HasMany(() => IpRestriction)
  ipRestrictions!: IpRestriction[];

  @HasMany(() => PathRule)
  pathRules!: PathRule[];

  @HasOne(() => BasicAuth)
  basicAuth!: BasicAuth;

  @HasMany(() => SSLCertificate)
  sslCertificates!: SSLCertificate[];

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;

  // Validate and normalize config before save
  @BeforeCreate
  @BeforeUpdate
  static validateConfig(instance: Proxy): void {
    if (instance.changed('config')) {
      // Validate domains
      if (!instance.config.domains || !instance.config.domains.length) {
        throw new Error('At least one domain is required');
      }

      // Validate domain format and check for duplicates
      const domainNames = instance.config.domains.map(d => d.name.toLowerCase());
      const duplicates = domainNames.filter((name, index) => domainNames.indexOf(name) !== index);
      if (duplicates.length) {
        throw new Error(`Duplicate domains found: ${duplicates.join(', ')}`);
      }

      // Validate domain format - must be either hostname (xxx.domain.yyy) or wildcard (*.domain.yyy)
      const domainRegex =
        /^(?:\*\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

      for (const domain of instance.config.domains) {
        if (!domainRegex.test(domain.name)) {
          throw new Error(
            `Invalid domain format: ${domain.name}. Must be either a hostname (e.g., sub.domain.com) or wildcard domain (e.g., *.domain.com)`,
          );
        }
      }

      // Validate custom SSL configurations
      instance.config.domains.forEach(domain => {
        if (domain.ssl_type === 'custom') {
          if (!domain.custom_cert_path || !domain.custom_key_path) {
            throw new Error(
              `Custom SSL certificate and key paths are required for domain: ${domain.name}`,
            );
          }
          if (!domain.custom_cert_path.match(/\.(pem|crt)$/)) {
            throw new Error(
              `Invalid certificate file format for domain ${domain.name}. Must be .pem or .crt`,
            );
          }
          if (!domain.custom_key_path.match(/\.(pem|key)$/)) {
            throw new Error(
              `Invalid private key file format for domain ${domain.name}. Must be .pem or .key`,
            );
          }
        }
      });

      // Validate upstream URL
      if (!instance.config.upstream || !instance.config.upstream.url) {
        throw new Error('Upstream URL is required');
      }

      // Validate cache duration format if provided
      if (
        instance.config.cache_duration &&
        !instance.config.cache_duration.match(/^(\d+[smhdw])+$/)
      ) {
        throw new Error('Invalid cache duration format (e.g. 1h30m)');
      }

      // Set defaults if not provided
      instance.config = {
        ...instance.config,
        http_to_https: instance.config.http_to_https ?? true,
        compression: instance.config.compression ?? true,
        cache_enabled: instance.config.cache_enabled ?? false,
      };
    }
  }

  // Generate Caddy configuration
  toCaddyConfig(): ICaddyConfig {
    const config = {
      apps: {
        http: {
          servers: {} as {
            [key: string]: {
              listen: string[];
              routes: unknown[];
              automatic_https?: {
                disable?: boolean;
              };
            };
          },
        },
      },
    };

    // Create route for each domain
    this.config.domains.forEach(domain => {
      const serverName = `server_${domain.name.replace(/\./g, '_')}`;

      // Base route configuration
      const route: ICaddyRoute = {
        match: [
          {
            host: [domain.name],
          },
        ],
        handle: [
          {
            handler: 'reverse_proxy',
            upstreams: [
              {
                dial: this.config.upstream.url,
              },
            ],
            headers: {
              request: {
                set: {
                  ...this.config.upstream.headers,
                  ...(this.config.custom_headers || {}),
                  'X-Forwarded-Host': '{http.request.host}',
                  'X-Real-IP': '{http.request.remote.host}',
                  'X-Forwarded-For': '{http.request.remote.host}',
                  'X-Forwarded-Proto': '{http.request.scheme}',
                },
              },
            },
          },
        ],
      };

      // Add compression if enabled
      if (this.config.compression) {
        route.handle.unshift({
          handler: 'encode',
          encodings: {
            gzip: {},
            zstd: {},
          },
        });
      }

      // Configure SSL
      if (domain.ssl_type === 'custom' && domain.custom_cert_path && domain.custom_key_path) {
        route.handle.unshift({
          handler: 'tls',
          certificate: {
            load_files: {
              certificate: domain.custom_cert_path,
              key: domain.custom_key_path,
            },
          },
        });
      }

      config.apps.http.servers[serverName] = {
        listen: [':80', ':443'],
        routes: [route],
        automatic_https: {
          disable: domain.ssl_type === 'none',
        },
      };
    });

    return config as ICaddyConfig;
  }
}
