const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ConfigChange = sequelize.define('ConfigChange', {
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
  }
}, {
  tableName: 'config_changes',
  timestamps: true
});

module.exports = ConfigChange;
