/* eslint-disable no-unused-vars */
'use strict';

/**
 * Basic auth passwords used to be stored in plaintext under basic_auth.password and
 * never hashed. Hash them into basic_auth.hashed_password and drop the plaintext.
 */
const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS } = require('../utils/basicAuth');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Loaded lazily so the migration runner can require this file before models init
    const Proxy = require('../models/proxy');
    const proxies = await Proxy.findAll({ attributes: ['id', 'basic_auth'] });

    for (const proxy of proxies) {
      const auth = proxy.basic_auth;
      if (!auth || typeof auth.password !== 'string') continue;

      // eslint-disable-next-line no-unused-vars
      const { password, ...rest } = auth;
      const migrated = rest.hashed_password || password === ''
        ? rest
        : { ...rest, hashed_password: await bcrypt.hash(password, BCRYPT_ROUNDS) };

      await proxy.update({ basic_auth: migrated }, { hooks: false });
    }
  },

  down: async () => {
    // Irreversible: plaintext passwords are not recoverable from hashes
  }
};
