const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { getLogs, streamLogs, getLogStats } = require('../../services/logService');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Logs
 *   description: Caddy access log viewer
 *
 * /logs:
 *   get:
 *     summary: Query access log entries
 *     tags: [Logs]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 500, maximum: 2000 }
 *         description: "Maximum entries to return (default: 500, max: 2000)"
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: HTTP status code filter
 *       - in: query
 *         name: method
 *         schema: { type: string }
 *         description: "HTTP method filter (GET, POST, etc.)"
 *       - in: query
 *         name: host
 *         schema: { type: string }
 *         description: Hostname partial-match filter
 *       - in: query
 *         name: ip
 *         schema: { type: string }
 *         description: Remote IP partial-match filter
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: "Full-text search on URI, host, IP"
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: ISO 8601 start time
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: ISO 8601 end time
 *     responses:
 *       200:
 *         description: Array of access log entries
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { limit, status, method, host, ip, search, from, to } = req.query;
    const entries = await getLogs({ limit, status, method, host, ip, search, from, to });
    res.json({ success: true, count: entries.length, logs: entries });
  } catch (err) {
    console.error('Log query error:', err);
    res.status(500).json({ success: false, message: 'Failed to read access logs' });
  }
});

/**
 * @swagger
 * /logs/stream:
 *   get:
 *     summary: "Server-Sent Events live log tail"
 *     description: "Real-time stream of new access log lines via SSE. Pass the JWT as a query parameter since EventSource does not support custom headers."
 *     tags: [Logs]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: token
 *         schema: { type: string }
 *         description: JWT token for SSE authentication
 *     responses:
 *       200:
 *         description: Server-Sent Events stream
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/stream', authMiddleware, (req, res) => {
  streamLogs(req, res);
});

/**
 * @swagger
 * /logs/stats:
 *   get:
 *     summary: Get access log file statistics
 *     tags: [Logs]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Log file stats
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = getLogStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get log stats' });
  }
});

module.exports = router;
