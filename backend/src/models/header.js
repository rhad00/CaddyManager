const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Header = sequelize.define('Header', {
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
  header_type: {
    type: DataTypes.ENUM('request', 'response'),
    allowNull: false
  },
  header_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  header_value: {
    type: DataTypes.STRING,
    allowNull: false
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = Header;
