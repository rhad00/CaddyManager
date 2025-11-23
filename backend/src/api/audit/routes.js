const express = require('express');
const { AuditLog, User } = require('../../models');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const { Op } = require('sequelize');
const router = express.Router();

/**
 * @route GET /api/audit/logs
 * @desc Get audit logs with filtering and pagination
 * @access Private (Admin only)
 */
router.get('/logs', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      action,
      resource,
      userId,
      status,
      startDate,
      endDate,
    } = req.query;

    // Build filter conditions
    const where = {};

    if (action) {
      where.action = action;
    }

    if (resource) {
      where.resource = resource;
    }

    if (userId) {
      where.userId = userId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate);
      }
    }

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Fetch logs with user information
    const { count, rows: logs } = await AuditLog.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'name', 'role'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving audit logs',
    });
  }
});

/**
 * @route GET /api/audit/logs/:id
 * @desc Get a specific audit log entry
 * @access Private (Admin only)
 */
router.get('/logs/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const log = await AuditLog.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'name', 'role'],
        },
      ],
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found',
      });
    }

    res.status(200).json({
      success: true,
      log,
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving audit log',
    });
  }
});

/**
 * @route GET /api/audit/stats
 * @desc Get audit log statistics
 * @access Private (Admin only)
 */
router.get('/stats', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate);
      }
    }

    // Get total count
    const totalLogs = await AuditLog.count({ where });

    // Get counts by action
    const actionCounts = await AuditLog.findAll({
      where,
      attributes: [
        'action',
        [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count'],
      ],
      group: ['action'],
      raw: true,
    });

    // Get counts by resource
    const resourceCounts = await AuditLog.findAll({
      where,
      attributes: [
        'resource',
        [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count'],
      ],
      group: ['resource'],
      raw: true,
    });

    // Get counts by status
    const statusCounts = await AuditLog.findAll({
      where,
      attributes: [
        'status',
        [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    res.status(200).json({
      success: true,
      stats: {
        total: totalLogs,
        byAction: actionCounts,
        byResource: resourceCounts,
        byStatus: statusCounts,
      },
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving audit statistics',
    });
  }
});

/**
 * @route GET /api/audit/actions
 * @desc Get list of all unique actions
 * @access Private (Admin only)
 */
router.get('/actions', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const actions = await AuditLog.findAll({
      attributes: [[AuditLog.sequelize.fn('DISTINCT', AuditLog.sequelize.col('action')), 'action']],
      raw: true,
    });

    res.status(200).json({
      success: true,
      actions: actions.map((a) => a.action).filter(Boolean),
    });
  } catch (error) {
    console.error('Get audit actions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving audit actions',
    });
  }
});

/**
 * @route GET /api/audit/resources
 * @desc Get list of all unique resources
 * @access Private (Admin only)
 */
router.get('/resources', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const resources = await AuditLog.findAll({
      attributes: [[AuditLog.sequelize.fn('DISTINCT', AuditLog.sequelize.col('resource')), 'resource']],
      raw: true,
    });

    res.status(200).json({
      success: true,
      resources: resources.map((r) => r.resource).filter(Boolean),
    });
  } catch (error) {
    console.error('Get audit resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving audit resources',
    });
  }
});

module.exports = router;
