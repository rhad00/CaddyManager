// A schema regression guard: Sequelize only makes createdAt/updatedAt NOT NULL when it
// adds them itself or when the model declares them with allowNull: false. Declaring them
// as a bare DataTypes.DATE in a model's init() silently makes the columns nullable on
// every fresh database. Runs on SQLite and PostgreSQL.
const { sequelize } = require('../../src/models');

describe('table timestamps', () => {
  const queryInterface = () => sequelize.getQueryInterface();

  beforeAll(async () => {
    await sequelize.sync();
  });

  it('keeps createdAt and updatedAt NOT NULL on every table that has them', async () => {
    const tables = (await queryInterface().showAllTables())
      .map((t) => (typeof t === 'string' ? t : t.tableName))
      .filter((name) => name !== 'SequelizeMeta');
    expect(tables.length).toBeGreaterThanOrEqual(16);

    const nullable = [];
    for (const table of tables) {
      const columns = await queryInterface().describeTable(table);
      for (const name of ['createdAt', 'updatedAt']) {
        if (columns[name] && columns[name].allowNull !== false) nullable.push(`${table}.${name}`);
      }
    }
    expect(nullable).toEqual([]);
  });

  it('has no updatedAt on AuditLogs (it only records creation)', async () => {
    const columns = await queryInterface().describeTable('AuditLogs');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).not.toHaveProperty('updatedAt');
  });
});
