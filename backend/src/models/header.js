const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Proxy = require('./proxy');

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
      model: Proxy,
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

// Establish relationship with Proxy
Header.belongsTo(Proxy, { foreignKey: 'proxy_id', onDelete: 'CASCADE' });
Proxy.hasMany(Header, { foreignKey: 'proxy_id', as: 'headers' });

module.exports = Header;
