import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface) {
  // Create alert_thresholds table
  await queryInterface.createTable('alert_thresholds', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    proxyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    severity: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    conditions: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notifications: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Create alert_instances table
  await queryInterface.createTable('alert_instances', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    thresholdId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'alert_thresholds',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    proxyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    severity: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    acknowledgedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    acknowledgedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Add indexes
  await queryInterface.addIndex('alert_thresholds', ['proxyId']);
  await queryInterface.addIndex('alert_thresholds', ['type']);
  await queryInterface.addIndex('alert_instances', ['proxyId', 'timestamp']);
  await queryInterface.addIndex('alert_instances', ['thresholdId']);
  await queryInterface.addIndex('alert_instances', ['acknowledgedAt']);
}

export async function down(queryInterface: QueryInterface) {
  await queryInterface.dropTable('alert_instances');
  await queryInterface.dropTable('alert_thresholds');
}
