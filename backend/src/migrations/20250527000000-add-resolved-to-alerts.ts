import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('alert_instances', 'resolved', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  // Add an index for quick filtering of resolved/unresolved alerts
  await queryInterface.addIndex('alert_instances', ['resolved']);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('alert_instances', ['resolved']);
  await queryInterface.removeColumn('alert_instances', 'resolved');
}
