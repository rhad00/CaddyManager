/* eslint-disable no-unused-vars */
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if columns already exist before adding them
    const tableDescription = await queryInterface.describeTable('Proxies');
    
    // Add tls_status if it doesn't exist
    if (!tableDescription.tls_status) {
      await queryInterface.addColumn('Proxies', 'tls_status', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Last TLS verification result (ok, results array or error)'
      });
    }

    // Add tls_checked_at if it doesn't exist
    if (!tableDescription.tls_checked_at) {
      await queryInterface.addColumn('Proxies', 'tls_checked_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the columns
    await queryInterface.removeColumn('Proxies', 'tls_status');
    await queryInterface.removeColumn('Proxies', 'tls_checked_at');
  }
};
