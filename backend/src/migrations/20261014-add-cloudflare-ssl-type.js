/* eslint-disable no-unused-vars */
'use strict';

/**
 * Proxies.ssl_type was ENUM('acme','custom','none') although 'cloudflare' is used
 * throughout. SQLite does not enforce ENUMs, so it only broke on PostgreSQL, where
 * saving a Cloudflare proxy failed with "invalid input value for enum".
 */
const ENUM_TYPE = '"enum_Proxies_ssl_type"';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;

    const [types] = await queryInterface.sequelize.query(
      "SELECT 1 FROM pg_type WHERE typname = 'enum_Proxies_ssl_type'"
    );
    if (types.length === 0) return;

    // IF NOT EXISTS keeps the migration idempotent; ADD VALUE must run outside a transaction
    await queryInterface.sequelize.query(`ALTER TYPE ${ENUM_TYPE} ADD VALUE IF NOT EXISTS 'cloudflare'`);
  },

  down: async () => {
    // PostgreSQL cannot drop a value from an enum type
  }
};
