const express = require('express');
const metricsService = require('../../services/metricsService');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const router = express.Router();

/**
 * @route GET /api/metrics
 * @desc Get metrics summary
 * @access Private
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
 * @route GET /api/metrics/raw
 * @desc Get raw metrics in Prometheus format
 * @access Private (Admin only)
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
 * @route GET /api/metrics/http
 * @desc Get HTTP-related metrics
 * @access Private
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
 * @route GET /api/metrics/system
 * @desc Get system metrics (CPU, memory, etc.)
 * @access Private
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
 * @route GET /api/metrics/tls
 * @desc Get TLS-related metrics
 * @access Private
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
 * @route GET /api/metrics/historical
 * @desc Get historical metrics data
 * @access Private
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
 * @route POST /api/metrics/snapshot
 * @desc Create a metrics snapshot
 * @access Private (Admin only)
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
