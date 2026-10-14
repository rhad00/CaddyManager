import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export class ApiKey extends Model<InferAttributes<ApiKey>, InferCreationAttributes<ApiKey>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare key_hash: string;
  declare key_prefix: string;
  declare permissions: CreationOptional<string[]>;
  declare created_by: string;
  declare last_used_at: CreationOptional<Date | null>;
  declare expires_at: CreationOptional<Date | null>;
  declare enabled: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ApiKey.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Human-readable label for the key',
  },
  key_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
    comment: 'SHA-256 hash of the full API key',
  },
  key_prefix: {
    type: DataTypes.STRING(8),
    allowNull: false,
    comment: 'First 8 chars of key for display (non-secret)',
  },
  permissions: {
    type: DataTypes.JSON,
    defaultValue: ['read'],
    comment: 'Array: read | write | admin',
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Optional expiry date; null = never expires',
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, {
  sequelize,
  modelName: 'ApiKey',
  timestamps: true,
});
