const express = require('express');
const Proxy = require('../../models/proxy');
const Header = require('../../models/header');
const Middleware = require('../../models/middleware');
const caddyService = require('../../services/caddyService');
const securityHeadersService = require('../../services/securityHeadersService');
const { authMiddleware } = require('../../middleware/auth');
const router = express.Router();

/**
 * @route GET /api/proxies
 * @desc Get all proxies
 * @access Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Get all proxy IDs first
    const proxyIds = await Proxy.findAll({
      attributes: ['id'],
      raw: true
    });

    // Then fetch complete data for each proxy
    const proxies = await Proxy.findAll({
      where: {
        id: proxyIds.map(p => p.id)
      },
      include: [
        { model: Header, as: 'headers' },
        { model: Middleware, as: 'middlewares' }
      ]
    });
    
    res.status(200).json({
      success: true,
      proxies
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
    const proxy = await Proxy.findByPk(req.params.id, {
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
      proxy
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
 */
router.post('/', authMiddleware, async (req, res) => {
  const transaction = await Proxy.sequelize.transaction();
  
  try {
    // Format domains consistently as arrays
    const newDomains = Array.isArray(req.body.domains) ? req.body.domains : [req.body.domains];
    const sortedNewDomains = JSON.stringify(newDomains.sort());

    // Find all proxies and check domains manually
    const existingProxies = await Proxy.findAll();
    const domainConflict = existingProxies.some(proxy => {
      const proxyDomains = Array.isArray(proxy.domains) ? proxy.domains : [proxy.domains];
      const sortedProxyDomains = JSON.stringify(proxyDomains.sort());
      return sortedProxyDomains === sortedNewDomains;
    });

    if (domainConflict) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'A proxy with this name and domains already exists'
      });
    }


    // Create the proxy in the database
    const proxy = await Proxy.create(req.body, { transaction });
    
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
          ...middleware,
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
    
    // Add the proxy to Caddy configuration using PATCH
    const caddyResult = await caddyService.addProxy(reloadedProxy);
    
    res.status(201).json({
      success: true,
      message: 'Proxy created successfully',
      proxy: reloadedProxy,
      caddy: caddyResult
    });
  } catch (error) {
    // Rollback the transaction if there was an error
    await transaction.rollback();
    
    console.error('Create proxy error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Server error while creating proxy: ${error.message}` 
    });
  }
});

/**
 * @route PUT /api/proxies/:id
 * @desc Update a proxy
 * @access Private
 */
router.put('/:id', authMiddleware, async (req, res) => {
  const transaction = await Proxy.sequelize.transaction();
  
  try {
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
    
    // Update the proxy
    await proxy.update(req.body, { transaction });
    
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
          ...middleware,
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
    
    // Update the proxy in Caddy configuration using PATCH
    const caddyResult = await caddyService.updateProxy(reloadedProxy);
    
    res.status(200).json({
      success: true,
      message: 'Proxy updated successfully',
      proxy: reloadedProxy,
      caddy: caddyResult
    });
  } catch (error) {
    // Rollback the transaction if there was an error
    await transaction.rollback();
    
    console.error('Update proxy error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Server error while updating proxy: ${error.message}` 
    });
  }
});

/**
 * @route DELETE /api/proxies/:id
 * @desc Delete a proxy
 * @access Private
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const transaction = await Proxy.sequelize.transaction();
  
  try {
    // Find the proxy
    const proxy = await Proxy.findByPk(req.params.id);
    
    if (!proxy) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Proxy not found'
      });
    }
    
    // Delete the proxy from Caddy configuration first
    const caddyResult = await caddyService.deleteProxy(proxy);
    
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
    
    // Commit the database transaction
    await transaction.commit();
    
    res.status(200).json({
      success: true,
      message: 'Proxy deleted successfully',
      caddy: caddyResult
    });
  } catch (error) {
    // Rollback the transaction if there was an error
    await transaction.rollback();
    
    console.error('Delete proxy error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Server error while deleting proxy: ${error.message}` 
    });
  }
});

module.exports = router;
