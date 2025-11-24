/* eslint-disable no-unused-vars */
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add tls_status and tls_checked_at to Proxies table
    await queryInterface.addColumn('Proxies', 'tls_status', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Last TLS verification result (ok, results array or error)'
    });

    await queryInterface.addColumn('Proxies', 'tls_checked_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the columns
    await queryInterface.removeColumn('Proxies', 'tls_status');
    await queryInterface.removeColumn('Proxies', 'tls_checked_at');
  }
};
