import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type CertificateAuthorityType = 'acme' | 'custom';

export class CertificateAuthority extends Model<
  InferAttributes<CertificateAuthority>,
  InferCreationAttributes<CertificateAuthority>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  /** URL of the ACME directory */
  declare url: CreationOptional<string | null>;
  declare type: CreationOptional<CertificateAuthorityType>;
  /** PEM-encoded CA certificate */
  declare certificate_pem: CreationOptional<string | null>;
  declare trusted: CreationOptional<boolean>;
  /** Email for ACME account */
  declare email: CreationOptional<string | null>;
  /** ACME account ID in Caddy */
  declare acme_account_id: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CertificateAuthority.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('acme', 'custom'),
    allowNull: false,
    defaultValue: 'acme'
  },
  certificate_pem: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  trusted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  acme_account_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'CertificateAuthority'
});
