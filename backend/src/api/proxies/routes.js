const express = require('express');
const { Proxy } = require('../../models/proxy');
const { Header } = require('../../models/header');
const { Middleware } = require('../../models/middleware');
const caddyService = require('../../services/caddyService');
const { discardProxy, restoreProxy, tryCompensation } = require('../../services/proxyCompensation');
const securityHeadersService = require('../../services/securityHeadersService');
const { authMiddleware, roleMiddleware, requireApiKeyPermission } = require('../../middleware/auth');
const { logAction } = require('../../services/auditService');
const gitService = require('../../services/gitService');
const { GitRepository } = require('../../models');
const { prepareBasicAuth, redactBasicAuth } = require('../../utils/basicAuth');
const { PROXY_ALLOWED_FIELDS, validateProxyInput } = require('../../utils/proxyValidation');

/**
 * Proxy as returned by the API: basic auth hash is never exposed.
 * @param {Object} proxy - Sequelize instance or plain object
 * @returns {Object}
 */
const serializeProxy = (proxy) => {
  if (!proxy) return proxy;
  const data = typeof proxy.toJSON === 'function' ? proxy.toJSON() : { ...proxy };
  return { ...data, basic_auth: redactBasicAuth(data.basic_auth) };
};
const router = express.Router();


/**
 * @route POST /api/proxies/:id/recheck-tls
 * @desc Re-run TLS verification for a proxy's domains (admin or owner)
 * @access Private
 */
router.post('/:id/recheck-tls', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const proxy = await Proxy.findByPk(req.params.id);

    if (!proxy) {
      return res.status(404).json({ success: false, message: 'Proxy not found' });
    }

    // Only allow for ACME-managed proxies (HTTP-01 or Cloudflare DNS-01)
    if (!['acme', 'cloudflare'].includes(proxy.ssl_type)) {
      return res.status(400).json({ success: false, message: 'TLS recheck only applicable for ACME-managed proxies' });
    }

    const domains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
    const tlsStatus = await caddyService.verifyTlsForDomains(domains, 10000);

    // Persist results
    try {
      await proxy.update({ tls_status: tlsStatus, tls_checked_at: new Date() });
    } catch (err) {
      console.error('Failed to persist TLS status:', err.message);
    }

    res.status(200).json({ success: true, tlsStatus });
  } catch (error) {
    console.error('Recheck TLS error:', error);
    res.status(500).json({ success: false, message: 'Failed to recheck TLS' });
  }
});

/**
 * @route GET /api/proxies
 * @desc Get all proxies
 * @access Private
 */
/**
 * @swagger
 * tags:
 *   name: Proxies
 *   description: Reverse proxy configuration management
 *
 * /proxies:
 *   get:
 *     summary: List all proxies
 *     tags: [Proxies]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array of proxy objects
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 proxies:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Proxy'
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;

    // If pagination params provided, use paginated query
    if (page || limit) {
      const pageNum = Math.max(1, parseInt(String(page)) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit)) || 25));
      const offset = (pageNum - 1) * limitNum;

      const { count, rows: proxies } = await Proxy.findAndCountAll({
        include: [
          { model: Header, as: 'headers' },
          { model: Middleware, as: 'middlewares' }
        ],
        limit: limitNum,
        offset,
        distinct: true,
        order: [['createdAt', 'DESC']],
      });

      return res.status(200).json({
        success: true,
        proxies: proxies.map(serializeProxy),
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      });
    }

    // Default: return all (backward compatible)
    const proxies = await Proxy.findAll({
      include: [
        { model: Header, as: 'headers' },
        { model: Middleware, as: 'middlewares' }
      ],
      order: [['createdAt', 'DESC']],
    });
    
    res.status(200).json({
      success: true,
      proxies: proxies.map(serializeProxy)
    });
  } catch (error) {
    console.error('Get proxies error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving proxies' 
    });
  }
});

/**
 * @route GET /api/proxies/:id
 * @desc Get a proxy by ID
 * @access Private
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const proxy = await Proxy.findByPk(/** @type {string} */ (req.params.id), {
      include: [
        { model: Header, as: 'headers' },
        { model: Middleware, as: 'middlewares' }
      ]
    });
    
    if (!proxy) {
      return res.status(404).json({
        success: false,
        message: 'Proxy not found'
      });
    }
    
    res.status(200).json({
      success: true,
      proxy: serializeProxy(proxy)
    });
  } catch (error) {
    console.error('Get proxy error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving proxy' 
    });
  }
});

