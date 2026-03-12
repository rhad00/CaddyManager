const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Features
 *   description: Server-side feature flags
 *
 * /features:
 *   get:
 *     summary: Get enabled feature flags
 *     tags: [Features]
 *     security: []
 *     responses:
 *       200:
 *         description: Feature flags object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 features:
 *                   type: object
 *                   properties:
 *                     cloudflare: { type: boolean, description: "Whether Cloudflare DNS challenge is enabled" }
 */
router.get('/', async (req, res) => {
  try {
    const cloudflareEnabled = !!process.env.CF_API_TOKEN;
    res.status(200).json({ success: true, features: { cloudflare: cloudflareEnabled } });
  } catch (err) {
    console.error('Failed to fetch features:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch features' });
  }
});

module.exports = router;
