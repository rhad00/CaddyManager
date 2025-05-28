const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./user');

const Backup = sequelize.define('Backup', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  backup_type: {
    type: DataTypes.ENUM('auto', 'manual'),
    defaultValue: 'manual',
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('complete', 'failed'),
    defaultValue: 'complete',
    allowNull: false
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Establish relationship with User
Backup.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

module.exports = Backup;
