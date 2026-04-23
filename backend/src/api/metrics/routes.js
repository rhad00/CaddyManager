const express = require('express');
const metricsService = require('../../services/metricsService');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Metrics
 *   description: System and application metrics
 *
 * /metrics:
 *   get:
 *     summary: Get metrics summary
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Metrics summary object
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const summary = await metricsService.getMetricsSummary();
    
    res.status(200).json({
      success: true,
      metrics: summary
    });
  } catch (error) {
    console.error('Get metrics summary error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving metrics summary' 
    });
  }
});

/**
 * @swagger
 * /metrics/raw:
 *   get:
 *     summary: Get raw metrics in Prometheus format
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Prometheus-formatted text metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         $ref: '#/components/schemas/Error'
 *       403:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/raw', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const rawMetrics = await metricsService.getRawMetrics();
    
    res.set('Content-Type', 'text/plain');
    res.status(200).send(rawMetrics);
  } catch (error) {
    console.error('Get raw metrics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving raw metrics' 
    });
  }
});

/**
 * @swagger
 * /metrics/http:
 *   get:
 *     summary: Get HTTP-related metrics
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: HTTP metrics object
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/http', authMiddleware, async (req, res) => {
  try {
    const httpMetrics = await metricsService.getHttpMetrics();
    
    res.status(200).json({
      success: true,
      metrics: httpMetrics
    });
  } catch (error) {
    console.error('Get HTTP metrics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving HTTP metrics' 
    });
  }
});

/**
 * @swagger
 * /metrics/system:
 *   get:
 *     summary: Get system metrics (CPU, memory, etc.)
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: System metrics object
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/system', authMiddleware, async (req, res) => {
  try {
    const systemMetrics = await metricsService.getSystemMetrics();
    
    res.status(200).json({
      success: true,
      metrics: systemMetrics
    });
  } catch (error) {
    console.error('Get system metrics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving system metrics' 
    });
  }
});

/**
 * @swagger
 * /metrics/tls:
 *   get:
 *     summary: Get TLS-related metrics
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: TLS metrics object
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/tls', authMiddleware, async (req, res) => {
  try {
    const tlsMetrics = await metricsService.getTlsMetrics();
    
    res.status(200).json({
      success: true,
      metrics: tlsMetrics
    });
  } catch (error) {
    console.error('Get TLS metrics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving TLS metrics' 
    });
  }
});

/**
 * @swagger
 * /metrics/historical:
 *   get:
 *     summary: Get historical metrics data
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 10
 *         description: "Limit the number of historical entries returned (default: 10, max: 500)"
 *     responses:
 *       200:
 *         description: Array of historical metric snapshots
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/historical', authMiddleware, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const historicalMetrics = await metricsService.getHistoricalMetrics(limit);
    
    res.status(200).json({
      success: true,
      metrics: historicalMetrics
    });
  } catch (error) {
    console.error('Get historical metrics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving historical metrics' 
    });
  }
});

/**
 * @swagger
 * /metrics/snapshot:
 *   post:
 *     summary: Create a metrics snapshot
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       201:
 *         description: Snapshot created successfully
 *       401:
 *         $ref: '#/components/schemas/Error'
 *       403:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/snapshot', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const result = await metricsService.saveMetricsSnapshot();
    
    res.status(201).json({
      success: true,
      message: 'Metrics snapshot created successfully',
      result
    });
  } catch (error) {
    console.error('Create metrics snapshot error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during metrics snapshot creation' 
    });
  }
});

module.exports = router;
