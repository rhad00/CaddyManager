const express = require('express');
const router = express.Router();

/**
 * @route GET /api/features
 * @desc Return feature flags based on environment (e.g., Cloudflare DNS availability)
 * @access Public (frontend needs to query this)
 */
router.get('/', async (req, res) => {
  try {
    const cloudflareEnabled = !!process.env.CLOUDFLARE_API_TOKEN;
    res.status(200).json({ success: true, features: { cloudflare: cloudflareEnabled } });
  } catch (err) {
    console.error('Failed to fetch features:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch features' });
  }
});

module.exports = router;