/**
 * @route POST /api/proxies
 * @desc Create a new proxy
 * @access Private
 *
 * @swagger
 * /proxies:
 *   post:
 *     summary: Create a new proxy
 *     tags: [Proxies]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, domains, upstream_url]
 *             properties:
 *               name: { type: string }
 *               domains: { type: array, items: { type: string } }
 *               upstream_url: { type: string }
 *               ssl_type: { type: string, enum: [acme, cloudflare, custom, none] }
 *               enabled: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Proxy created
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/', [authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('write')], async (req, res) => {
  const transaction = await Proxy.sequelize.transaction();
  
  try {
    // Validate domains and upstream URL
    const validation = validateProxyInput(req.body);
    if (!validation.valid) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: validation.message });
    }

    // Format domains consistently as arrays
    const newDomains = Array.isArray(req.body.domains) ? req.body.domains : [req.body.domains];

    // Find all proxies and check for per-domain overlaps
    const existingProxies = await Proxy.findAll();
    const domainConflict = existingProxies.some(proxy => {
      const domains = /** @type {string[]|string} */ (proxy.domains); // older rows may hold a single string
      const proxyDomains = Array.isArray(domains) ? domains : [domains];
      return newDomains.some(d => proxyDomains.includes(d));
    });

    if (domainConflict) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'A proxy with this name and domains already exists'
      });
    }


    // Resolve creating user's DB id if available
    let creatorId = null;
    try {
      if (req.user && req.user.id) {
        const { User } = require('../../models');
        const dbUser = await User.findByPk(req.user.id);
        if (dbUser) creatorId = dbUser.id;
      }
    } catch (err) {
      console.error('Failed to resolve creating user:', err.message);
    }

    // Build createData from whitelist to prevent mass assignment
    const createData = { created_by: creatorId };
    for (const field of PROXY_ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        createData[field] = req.body[field];
      }
    }

    // Hash basic auth password; plaintext never reaches the database
    try {
      const basicAuth = await prepareBasicAuth(req.body.basic_auth, null);
      if (basicAuth !== undefined) createData.basic_auth = basicAuth;
    } catch (validationError) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: validationError.message });
    }

    // Create the proxy in the database
    const proxy = await Proxy.create(createData, { transaction });
    
    // Apply security headers if enabled (within transaction)
    if (req.body.security_headers_enabled) {
      await securityHeadersService.applySecurityHeaders(proxy.id, Header, transaction);
    }
    
    // Create headers if provided
    if (req.body.headers && Array.isArray(req.body.headers)) {
      for (const header of req.body.headers) {
        await Header.create({
          ...header,
          proxy_id: proxy.id
        }, { transaction });
      }
    }
    
    // Create middlewares if provided
    if (req.body.middlewares && Array.isArray(req.body.middlewares)) {
      for (const middleware of req.body.middlewares) {
        await Middleware.create({
          middleware_type: middleware.middleware_type,
          configuration: middleware.configuration,
          enabled: middleware.enabled,
          order: middleware.order,
          proxy_id: proxy.id
        }, { transaction });
      }
    }
    
    // Commit the database transaction
    await transaction.commit();
    
    // Reload the proxy with its associations
    const reloadedProxy = await Proxy.findByPk(proxy.id, {
      include: [
        { model: Header, as: 'headers' },
        { model: Middleware, as: 'middlewares' }
      ]
    });
    
    // Add the proxy to Caddy; if Caddy rejects it, drop the row so DB and Caddy agree
    let caddyResult;
    try {
      caddyResult = await caddyService.addProxy(reloadedProxy);
    } catch (caddyError) {
      console.error('Caddy rejected the new proxy, removing it from the database:', caddyError);
      const removed = await tryCompensation(() => discardProxy(proxy.id));
      const note = removed ? '' : ' The proxy could not be removed from the database; delete it manually.';
      return res.status(502).json({ success: false, message: `Caddy rejected the proxy: ${caddyError.message}.${note}` });
    }
    
    // Log proxy creation
    await logAction({
      userId: req.user.id,
      action: 'PROXY_CREATED',
      resource: 'proxy',
      resourceId: reloadedProxy.id,
      details: {
        name: reloadedProxy.name,
        domains: reloadedProxy.domains,
        upstream_url: reloadedProxy.upstream_url
      },
      status: 'success'
    }, req);

    // Commit to Git if enabled
    try {
      const gitRepos = await GitRepository.findAll({
        where: { enabled: true, auto_commit: true }
      });

      for (const repo of gitRepos) {
        await gitService.commitConfigChange(
          repo.id,
          'proxy_create',
          'proxy',
          reloadedProxy.id,
          req.user.id,
          null,
          reloadedProxy.toJSON()
        );
      }
    } catch (gitError) {
      console.error('Git commit error:', gitError);
      // Don't fail the request if Git commit fails
    }

    res.status(201).json({
      success: true,
      message: 'Proxy created successfully',
      proxy: serializeProxy(reloadedProxy),
      caddy: caddyResult,
      tlsStatus: caddyResult ? caddyResult.tlsStatus || null : null
    });
  } catch (error) {
    // Roll back unless the error happened after the commit
    if (!transaction.finished) await transaction.rollback();
    
    console.error('Create proxy error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while creating proxy' 
    });
  }
});

