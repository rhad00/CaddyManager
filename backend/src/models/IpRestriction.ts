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

export type IpRestrictionType = 'allow' | 'block';

@Table({
  tableName: 'ip_restrictions',
  timestamps: true,
})
export class IpRestriction extends Model {
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
    type: DataType.ENUM('allow', 'block'),
    allowNull: false,
  })
  type!: IpRestrictionType;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  ipAddress!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  cidrMask?: number;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  description?: string;

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
  static async validateIpRestriction(instance: IpRestriction) {
    // Validate IP address format
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

    if (!ipv4Regex.test(instance.ipAddress) && !ipv6Regex.test(instance.ipAddress)) {
      throw new Error('Invalid IP address format');
    }

    // Validate CIDR mask
    if (instance.cidrMask !== null && instance.cidrMask !== undefined) {
      const isIPv4 = ipv4Regex.test(instance.ipAddress);
      const maxMask = isIPv4 ? 32 : 128;

      if (instance.cidrMask < 0 || instance.cidrMask > maxMask) {
        throw new Error(
          `CIDR mask must be between 0 and ${maxMask} for ${isIPv4 ? 'IPv4' : 'IPv6'}`,
        );
      }
    }

    // Validate description length
    if (instance.description && instance.description.length > 255) {
      throw new Error('Description cannot exceed 255 characters');
    }
  }

  // Get the full IP/CIDR notation
  getIpWithCidr(): string {
    if (this.cidrMask !== null && this.cidrMask !== undefined) {
      return `${this.ipAddress}/${this.cidrMask}`;
    }
    return this.ipAddress;
  }

  // Generate IP restriction configuration for Caddy
  toCaddyIpRestriction(): any {
    const ipWithCidr = this.getIpWithCidr();

    if (this.type === 'allow') {
      return {
        handler: 'ip_allow',
        source: ipWithCidr,
      };
    } else {
      return {
        handler: 'ip_deny',
        source: ipWithCidr,
      };
    }
  }
}
