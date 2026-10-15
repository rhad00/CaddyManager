/* eslint-disable no-unused-vars */
'use strict';

/**
 * The "Amazon S3" template rewrote Host (dropping the port a client signed) and set empty
 * Content-MD5 / X-Amz-Acl headers on requests without them, so SigV4 requests failed against
 * strict origins such as Ceph radosgw. Empty the stored template and remove the rules proxies
 * copied from it. Anything the user edited is left alone: a template is only touched when it
 * still carries the complete legacy rule set, and a proxy's legacy rules are only removed when
 * it still has them all, or when it has the legacy Host rewrite together with a legacy signing
 * header (a partly cleaned-up S3 proxy that would still break signatures).
 *
 * The routes Caddy runs were generated from those rules, so the saved config is stale.
 */
const { LEGACY_S3_HEADERS, S3_TEMPLATE_NAME, S3_TEMPLATE_DESCRIPTION } = require('../utils/s3Template');

const keyOf = (h) => `${h.header_type}\n${String(h.header_name).toLowerCase()}\n${h.header_value}`;
const LEGACY_KEYS = new Set(LEGACY_S3_HEADERS.map(keyOf));
const HOST_KEY = keyOf(LEGACY_S3_HEADERS.find((h) => h.header_name === 'Host'));
const SIGNING_NAMES = /^(authorization|x-amz-)/i;

const isLegacyList = (headers) => Array.isArray(headers)
  && headers.length === LEGACY_KEYS.size
  && headers.every((h) => LEGACY_KEYS.has(keyOf(h)));

/** Whether the legacy rules found on one proxy came from the S3 template */
function wasS3Template(matching) {
  if (matching.length === LEGACY_KEYS.size) return true;
  return matching.some((row) => keyOf(row) === HOST_KEY)
    && matching.some((row) => SIGNING_NAMES.test(row.header_name));
}

module.exports = {
  rebuildsCaddyConfig: true,

  up: async (queryInterface, Sequelize, transaction) => {
    // Loaded lazily so the migration runner can require this file before models init
    const { Template } = require('../models/template');
    const { Header } = require('../models/header');
    const options = transaction ? { transaction } : {};

    const template = await Template.findOne({ where: { name: S3_TEMPLATE_NAME }, ...options });
    if (template && isLegacyList(template.headers)) {
      await template.update({ headers: [], description: S3_TEMPLATE_DESCRIPTION }, options);
    }

    const rows = await Header.findAll({ where: { header_type: 'request' }, ...options });
    const byProxy = new Map();
    for (const row of rows) {
      if (!LEGACY_KEYS.has(keyOf(row))) continue;
      byProxy.set(row.proxy_id, [...(byProxy.get(row.proxy_id) || []), row]);
    }
    for (const matching of byProxy.values()) {
      if (!wasS3Template(matching)) continue;
      for (const row of matching) await row.destroy(options);
    }
  },

  down: async () => {
    // The old rules were harmful, so they are not restored
  }
};
