import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type MiddlewareKind = 'rate_limit' | 'ip_filter' | 'basic_auth' | 'redirect';

export class Middleware extends Model<InferAttributes<Middleware>, InferCreationAttributes<Middleware>> {
  declare id: CreationOptional<string>;
  declare proxy_id: string;
  declare middleware_type: MiddlewareKind;
  declare configuration: CreationOptional<Record<string, unknown>>;
  declare enabled: CreationOptional<boolean>;
  declare order: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Middleware.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  proxy_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Proxies',
      key: 'id'
    }
  },
  middleware_type: {
    type: DataTypes.ENUM('rate_limit', 'ip_filter', 'basic_auth', 'redirect'),
    allowNull: false
  },
  configuration: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'Middleware',
  timestamps: true // Adds createdAt and updatedAt
});
