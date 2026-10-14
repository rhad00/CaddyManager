/* eslint-disable no-unused-vars */
'use strict';

/**
 * The "Amazon S3" template rewrote Host (dropping the port a client signed) and set empty
 * Content-MD5 / X-Amz-Acl headers on requests without them, so SigV4 requests failed against
 * strict origins such as Ceph radosgw. Empty the stored template and remove the rules proxies
 * copied from it. Anything the user edited is left alone: a template or proxy is only touched
 * when it still carries the complete legacy rule set.
 */
const { LEGACY_S3_HEADERS, S3_TEMPLATE_NAME, S3_TEMPLATE_DESCRIPTION } = require('../utils/s3Template');

const keyOf = (h) => `${h.header_type}\n${String(h.header_name).toLowerCase()}\n${h.header_value}`;
const LEGACY_KEYS = new Set(LEGACY_S3_HEADERS.map(keyOf));

const isLegacyList = (headers) => Array.isArray(headers)
  && headers.length === LEGACY_KEYS.size
  && headers.every((h) => LEGACY_KEYS.has(keyOf(h)));

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Loaded lazily so the migration runner can require this file before models init
    const { Template } = require('../models/template');
    const { Header } = require('../models/header');

    const template = await Template.findOne({ where: { name: S3_TEMPLATE_NAME } });
    if (template && isLegacyList(template.headers)) {
      await template.update({ headers: [], description: S3_TEMPLATE_DESCRIPTION });
    }

    const rows = await Header.findAll({ where: { header_type: 'request' } });
    const byProxy = new Map();
    for (const row of rows) {
      if (!LEGACY_KEYS.has(keyOf(row))) continue;
      byProxy.set(row.proxy_id, [...(byProxy.get(row.proxy_id) || []), row]);
    }
    for (const matching of byProxy.values()) {
      if (matching.length !== LEGACY_KEYS.size) continue;
      await Promise.all(matching.map((row) => row.destroy()));
    }
  },

  down: async () => {
    // The old rules were harmful, so they are not restored
  }
};
