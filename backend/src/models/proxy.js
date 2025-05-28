const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Proxy = sequelize.define('Proxy', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  domains: {
    type: DataTypes.JSON, // Array of domain strings
    allowNull: false,
    defaultValue: []
  },
  upstream_url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ssl_type: {
    type: DataTypes.ENUM('acme', 'custom', 'none'),
    defaultValue: 'acme',
    allowNull: false
  },
  custom_ssl_cert_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  http_to_https_redirect: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  compression_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  cache_settings: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  http_versions: {
    type: DataTypes.JSON, // Array of supported HTTP versions
    allowNull: false,
    defaultValue: ['1.1', '2']
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active',
    allowNull: false
  },
  caddy_route_index: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = Proxy;
