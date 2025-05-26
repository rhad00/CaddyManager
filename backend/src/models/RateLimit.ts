import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsTo,
  ForeignKey,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import { Proxy } from './Proxy';

export type RateLimitKeyType = 'ip' | 'header' | 'query' | 'cookie';

@Table({
  tableName: 'rate_limits',
  timestamps: true,
})
export class RateLimit extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Proxy)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  proxyId!: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  enabled!: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  requestsPerMinute?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  requestsPerHour?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  requestsPerDay?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  burstSize?: number;

  @Column({
    type: DataType.ENUM('ip', 'header', 'query', 'cookie'),
    defaultValue: 'ip',
  })
  keyType!: RateLimitKeyType;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  keyName?: string;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 429,
  })
  responseCode!: number;

  @Column({
    type: DataType.STRING,
    defaultValue: 'Too Many Requests',
  })
  responseMessage!: string;

  @BelongsTo(() => Proxy)
  proxy!: Proxy;

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;

  @BeforeCreate
  @BeforeUpdate
  static validateRateLimit(instance: RateLimit): void {
    if (instance.enabled) {
      // At least one rate limit must be specified
      if (!instance.requestsPerMinute && !instance.requestsPerHour && !instance.requestsPerDay) {
        throw new Error(
          'At least one rate limit (per minute, hour, or day) must be specified when rate limiting is enabled',
        );
      }

      // Validate rate limit values
      if (
        instance.requestsPerMinute &&
        (instance.requestsPerMinute <= 0 || instance.requestsPerMinute > 10000)
      ) {
        throw new Error('Requests per minute must be between 1 and 10000');
      }

      if (
        instance.requestsPerHour &&
        (instance.requestsPerHour <= 0 || instance.requestsPerHour > 100000)
      ) {
        throw new Error('Requests per hour must be between 1 and 100000');
      }

      if (
        instance.requestsPerDay &&
        (instance.requestsPerDay <= 0 || instance.requestsPerDay > 1000000)
      ) {
        throw new Error('Requests per day must be between 1 and 1000000');
      }

      // Validate burst size
      if (instance.burstSize && (instance.burstSize <= 0 || instance.burstSize > 1000)) {
        throw new Error('Burst size must be between 1 and 1000');
      }

      // Validate key name for non-IP key types
      if (
        instance.keyType !== 'ip' &&
        (!instance.keyName || instance.keyName.trim().length === 0)
      ) {
        throw new Error(`Key name is required when using ${instance.keyType} as rate limit key`);
      }

      // Validate response code
      if (instance.responseCode < 400 || instance.responseCode > 599) {
        throw new Error('Response code must be between 400 and 599');
      }

      // Validate logical consistency
      if (instance.requestsPerMinute && instance.requestsPerHour) {
        if (instance.requestsPerMinute * 60 > instance.requestsPerHour) {
          throw new Error(
            'Requests per minute cannot exceed requests per hour when both are specified',
          );
        }
      }

      if (instance.requestsPerHour && instance.requestsPerDay) {
        if (instance.requestsPerHour * 24 > instance.requestsPerDay) {
          throw new Error(
            'Requests per hour cannot exceed requests per day when both are specified',
          );
        }
      }
    }
  }

  // Generate rate limit configuration for Caddy
  toCaddyRateLimit(): any {
    if (!this.enabled) {
      return null;
    }

    const config: any = {
      handler: 'rate_limit',
      key: this.getCaddyKey(),
      response: {
        status_code: this.responseCode,
        body: this.responseMessage,
      },
    };

    // Add rate limit rules
    const rules: any[] = [];

    if (this.requestsPerMinute) {
      rules.push({
        rate: `${this.requestsPerMinute}/m`,
        burst: this.burstSize || Math.ceil(this.requestsPerMinute * 0.1),
      });
    }

    if (this.requestsPerHour) {
      rules.push({
        rate: `${this.requestsPerHour}/h`,
        burst: this.burstSize || Math.ceil(this.requestsPerHour * 0.01),
      });
    }

    if (this.requestsPerDay) {
      rules.push({
        rate: `${this.requestsPerDay}/d`,
        burst: this.burstSize || Math.ceil(this.requestsPerDay * 0.001),
      });
    }

    config.rules = rules;
    return config;
  }

  private getCaddyKey(): string {
    switch (this.keyType) {
      case 'ip':
        return '{http.request.remote.host}';
      case 'header':
        return `{http.request.header.${this.keyName}}`;
      case 'query':
        return `{http.request.uri.query.${this.keyName}}`;
      case 'cookie':
        return `{http.request.cookie.${this.keyName}}`;
      default:
        return '{http.request.remote.host}';
    }
  }
}
