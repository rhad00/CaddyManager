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

export enum CertificateStatus {
  VALID = 'valid',
  EXPIRING_SOON = 'expiring_soon', // Within 30 days
  EXPIRED = 'expired',
  INVALID = 'invalid',
}

@Table({
  tableName: 'ssl_certificates',
  timestamps: true,
  indexes: [
    {
      fields: ['proxyId', 'domain'],
    },
    {
      fields: ['validTo'],
    },
  ],
})
export class SSLCertificate extends Model {
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
  domain!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  issuer?: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  validFrom!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  validTo!: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    validate: {
      isIn: [Object.values(CertificateStatus)],
    },
  })
  status!: CertificateStatus;

  @BelongsTo(() => Proxy)
  proxy!: Proxy;

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;

  // Update certificate status based on expiration date
  @BeforeCreate
  @BeforeUpdate
  static updateStatus(instance: SSLCertificate): void {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (instance.validTo < now) {
      instance.status = CertificateStatus.EXPIRED;
    } else if (instance.validTo < thirtyDaysFromNow) {
      instance.status = CertificateStatus.EXPIRING_SOON;
    } else {
      instance.status = CertificateStatus.VALID;
    }
  }

  // Helper method to get days until expiration
  getDaysUntilExpiration(): number {
    const now = new Date();
    const diffTime = this.validTo.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Helper method to check if certificate needs renewal
  needsRenewal(): boolean {
    return (
      this.status === CertificateStatus.EXPIRING_SOON || this.status === CertificateStatus.EXPIRED
    );
  }

  // Helper method to check if certificate is currently valid
  isValid(): boolean {
    return this.status === CertificateStatus.VALID;
  }
}
