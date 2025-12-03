const express = require('express');
const dockerDiscoveryService = require('../../services/dockerDiscoveryService');
const { DiscoveredService, Proxy } = require('../../models');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const router = express.Router();

/**
 * @route GET /api/discovery
 * @desc Get all discovered services
 * @access Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { source_type, status } = req.query;

    const where = {};
    if (source_type) where.source_type = source_type;
    if (status) where.status = status;

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
 * @route GET /api/discovery/status
 * @desc Get discovery service status
 * @access Private
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
 * @route GET /api/discovery/:id
 * @desc Get single discovered service details
 * @access Private
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
 * @route POST /api/discovery/:id/sync
 * @desc Manually sync a discovered service
 * @access Private (Admin only)
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
      message: error.message || 'Server error while syncing service'
    });
  }
});

/**
 * @route POST /api/discovery/:id/disable
 * @desc Disable auto-management for a service
 * @access Private (Admin only)
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
 * @route POST /api/discovery/:id/enable
 * @desc Enable auto-management for a service
 * @access Private (Admin only)
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
 * @route DELETE /api/discovery/:id
 * @desc Delete a discovered service (and optionally its proxy)
 * @access Private (Admin only)
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
 * @route POST /api/discovery/scan
 * @desc Manually trigger a full scan of containers/services
 * @access Private (Admin only)
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
