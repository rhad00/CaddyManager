/* eslint-disable no-unused-vars */
'use strict';

/**
 * Certificates.created_by was NOT NULL, but certificate sync creates rows with no user.
 * sequelize.sync() does not alter existing tables, so relax the constraint here.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.map((t) => (typeof t === 'string' ? t : t.tableName)).includes('Certificates')) return;

    const columns = await queryInterface.describeTable('Certificates');
    if (!columns.created_by || columns.created_by.allowNull) return;

    await queryInterface.changeColumn('Certificates', 'created_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Certificates', 'created_by', {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
    });
  }
};
