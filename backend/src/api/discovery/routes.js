const express = require('express');
const dockerDiscoveryService = require('../../services/dockerDiscoveryService');
const { DiscoveredService, Proxy } = require('../../models');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Discovery
 *   description: Docker/Kubernetes service auto-discovery
 *
 * /discovery:
 *   get:
 *     summary: List all discovered services
 *     tags: [Discovery]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: source_type
 *         schema: { type: string, enum: [docker, kubernetes] }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *     responses:
 *       200:
 *         description: Array of discovered service objects
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { source_type, status, page, limit } = req.query;

    const where = {};
    if (source_type) where.source_type = source_type;
    if (status) where.status = status;

    if (page || limit) {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
      const offset = (pageNum - 1) * limitNum;

      const { count, rows: services } = await DiscoveredService.findAndCountAll({
        where,
        include: [{
          model: Proxy,
          as: 'proxy',
          attributes: ['id', 'name', 'domains', 'upstream_url', 'status']
        }],
        order: [['last_seen', 'DESC']],
        limit: limitNum,
        offset,
        distinct: true,
      });

      return res.status(200).json({
        success: true,
        services,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      });
    }

    const services = await DiscoveredService.findAll({
      where,
      include: [{
        model: Proxy,
        as: 'proxy',
        attributes: ['id', 'name', 'domains', 'upstream_url', 'status']
      }],
      order: [['last_seen', 'DESC']]
    });

    res.status(200).json({
      success: true,
      services
    });
  } catch (error) {
    console.error('Get discovered services error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving discovered services'
    });
  }
});

/**
 * @swagger
 * /discovery/status:
 *   get:
 *     summary: Get discovery service status
 *     tags: [Discovery]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Discovery service status for each source
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const dockerStatus = dockerDiscoveryService.getStatus();

    // TODO: Add Kubernetes status when implemented
    // const k8sStatus = kubernetesDiscoveryService.getStatus();

    res.status(200).json({
      success: true,
      status: {
        docker: dockerStatus,
        // kubernetes: k8sStatus
      }
    });
  } catch (error) {
    console.error('Get discovery status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving discovery status'
    });
  }
});

/**
 * @swagger
 * /discovery/{id}:
 *   get:
 *     summary: Get a discovered service by ID
 *     tags: [Discovery]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Discovered service object
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await DiscoveredService.findByPk(req.params.id, {
      include: [{
        model: Proxy,
        as: 'proxy'
      }]
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Discovered service not found'
      });
    }

    res.status(200).json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Get discovered service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving discovered service'
    });
  }
});

/**
 * @swagger
 * /discovery/{id}/sync:
 *   post:
 *     summary: Manually sync a discovered service
 *     tags: [Discovery]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Service synced
 *       501:
 *         description: Not implemented for this source type
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/:id/sync', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const service = await DiscoveredService.findByPk(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    if (service.source_type === 'docker') {
      await dockerDiscoveryService.syncContainer(service.source_id);
    } else if (service.source_type === 'kubernetes') {
      // TODO: Implement K8s sync
      return res.status(501).json({
        success: false,
        message: 'Kubernetes sync not yet implemented'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Service synced successfully'
    });
  } catch (error) {
    console.error('Sync discovered service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while syncing service'
    });
  }
});

/**
 * @swagger
 * /discovery/{id}/disable:
 *   post:
 *     summary: Disable auto-management for a discovered service
 *     tags: [Discovery]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Auto-management disabled
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/:id/disable', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const service = await DiscoveredService.findByPk(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    service.auto_managed = false;
    await service.save();

    res.status(200).json({
      success: true,
      message: 'Auto-management disabled for service'
    });
  } catch (error) {
    console.error('Disable auto-management error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while disabling auto-management'
    });
  }
});

/**
 * @swagger
 * /discovery/{id}/enable:
 *   post:
 *     summary: Enable auto-management for a discovered service
 *     tags: [Discovery]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Auto-management enabled
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/:id/enable', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const service = await DiscoveredService.findByPk(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    service.auto_managed = true;
    await service.save();

    res.status(200).json({
      success: true,
      message: 'Auto-management enabled for service'
    });
  } catch (error) {
    console.error('Enable auto-management error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while enabling auto-management'
    });
  }
});

/**
 * @swagger
 * /discovery/{id}:
 *   delete:
 *     summary: Delete a discovered service
 *     tags: [Discovery]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: deleteProxy
 *         schema: { type: boolean }
 *         description: Also delete the associated proxy
 *     responses:
 *       200:
 *         description: Service deleted
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const { deleteProxy } = req.query;
    const service = await DiscoveredService.findByPk(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Optionally delete associated proxy
    if (deleteProxy === 'true' && service.proxy_id) {
      const proxy = await Proxy.findByPk(service.proxy_id);
      if (proxy) {
        await proxy.destroy();

        // Update Caddy config
        const caddyService = require('../../services/caddyService');
        await caddyService.updateCaddyConfig();
      }
    }

    await service.destroy();

    res.status(200).json({
      success: true,
      message: 'Discovered service deleted'
    });
  } catch (error) {
    console.error('Delete discovered service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting service'
    });
  }
});

/**
 * @swagger
 * /discovery/scan:
 *   post:
 *     summary: Trigger a full scan of all containers and services
 *     tags: [Discovery]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source:
 *                 type: string
 *                 enum: [docker, kubernetes]
 *                 description: Limit scan to a specific source
 *     responses:
 *       200:
 *         description: Scan completed
 *       503:
 *         description: Discovery service not initialized
 */
router.post('/scan', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const { source } = req.body;

    if (!source || source === 'docker') {
      if (dockerDiscoveryService.initialized) {
        await dockerDiscoveryService.scanExistingContainers();
      } else {
        return res.status(503).json({
          success: false,
          message: 'Docker discovery not initialized'
        });
      }
    }

    // TODO: Add K8s scan when implemented

    res.status(200).json({
      success: true,
      message: 'Scan completed successfully'
    });
  } catch (error) {
    console.error('Manual scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during scan'
    });
  }
});

module.exports = router;
