import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type ConfigChangeType =
  | 'proxy_create'
  | 'proxy_update'
  | 'proxy_delete'
  | 'template_apply'
  | 'backup_restore'
  | 'manual';

export class ConfigChange extends Model<InferAttributes<ConfigChange>, InferCreationAttributes<ConfigChange>> {
  declare id: CreationOptional<string>;
  /** Repository this change was committed to */
  declare git_repository_id: CreationOptional<string | null>;
  declare change_type: ConfigChangeType;
  /** Type of resource changed (proxy, template, etc.) */
  declare resource_type: CreationOptional<string | null>;
  /** ID of the resource that was changed */
  declare resource_id: CreationOptional<string | null>;
  /** User who made the change */
  declare user_id: CreationOptional<string | null>;
  declare commit_sha: CreationOptional<string | null>;
  /** Full commit message */
  declare commit_message: CreationOptional<string | null>;
  /** Unified diff of the change */
  declare diff: CreationOptional<string | null>;
  declare old_values: CreationOptional<Record<string, unknown> | null>;
  declare new_values: CreationOptional<Record<string, unknown> | null>;
  /** When the change was committed to Git */
  declare committed_at: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ConfigChange.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  git_repository_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Repository this change was committed to'
  },
  change_type: {
    type: DataTypes.ENUM('proxy_create', 'proxy_update', 'proxy_delete', 'template_apply', 'backup_restore', 'manual'),
    allowNull: false,
    comment: 'Type of configuration change'
  },
  resource_type: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Type of resource changed (proxy, template, etc.)'
  },
  resource_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'ID of the resource that was changed'
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'User who made the change'
  },
  commit_sha: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Git commit SHA'
  },
  commit_message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Full commit message'
  },
  diff: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Unified diff of the change'
  },
  old_values: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Previous configuration values'
  },
  new_values: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'New configuration values'
  },
  committed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the change was committed to Git'
  },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'ConfigChange',
  tableName: 'config_changes',
  timestamps: true
});
