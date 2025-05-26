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
import bcrypt from 'bcrypt';

@Table({
  tableName: 'basic_auth',
  timestamps: true,
})
export class BasicAuth extends Model {
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
    type: DataType.STRING,
    defaultValue: 'Restricted Area',
  })
  realm!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  username?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  passwordHash?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  pathPattern?: string;

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
  static async validateBasicAuth(instance: BasicAuth) {
    if (instance.enabled) {
      // Username is required when enabled
      if (!instance.username || instance.username.trim().length === 0) {
        throw new Error('Username is required when basic auth is enabled');
      }

      // Username validation
      if (instance.username.length < 3 || instance.username.length > 50) {
        throw new Error('Username must be between 3 and 50 characters');
      }

      // Username format validation (alphanumeric, underscore, hyphen)
      const usernameRegex = /^[a-zA-Z0-9_-]+$/;
      if (!usernameRegex.test(instance.username)) {
        throw new Error('Username can only contain letters, numbers, underscores, and hyphens');
      }

      // Password hash is required when enabled
      if (!instance.passwordHash || instance.passwordHash.trim().length === 0) {
        throw new Error('Password is required when basic auth is enabled');
      }

      // Validate realm
      if (instance.realm && instance.realm.length > 100) {
        throw new Error('Realm cannot exceed 100 characters');
      }

      // Validate path pattern if provided
      if (instance.pathPattern) {
        if (!instance.pathPattern.startsWith('/')) {
          throw new Error("Path pattern must start with '/'");
        }
        if (instance.pathPattern.length > 255) {
          throw new Error('Path pattern cannot exceed 255 characters');
        }
      }
    }
  }

  // Set password (will be hashed automatically)
  async setPassword(password: string): Promise<void> {
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    if (password.length > 128) {
      throw new Error('Password cannot exceed 128 characters');
    }

    // Check password strength
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      throw new Error(
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      );
    }

    const saltRounds = 12;
    this.passwordHash = await bcrypt.hash(password, saltRounds);
  }

  // Verify password
  async verifyPassword(password: string): Promise<boolean> {
    if (!this.passwordHash) {
      return false;
    }
    return bcrypt.compare(password, this.passwordHash);
  }

  // Generate basic auth configuration for Caddy
  toCaddyBasicAuth(): any {
    if (!this.enabled || !this.username || !this.passwordHash) {
      return null;
    }

    const config: any = {
      handler: 'authentication',
      providers: {
        http_basic: {
          accounts: [
            {
              username: this.username,
              password: this.passwordHash,
            },
          ],
          realm: this.realm,
        },
      },
    };

    // Add path restriction if specified
    if (this.pathPattern) {
      return {
        match: [
          {
            path: [this.pathPattern],
          },
        ],
        handle: [config],
      };
    }

    return config;
  }

  // Get safe representation (without password hash)
  toSafeJSON(): any {
    const { passwordHash, ...safeData } = this.toJSON();
    return {
      ...safeData,
      hasPassword: !!passwordHash,
    };
  }
}
