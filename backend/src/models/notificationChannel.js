const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * NotificationChannel — SMTP email, Slack/Discord/generic webhook destination.
 */
const NotificationChannel = sequelize.define('NotificationChannel', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('email', 'slack', 'discord', 'webhook'),
    allowNull: false,
  },
  // type-specific config stored as JSON
  // email:   { to, from }
  // slack:   { webhook_url }
  // discord: { webhook_url }
  // webhook: { url, method, headers: {} }
  config: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
}, { timestamps: true });

module.exports = NotificationChannel;
