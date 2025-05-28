const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Middleware = sequelize.define('Middleware', {
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
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = Middleware;
