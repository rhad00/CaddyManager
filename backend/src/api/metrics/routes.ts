import express, { type Request, type Response } from 'express';
import { metricsService } from '../../services/metricsService';
import { authMiddleware, roleMiddleware } from '../../middleware/auth';
import { Proxy } from '../../models/proxy';
import { isRangeKey, readTrafficReport, OTHER_ID, type TrafficReport } from '../../services/trafficAnalytics';

import { readLiveReport, type LiveReport } from '../../services/liveTraffic';
import { recentAlertEvents } from '../../services/alertEvents';
import { isHistoryRange, readHistory } from '../../services/trafficRollup';
import { certificateTimeline } from '../../services/certificateTimeline';
import { buildUpstreamHealth, fetchCaddyUpstreams, type UpstreamHealthReport } from '../../services/upstreamHealth';

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
const trafficCache = new Map<string, { at: number; report: Promise<TrafficReport> }>();

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
 *       - in: query
 *         name: proxy
 *         description: A proxy id, or "other" for hosts that belong to no proxy. That scope (and the total) gets the detailed breakdowns.
 *         schema:
 *           type: string
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
    const proxies = await Proxy.findAll({ attributes: ['id', 'name', 'domains', 'status'], order: [['name', 'ASC']] });
    // Only a proxy that exists (or "other") is a scope: an arbitrary string must not fill the cache
    const asked = typeof req.query.proxy === 'string' ? req.query.proxy : null;
    const scope = asked !== null && (asked === OTHER_ID || proxies.some((p) => p.id === asked)) ? asked : null;
    const cacheKey = `${range}:${scope ?? ''}`;

    let cached = trafficCache.get(cacheKey);
    if (!cached || Date.now() - cached.at > TRAFFIC_CACHE_MS) {
      const report = readTrafficReport({
        proxies: proxies.map((p) => ({ id: p.id, name: p.name, domains: p.domains, status: p.status })),
        range,
        scope,
      });
      cached = { at: Date.now(), report };
      trafficCache.set(cacheKey, cached);
      // A failed read must not be served from the cache for the next 15 seconds
      report.catch(() => trafficCache.delete(cacheKey));
    }
    return res.status(200).json({ success: true, traffic: await cached.report });
  } catch (error) {
    console.error('Get traffic analytics error:', error);
    return res.status(500).json({ success: false, message: 'Server error while reading the traffic analytics' });
  }
});

/**
 * @swagger
 * /metrics/alerts:
 *   get:
 *     summary: Times alert rules fired, newest first
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           enum: [1, 7, 30, 90]
 *           default: 7
 *       - in: query
 *         name: proxy
 *         description: Only events of this proxy id
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Up to 200 events
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/alerts', authMiddleware, async (req: Request, res: Response) => {
  const days = req.query.days === undefined ? 7 : Number(req.query.days);
  if (![1, 7, 30, 90].includes(days)) {
    return res.status(400).json({ success: false, message: 'The days must be 1, 7, 30 or 90.' });
  }
  try {
    const proxy = typeof req.query.proxy === 'string' && req.query.proxy ? req.query.proxy : null;
    const events = await recentAlertEvents(Date.now() - days * 86_400_000, proxy);
    return res.status(200).json({ success: true, events });
  } catch (error) {
    console.error('Get alert events error:', error);
    return res.status(500).json({ success: false, message: 'Server error while reading the alert events' });
  }
});

/**
 * @swagger
 * /metrics/history:
 *   get:
 *     summary: Daily traffic for the last 30 or 90 days, kept beyond the access log
 *     description: Built from hourly rollups. Days are UTC days. `coveredFrom` is the first hour with stored data; earlier days are unknown, not empty.
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [30d, 90d]
 *           default: 30d
 *       - in: query
 *         name: proxy
 *         description: A proxy id, or "other"; all traffic when omitted.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Daily series
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  const range = req.query.range === undefined ? '30d' : req.query.range;
  if (!isHistoryRange(range)) {
    return res.status(400).json({ success: false, message: 'The range must be 30d or 90d.' });
  }
  try {
    const asked = typeof req.query.proxy === 'string' ? req.query.proxy : null;
    let scope: string | null = null;
    if (asked === OTHER_ID) scope = OTHER_ID;
    else if (asked !== null) {
      // Compared here, not in SQL: an id that is not a UUID must be "unknown", not a database error
      const ids = (await Proxy.findAll({ attributes: ['id'] })).map((p) => p.id);
      if (ids.includes(asked)) scope = asked;
    }
    return res.status(200).json({ success: true, history: await readHistory(range, scope) });
  } catch (error) {
    console.error('Get traffic history error:', error);
    return res.status(500).json({ success: false, message: 'Server error while reading the traffic history' });
  }
});

/**
 * @swagger
 * /metrics/upstreams:
 *   get:
 *     summary: Health of every upstream of the active proxies
 *     description: A TCP connect from CaddyManager joined with the in-flight requests and failures Caddy reports. Cached for 10 seconds.
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: One row per proxy and upstream address, worst first
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
const UPSTREAM_CACHE_MS = 10_000;
let upstreamCache: { at: number; report: Promise<UpstreamHealthReport> } | null = null;

router.get('/upstreams', authMiddleware, async (_req: Request, res: Response) => {
  try {
    if (!upstreamCache || Date.now() - upstreamCache.at > UPSTREAM_CACHE_MS) {
      const report = (async () => {
        const proxies = await Proxy.findAll({
          where: { status: 'active' },
          attributes: ['id', 'name', 'upstream_url', 'load_balancing', 'path_routing'],
        });
        return buildUpstreamHealth(proxies, await fetchCaddyUpstreams());
      })();
      upstreamCache = { at: Date.now(), report };
      report.catch(() => { upstreamCache = null; });
    }
    return res.status(200).json({ success: true, upstreams: await upstreamCache.report });
  } catch (error) {
    console.error('Get upstream health error:', error);
    return res.status(500).json({ success: false, message: 'Server error while checking the upstreams' });
  }
});

/**
 * @swagger
 * /metrics/certificates:
 *   get:
 *     summary: When each proxy domain's certificate ends, soonest first
 *     description: Built from the stored TLS check of each proxy (taken when it is saved or rechecked), so every row carries the time of that check.
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: One row per domain
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/certificates', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const proxies = await Proxy.findAll({
      attributes: ['id', 'name', 'domains', 'ssl_type', 'tls_status', 'tls_checked_at'],
    });
    return res.status(200).json({ success: true, certificates: certificateTimeline(proxies) });
  } catch (error) {
    console.error('Get certificate timeline error:', error);
    return res.status(500).json({ success: false, message: 'Server error while reading the certificates' });
  }
});

/**
 * @swagger
 * /metrics/live:
 *   get:
 *     summary: Requests of the last five minutes, from the end of the access log
 *     tags: [Metrics]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Live report, in five second steps, with the newest requests (paths only)
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
const LIVE_CACHE_MS = 2000;
let liveCache: { at: number; report: Promise<LiveReport> } | null = null;

router.get('/live', authMiddleware, async (_req: Request, res: Response) => {
  try {
    if (!liveCache || Date.now() - liveCache.at > LIVE_CACHE_MS) {
      const report = readLiveReport();
      liveCache = { at: Date.now(), report };
      report.catch(() => { liveCache = null; });
    }
    return res.status(200).json({ success: true, live: await liveCache.report });
  } catch (error) {
    console.error('Get live traffic error:', error);
    return res.status(500).json({ success: false, message: 'Server error while reading the live traffic' });
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
