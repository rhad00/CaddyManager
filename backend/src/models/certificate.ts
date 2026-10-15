import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';

export type CertificateType = 'acme' | 'uploaded' | 'self-signed';
export type CertificateStatus = 'valid' | 'expired' | 'revoked' | 'pending';

export class Certificate extends Model<InferAttributes<Certificate>, InferCreationAttributes<Certificate>> {
  declare id: CreationOptional<number>;
  declare name: string;
  /** Comma-separated list of domains */
  declare domains: string;
  declare issuer: string;
  declare valid_from: Date;
  declare valid_to: Date;
  /** PEM-encoded certificate */
  declare certificate_pem: CreationOptional<string | null>;
  /** PEM-encoded private key (encrypted at rest) */
  declare private_key_pem: CreationOptional<string | null>;
  /** Certificate ID in Caddy */
  declare caddy_cert_id: CreationOptional<string | null>;
  declare type: CreationOptional<CertificateType>;
  declare auto_renew: CreationOptional<boolean>;
  declare status: CreationOptional<CertificateStatus>;
  /** null for certificates discovered by sync rather than created by a user */
  declare created_by: CreationOptional<string | null>;
  declare ca_id: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Certificate.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  domains: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  issuer: {
    type: DataTypes.STRING,
    allowNull: false
  },
  valid_from: {
    type: DataTypes.DATE,
    allowNull: false
  },
  valid_to: {
    type: DataTypes.DATE,
    allowNull: false
  },
  certificate_pem: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  private_key_pem: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  caddy_cert_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('acme', 'uploaded', 'self-signed'),
    allowNull: false,
    defaultValue: 'acme'
  },
  auto_renew: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  status: {
    type: DataTypes.ENUM('valid', 'expired', 'revoked', 'pending'),
    allowNull: false,
    defaultValue: 'valid'
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  ca_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'CertificateAuthorities',
      key: 'id'
    }
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'Certificate',
  hooks: {
    // ── Encrypt private_key_pem before persisting ───────────────────────────────
    beforeCreate: (cert) => {
      if (cert.private_key_pem) {
        cert.private_key_pem = encrypt(cert.private_key_pem);
      }
    },
    beforeUpdate: (cert) => {
      if (cert.changed('private_key_pem') && cert.private_key_pem) {
        cert.private_key_pem = encrypt(cert.private_key_pem);
      }
    },
    // ── Decrypt private_key_pem after reading ───────────────────────────────────
    afterFind: (result) => {
      if (!result) return;
      const items = Array.isArray(result) ? result : [result];
      for (const cert of items) {
        if (cert && cert.private_key_pem) {
          cert.private_key_pem = decrypt(cert.private_key_pem);
        }
      }
    }
  }
});
