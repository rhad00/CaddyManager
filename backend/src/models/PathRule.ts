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

export type PathRuleType = 'proxy' | 'redirect' | 'rewrite';

@Table({
  tableName: 'path_rules',
  timestamps: true,
})
export class PathRule extends Model {
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
    type: DataType.STRING,
    allowNull: false,
  })
  pathPattern!: string;

  @Column({
    type: DataType.ENUM('proxy', 'redirect', 'rewrite'),
    allowNull: false,
  })
  ruleType!: PathRuleType;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  targetUrl?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  redirectCode?: number;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  rewritePattern?: string;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  priority!: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  isActive!: boolean;

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
  static validatePathRule(instance: PathRule): void {
    // Validate path pattern
    if (!instance.pathPattern || instance.pathPattern.trim().length === 0) {
      throw new Error('Path pattern is required');
    }

    // Validate path pattern format
    if (!instance.pathPattern.startsWith('/')) {
      throw new Error("Path pattern must start with '/'");
    }

    // Validate rule-specific requirements
    switch (instance.ruleType) {
      case 'proxy':
        if (!instance.targetUrl || instance.targetUrl.trim().length === 0) {
          throw new Error('Target URL is required for proxy rules');
        }
        try {
          new URL(instance.targetUrl);
        } catch {
          throw new Error('Invalid target URL format');
        }
        break;

      case 'redirect':
        if (!instance.targetUrl || instance.targetUrl.trim().length === 0) {
          throw new Error('Target URL is required for redirect rules');
        }

        // Validate redirect code
        const validRedirectCodes = [301, 302, 303, 307, 308];
        if (!instance.redirectCode || !validRedirectCodes.includes(instance.redirectCode)) {
          throw new Error('Redirect code must be one of: 301, 302, 303, 307, 308');
        }

        // Validate target URL (can be relative or absolute)
        if (!instance.targetUrl.startsWith('/') && !instance.targetUrl.startsWith('http')) {
          throw new Error(
            'Redirect target must be a relative path (starting with /) or absolute URL',
          );
        }
        break;

      case 'rewrite':
        if (!instance.rewritePattern || instance.rewritePattern.trim().length === 0) {
          throw new Error('Rewrite pattern is required for rewrite rules');
        }
        break;
    }

    // Validate priority
    if (instance.priority < -1000 || instance.priority > 1000) {
      throw new Error('Priority must be between -1000 and 1000');
    }
  }

  // Generate path rule configuration for Caddy
  toCaddyPathRule(): any {
    if (!this.isActive) {
      return null;
    }

    const baseMatch = {
      path: [this.pathPattern],
    };

    switch (this.ruleType) {
      case 'proxy':
        return {
          match: [baseMatch],
          handle: [
            {
              handler: 'reverse_proxy',
              upstreams: [
                {
                  dial: this.targetUrl,
                },
              ],
            },
          ],
        };

      case 'redirect':
        return {
          match: [baseMatch],
          handle: [
            {
              handler: 'static_response',
              status_code: this.redirectCode,
              headers: {
                Location: [this.targetUrl!],
              },
            },
          ],
        };

      case 'rewrite':
        return {
          match: [baseMatch],
          handle: [
            {
              handler: 'rewrite',
              uri: this.rewritePattern,
            },
          ],
        };

      default:
        return null;
    }
  }

  // Check if path pattern matches a given path
  matchesPath(path: string): boolean {
    // Simple pattern matching - can be enhanced with regex support
    if (this.pathPattern === '/*') {
      return true;
    }

    if (this.pathPattern.endsWith('/*')) {
      const prefix = this.pathPattern.slice(0, -2);
      return path.startsWith(prefix);
    }

    return path === this.pathPattern;
  }
}
