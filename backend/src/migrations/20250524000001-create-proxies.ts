import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('proxies', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        domains: [],
        upstream: { url: '' },
        http_to_https: true,
        compression: true,
        cache_enabled: false,
      },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
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
  await queryInterface.addIndex('proxies', ['name']);
  await queryInterface.addIndex('proxies', ['createdById']);
  await queryInterface.addIndex('proxies', ['isActive']);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('proxies');
}
