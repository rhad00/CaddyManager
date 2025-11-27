const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Metric Model
 * Stores historical metrics snapshots in the database
 */
const Metric = sequelize.define('Metric', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Timestamp when the metrics snapshot was taken'
  },
  metrics_data: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'JSON object containing the metrics snapshot data'
  },
  summary: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Optional summary of key metrics for quick access'
  }
}, {
  tableName: 'metrics',
  timestamps: true,
  indexes: [
    {
      fields: ['timestamp'],
      name: 'idx_metrics_timestamp'
    },
    {
      fields: ['createdAt'],
      name: 'idx_metrics_created_at'
    }
  ]
});

module.exports = Metric;
