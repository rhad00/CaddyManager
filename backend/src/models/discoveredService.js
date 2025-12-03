const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DiscoveredService = sequelize.define('DiscoveredService', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  source_type: {
    type: DataTypes.ENUM('docker', 'kubernetes'),
    allowNull: false
  },
  source_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Container ID or K8s service UID'
  },
  source_name: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Container name or K8s service name'
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
  }
}, {
  tableName: 'discovered_services',
  timestamps: true
});

module.exports = DiscoveredService;
