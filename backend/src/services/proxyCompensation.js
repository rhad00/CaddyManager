/**
 * Undo a committed proxy change after Caddy rejected it.
 *
 * Proxy routes commit to the database before calling Caddy (Caddy reads the committed
 * state, e.g. for the Cloudflare DNS-01 policy). When Caddy then refuses the change, these
 * helpers bring the database back in line with what Caddy is actually running.
 */
const { sequelize, Proxy, Header, Middleware } = require('../models');

// Fields of a proxy snapshot that are not written back on restore
const NON_RESTORED_FIELDS = new Set(['id', 'headers', 'middlewares', 'created_at', 'updated_at', 'createdAt', 'updatedAt']);

/**
 * Remove a newly created proxy with its headers and middlewares.
 * @param {string} proxyId
 * @returns {Promise<void>}
 */
async function discardProxy(proxyId) {
  await sequelize.transaction(async (transaction) => {
    await Header.destroy({ where: { proxy_id: proxyId }, transaction });
    await Middleware.destroy({ where: { proxy_id: proxyId }, transaction });
    await Proxy.destroy({ where: { id: proxyId }, transaction });
  });
}

/**
 * Restore a proxy, its headers and its middlewares from a snapshot taken with
 * `proxy.toJSON()` on an instance loaded with both associations.
 * @param {Object} snapshot
 * @returns {Promise<void>}
 */
async function restoreProxy(snapshot) {
  const fields = Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => !NON_RESTORED_FIELDS.has(key))
  );

  await sequelize.transaction(async (transaction) => {
    await Proxy.update(fields, { where: { id: snapshot.id }, transaction });

    await Header.destroy({ where: { proxy_id: snapshot.id }, transaction });
    if (snapshot.headers?.length) {
      await Header.bulkCreate(snapshot.headers.map((h) => ({ ...h, proxy_id: snapshot.id })), { transaction });
    }

    await Middleware.destroy({ where: { proxy_id: snapshot.id }, transaction });
    if (snapshot.middlewares?.length) {
      await Middleware.bulkCreate(snapshot.middlewares.map((m) => ({ ...m, proxy_id: snapshot.id })), { transaction });
    }
  });
}

module.exports = { discardProxy, restoreProxy };