/**
 * @route PUT /api/proxies/:id
 * @desc Update a proxy
 * @access Private
 */
router.put('/:id', [authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('write')], async (req, res) => {
  const transaction = await Proxy.sequelize.transaction();
  
  try {
    // Validate domains and upstream URL
    const validation = validateProxyInput(req.body);
    if (!validation.valid) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: validation.message });
    }

    // Find the proxy
    const proxy = await Proxy.findByPk(req.params.id, {
      include: [
        { model: Header, as: 'headers' },
        { model: Middleware, as: 'middlewares' }
      ]
    });

    if (!proxy) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Proxy not found'
      });
    }

    // Capture old values for Git history
    const oldValues = proxy.toJSON();

    // Build updateData from whitelist to prevent mass assignment
    const updateData = {};
    for (const field of PROXY_ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updateData[field] = req.body[field];
      }
    }

    // Hash a new basic auth password, or keep the stored hash when none is sent
    try {
      const basicAuth = await prepareBasicAuth(req.body.basic_auth, proxy.basic_auth);
      if (basicAuth !== undefined) updateData.basic_auth = basicAuth;
    } catch (validationError) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: validationError.message });
    }
    // Update the proxy
    await proxy.update(updateData, { transaction });
    
    // Handle security headers (within transaction)
    if (req.body.security_headers_enabled) {
      await securityHeadersService.applySecurityHeaders(proxy.id, Header, transaction);
    } else {
      await securityHeadersService.removeSecurityHeaders(proxy.id, Header, transaction);
    }
    
    // Handle headers
    if (req.body.headers && Array.isArray(req.body.headers)) {
      // Delete existing headers
      await Header.destroy({
        where: { proxy_id: proxy.id },
        transaction
      });
      
      // Create new headers
      for (const header of req.body.headers) {
        await Header.create({
          ...header,
          proxy_id: proxy.id
        }, { transaction });
      }
    }
    
    // Handle middlewares
    if (req.body.middlewares && Array.isArray(req.body.middlewares)) {
      // Delete existing middlewares
      await Middleware.destroy({
        where: { proxy_id: proxy.id },
        transaction
      });
      
      // Create new middlewares
      for (const middleware of req.body.middlewares) {
        await Middleware.create({
          middleware_type: middleware.middleware_type,
          configuration: middleware.configuration,
          enabled: middleware.enabled,
          order: middleware.order,
          proxy_id: proxy.id
        }, { transaction });
      }
    }
    
    // Commit the database transaction
    await transaction.commit();
    
    // Reload the proxy with its associations
    const reloadedProxy = await Proxy.findByPk(proxy.id, {
      include: [
        { model: Header, as: 'headers' },
        { model: Middleware, as: 'middlewares' }
      ]
    });
    
    // Update Caddy; if Caddy rejects the change, restore the previous proxy
    const committedUpdatedAt = reloadedProxy.updatedAt;
    let caddyResult;
    try {
      caddyResult = await caddyService.updateProxy(reloadedProxy);
    } catch (caddyError) {
      console.error('Caddy rejected the proxy update, restoring the previous version:', caddyError);
      const restored = await tryCompensation(() => restoreProxy(oldValues, committedUpdatedAt));
      const note = restored ? '' : ' The previous version could not be restored (it was changed again or the database failed); review the proxy.';
      return res.status(502).json({ success: false, message: `Caddy rejected the proxy update: ${caddyError.message}.${note}` });
    }
    
    // Log proxy update
    await logAction({
      userId: req.user.id,
      action: 'PROXY_UPDATED',
      resource: 'proxy',
      resourceId: reloadedProxy.id,
      details: {
        name: reloadedProxy.name,
        domains: reloadedProxy.domains,
        upstream_url: reloadedProxy.upstream_url
      },
      status: 'success'
    }, req);

    // Commit to Git if enabled
    try {
      const gitRepos = await GitRepository.findAll({
        where: { enabled: true, auto_commit: true }
      });

      for (const repo of gitRepos) {
        await gitService.commitConfigChange(
          repo.id,
          'proxy_update',
          'proxy',
          reloadedProxy.id,
          req.user.id,
          oldValues,
          reloadedProxy.toJSON()
        );
      }
    } catch (gitError) {
      console.error('Git commit error:', gitError);
      // Don't fail the request if Git commit fails
    }

    res.status(200).json({
      success: true,
      message: 'Proxy updated successfully',
      proxy: serializeProxy(reloadedProxy),
      caddy: caddyResult,
      tlsStatus: caddyResult ? caddyResult.tlsStatus || null : null
    });
  } catch (error) {
    // Roll back unless the error happened after the commit
    if (!transaction.finished) await transaction.rollback();
    
    console.error('Update proxy error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating proxy' 
    });
  }
});

