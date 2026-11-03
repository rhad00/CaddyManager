import express, { type Request, type Response } from 'express';
import { metricsService } from '../../services/metricsService';
import { authMiddleware, roleMiddleware } from '../../middleware/auth';
import { Proxy } from '../../models/proxy';
import { isRangeKey, readTrafficReport, type RangeKey, type TrafficReport } from '../../services/trafficAnalytics';

export const router = express.Router();

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
router.get('/', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/raw', [authMiddleware, roleMiddleware('admin')], async (req: Request, res: Response) => {
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
router.get('/http', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/system', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/tls', authMiddleware, async (req: Request, res: Response) => {
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

/** The access log is read once per range every few seconds, however many pages poll it */
const TRAFFIC_CACHE_MS = 15_000;
const trafficCache = new Map<RangeKey, { at: number; report: Promise<TrafficReport> }>();

/**
 * @swagger
 * /metrics/traffic:
 *   get:
 *     summary: Traffic analytics per proxy from the Caddy access log
 *     description: Requests over time by status class, bandwidth, latency, top paths and clients, for every proxy and in total.
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 24h, 7d]
 *           default: 24h
 *     responses:
 *       200:
 *         description: Traffic report
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/traffic', authMiddleware, async (req: Request, res: Response) => {
  const range = req.query.range === undefined ? '24h' : req.query.range;
  if (!isRangeKey(range)) {
    return res.status(400).json({ success: false, message: 'The range must be 1h, 6h, 24h or 7d.' });
  }

  try {
    let cached = trafficCache.get(range);
    if (!cached || Date.now() - cached.at > TRAFFIC_CACHE_MS) {
      const proxies = await Proxy.findAll({ attributes: ['id', 'name', 'domains', 'status'], order: [['name', 'ASC']] });
      const report = readTrafficReport({
        proxies: proxies.map((p) => ({ id: p.id, name: p.name, domains: p.domains, status: p.status })),
        range,
      });
      cached = { at: Date.now(), report };
      trafficCache.set(range, cached);
      // A failed read must not be served from the cache for the next 15 seconds
      report.catch(() => trafficCache.delete(range));
    }
    return res.status(200).json({ success: true, traffic: await cached.report });
  } catch (error) {
    console.error('Get traffic analytics error:', error);
    return res.status(500).json({ success: false, message: 'Server error while reading the traffic analytics' });
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
router.get('/historical', authMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 10;
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
router.post('/snapshot', [authMiddleware, roleMiddleware('admin')], async (req: Request, res: Response) => {
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
