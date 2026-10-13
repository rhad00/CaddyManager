/**
 * Undo a committed proxy change after Caddy rejected it.
 *
 * Proxy routes commit to the database before calling Caddy (Caddy reads the committed
 * state, e.g. for the Cloudflare DNS-01 policy). When Caddy then refuses the change, these
 * helpers bring the database back in line with what Caddy is actually running.
 */
const { sequelize, Proxy, Header, Middleware } = require('../models');

// Fields of a proxy snapshot that are not written back on restore. The route index and TLS
// status are maintained by caddyService, and a concurrent delete may have shifted the index
// since the snapshot was taken.
const NON_RESTORED_FIELDS = new Set([
  'id', 'headers', 'middlewares', 'created_at', 'updated_at', 'createdAt', 'updatedAt',
  'caddy_route_index', 'tls_status', 'tls_checked_at',
]);

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
 *
 * The restore is skipped when the row changed again after the failed update (its
 * `updatedAt` no longer matches), so a concurrent edit is not overwritten.
 * @param {Object} snapshot
 * @param {Date} expectedUpdatedAt - `updatedAt` written by the failed update
 * @returns {Promise<boolean>} whether the snapshot was restored
 */
async function restoreProxy(snapshot, expectedUpdatedAt) {
  const fields = Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => !NON_RESTORED_FIELDS.has(key))
  );

  return sequelize.transaction(async (transaction) => {
    const [updated] = await Proxy.update(fields, {
      where: { id: snapshot.id, updatedAt: expectedUpdatedAt },
      transaction,
    });
    if (updated === 0) return false;

    await Header.destroy({ where: { proxy_id: snapshot.id }, transaction });
    if (snapshot.headers?.length) {
      await Header.bulkCreate(snapshot.headers.map((h) => ({ ...h, proxy_id: snapshot.id })), { transaction });
    }

    await Middleware.destroy({ where: { proxy_id: snapshot.id }, transaction });
    if (snapshot.middlewares?.length) {
      await Middleware.bulkCreate(snapshot.middlewares.map((m) => ({ ...m, proxy_id: snapshot.id })), { transaction });
    }
    return true;
  });
}

/**
 * Run a compensation step without letting its failure hide the original Caddy error.
 * @param {() => Promise<boolean|void>} step - resolves false when it chose not to act
 * @returns {Promise<boolean>} whether the step completed
 */
async function tryCompensation(step) {
  try {
    return (await step()) !== false;
  } catch (error) {
    console.error('Compensating database change failed:', error);
    return false;
  }
}

module.exports = { discardProxy, restoreProxy, tryCompensation };