/**
 * @route DELETE /api/proxies/:id
 * @desc Delete a proxy
 * @access Private
 */
router.delete('/:id', [authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('admin')], async (req, res) => {
  const transaction = await Proxy.sequelize.transaction();
  
  try {
    // Find the proxy with all associations
    const proxy = await Proxy.findByPk(req.params.id, {
      include: [
        { model: Header, as: 'headers' },
        { model: Middleware, as: 'middlewares' }
      ]
    });

    if (!proxy) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Proxy not found'
      });
    }

    // Capture proxy data for Git history before deletion
    const proxyData = proxy.toJSON();

    // Delete headers and middlewares
    await Header.destroy({
      where: { proxy_id: proxy.id },
      transaction
    });

    await Middleware.destroy({
      where: { proxy_id: proxy.id },
      transaction
    });

    // Delete the proxy
    await proxy.destroy({ transaction });

    // Commit the database transaction before touching Caddy
    await transaction.commit();

    // Log proxy deletion
    await logAction({
      userId: req.user.id,
      action: 'PROXY_DELETED',
      resource: 'proxy',
      resourceId: proxy.id,
      details: {
        name: proxy.name,
        domains: proxy.domains
      },
      status: 'success'
    }, req);

    // Commit to Git if enabled
    try {
      const gitRepos = await GitRepository.findAll({
        where: { enabled: true, auto_commit: true }
      });

      for (const repo of gitRepos) {
        await gitService.commitConfigChange(
          repo.id,
          'proxy_delete',
          'proxy',
          proxy.id,
          req.user.id,
          proxyData,
          null
        );
      }
    } catch (gitError) {
      console.error('Git commit error:', gitError);
      // Don't fail the request if Git commit fails
    }

    // Remove from Caddy after DB commit — DB is source of truth
    let caddyResult = null;
    try {
      caddyResult = await caddyService.deleteProxy(proxyData);
    } catch (caddyError) {
      console.error('Caddy delete error (DB already committed):', caddyError);
    }

    res.status(200).json({
      success: true,
      message: 'Proxy deleted successfully',
      caddy: caddyResult
    });
  } catch (error) {
    // Roll back unless the error happened after the commit
    if (!transaction.finished) await transaction.rollback();
    
    console.error('Delete proxy error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting proxy' 
    });
  }
});

module.exports = router;
