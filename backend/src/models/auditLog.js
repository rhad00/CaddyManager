const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: true, // Can be null for system events or failed logins where user is unknown
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false
    },
    resource: {
        type: DataTypes.STRING,
        allowNull: true
    },
    details: {
        type: DataTypes.JSON,
        allowNull: true
    },
    ip_address: {
        type: DataTypes.STRING,
        allowNull: true
    },
    user_agent: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING, // 'success', 'failure'
        defaultValue: 'success'
    }
}, {
    timestamps: true,
    updatedAt: false // Only need createdAt
});

module.exports = AuditLog;
