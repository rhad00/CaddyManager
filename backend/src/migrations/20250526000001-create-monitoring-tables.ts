import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create metrics table for time-series data
  await queryInterface.createTable('metrics', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    proxyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    metricType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    value: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
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

  // Create health checks table
  await queryInterface.createTable('health_checks', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    proxyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastCheck: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    responseTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
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

  // Create SSL certificates monitoring table
  await queryInterface.createTable('ssl_certificates', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    proxyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'proxies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    issuer: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    validTo: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
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
  await queryInterface.addIndex('metrics', ['proxyId', 'timestamp', 'metricType']);
  await queryInterface.addIndex('health_checks', ['proxyId', 'lastCheck']);
  await queryInterface.addIndex('ssl_certificates', ['proxyId', 'domain']);
  await queryInterface.addIndex('ssl_certificates', ['validTo']);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('metrics');
  await queryInterface.dropTable('health_checks');
  await queryInterface.dropTable('ssl_certificates');
}
