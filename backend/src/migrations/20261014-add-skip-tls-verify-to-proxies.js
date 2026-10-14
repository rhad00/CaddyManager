/* eslint-disable no-unused-vars */
'use strict';

/** Proxies can trust a self-signed certificate on an HTTPS upstream (skip_tls_verify) */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('Proxies');
    if (!tableDescription.skip_tls_verify) {
      await queryInterface.addColumn('Proxies', 'skip_tls_verify', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Proxies', 'skip_tls_verify');
  }
};
