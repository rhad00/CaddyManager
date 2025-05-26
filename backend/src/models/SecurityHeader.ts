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

export type FrameOptions = 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
export type ReferrerPolicy =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

@Table({
  tableName: 'security_headers',
  timestamps: true,
})
export class SecurityHeader extends Model {
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
  cspEnabled!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  cspPolicy?: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  xssProtection!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  hstsEnabled!: boolean;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 31536000, // 1 year
  })
  hstsMaxAge!: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  hstsIncludeSubdomains!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  hstsPreload!: boolean;

  @Column({
    type: DataType.ENUM('DENY', 'SAMEORIGIN', 'ALLOW-FROM'),
    allowNull: true,
  })
  frameOptions?: FrameOptions;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  frameOptionsUri?: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  contentTypeNosniff!: boolean;

  @Column({
    type: DataType.ENUM(
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ),
    allowNull: true,
  })
  referrerPolicy?: ReferrerPolicy;

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
  static async validateSecurityHeader(instance: SecurityHeader) {
    // Validate CSP policy if enabled
    if (instance.cspEnabled && (!instance.cspPolicy || instance.cspPolicy.trim().length === 0)) {
      throw new Error('CSP policy is required when CSP is enabled');
    }

    // Validate HSTS max age
    if (instance.hstsEnabled && (instance.hstsMaxAge < 0 || instance.hstsMaxAge > 63072000)) {
      throw new Error('HSTS max age must be between 0 and 63072000 seconds (2 years)');
    }

    // Validate frame options URI
    if (
      instance.frameOptions === 'ALLOW-FROM' &&
      (!instance.frameOptionsUri || instance.frameOptionsUri.trim().length === 0)
    ) {
      throw new Error('Frame options URI is required when using ALLOW-FROM');
    }

    // Validate frame options URI format
    if (instance.frameOptionsUri) {
      try {
        new URL(instance.frameOptionsUri);
      } catch {
        throw new Error('Invalid frame options URI format');
      }
    }
  }

  // Generate security headers for Caddy configuration
  toSecurityHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    // Content Security Policy
    if (this.cspEnabled && this.cspPolicy) {
      headers['Content-Security-Policy'] = this.cspPolicy;
    }

    // XSS Protection
    if (this.xssProtection) {
      headers['X-XSS-Protection'] = '1; mode=block';
    }

    // HSTS
    if (this.hstsEnabled) {
      let hstsValue = `max-age=${this.hstsMaxAge}`;
      if (this.hstsIncludeSubdomains) {
        hstsValue += '; includeSubDomains';
      }
      if (this.hstsPreload) {
        hstsValue += '; preload';
      }
      headers['Strict-Transport-Security'] = hstsValue;
    }

    // Frame Options
    if (this.frameOptions) {
      if (this.frameOptions === 'ALLOW-FROM' && this.frameOptionsUri) {
        headers['X-Frame-Options'] = `${this.frameOptions} ${this.frameOptionsUri}`;
      } else {
        headers['X-Frame-Options'] = this.frameOptions;
      }
    }

    // Content Type Options
    if (this.contentTypeNosniff) {
      headers['X-Content-Type-Options'] = 'nosniff';
    }

    // Referrer Policy
    if (this.referrerPolicy) {
      headers['Referrer-Policy'] = this.referrerPolicy;
    }

    return headers;
  }
}
