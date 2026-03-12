const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { getLogs, streamLogs, getLogStats } = require('../../services/logService');

const router = express.Router();

/**
 * @route GET /api/logs
 * @desc Query access log entries with optional filters
 * @access Private
 * @query {number} limit - Max entries (default 500, max 2000)
 * @query {string} status - HTTP status code filter
 * @query {string} method - HTTP method filter (GET, POST, etc.)
 * @query {string} host - Hostname filter (partial match)
 * @query {string} ip - Remote IP filter (partial match)
 * @query {string} search - Full-text search on URI, host, IP
 * @query {string} from - ISO8601 start time
 * @query {string} to - ISO8601 end time
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
 * @route GET /api/logs/stream
 * @desc Server-Sent Events stream of new access log lines (live tail)
 * @access Private (token passed as query param for SSE compatibility)
 */
router.get('/stream', authMiddleware, (req, res) => {
  streamLogs(req, res);
});

/**
 * @route GET /api/logs/stats
 * @desc Get log file statistics
 * @access Private
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
