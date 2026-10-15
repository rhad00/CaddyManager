import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type DiscoverySource = 'docker';
export type DiscoveredServiceStatus = 'active' | 'stopped' | 'removed';

export class DiscoveredService extends Model<
  InferAttributes<DiscoveredService>,
  InferCreationAttributes<DiscoveredService>
> {
  declare id: CreationOptional<string>;
  declare source_type: DiscoverySource;
  /** Container ID */
  declare source_id: string;
  /** Container name */
  declare source_name: CreationOptional<string | null>;
  declare domain: CreationOptional<string | null>;
  declare upstream_url: CreationOptional<string | null>;
  declare ssl_type: CreationOptional<string>;
  declare template_name: CreationOptional<string | null>;
  /** Original labels/annotations from source */
  declare labels: CreationOptional<Record<string, unknown> | null>;
  /** If true, proxy will be auto-created and destroyed */
  declare auto_managed: CreationOptional<boolean>;
  /** Link to created Proxy */
  declare proxy_id: CreationOptional<string | null>;
  declare last_seen: CreationOptional<Date>;
  declare status: CreationOptional<DiscoveredServiceStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DiscoveredService.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  source_type: {
    type: DataTypes.ENUM('docker'),
    allowNull: false
  },
  source_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Container ID'
  },
  source_name: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Container name'
  },
  domain: {
    type: DataTypes.STRING,
    allowNull: true
  },
  upstream_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ssl_type: {
    type: DataTypes.STRING,
    defaultValue: 'acme'
  },
  template_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  labels: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    comment: 'Original labels/annotations from source'
  },
  auto_managed: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'If true, proxy will be auto-created and destroyed'
  },
  proxy_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Link to created Proxy'
  },
  last_seen: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  status: {
    type: DataTypes.ENUM('active', 'stopped', 'removed'),
    defaultValue: 'active'
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'DiscoveredService',
  tableName: 'discovered_services',
  timestamps: true
});
