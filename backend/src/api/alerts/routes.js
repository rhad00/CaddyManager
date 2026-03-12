const express = require('express');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const AlertRule = require('../../models/alertRule');
const NotificationChannel = require('../../models/notificationChannel');
const { runAlertChecks, sendToChannel } = require('../../services/alertService');

const router = express.Router();
const adminOnly = [authMiddleware, roleMiddleware('admin')];

// ── Notification Channels ─────────────────────────────────────────────────────

router.get('/channels', authMiddleware, async (req, res) => {
  try {
    const channels = await NotificationChannel.findAll({ order: [['createdAt', 'DESC']] });
    // Redact sensitive fields from response
    const safe = channels.map(c => {
      const j = c.toJSON();
      if (j.config?.webhook_url) j.config = { ...j.config, webhook_url: '***' };
      return j;
    });
    res.json({ success: true, channels: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch channels' });
  }
});

router.post('/channels', adminOnly, async (req, res) => {
  try {
    const { name, type, config, enabled } = req.body;
    if (!name || !type || !config) {
      return res.status(400).json({ success: false, message: 'name, type, and config are required' });
    }
    const validTypes = ['email', 'slack', 'discord', 'webhook'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${validTypes.join(', ')}` });
    }
    const channel = await NotificationChannel.create({ name, type, config, enabled: enabled !== false });
    res.status(201).json({ success: true, channel });
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ success: false, message: 'Failed to create channel' });
  }
});

router.put('/channels/:id', adminOnly, async (req, res) => {
  try {
    const channel = await NotificationChannel.findByPk(req.params.id);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });
    const { name, type, config, enabled } = req.body;
    await channel.update({ name, type, config, enabled });
    res.json({ success: true, channel });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update channel' });
  }
});

router.delete('/channels/:id', adminOnly, async (req, res) => {
  try {
    const channel = await NotificationChannel.findByPk(req.params.id);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });
    await channel.destroy();
    res.json({ success: true, message: 'Channel deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete channel' });
  }
});

/** Test a notification channel by sending a test message */
router.post('/channels/:id/test', adminOnly, async (req, res) => {
  try {
    const channel = await NotificationChannel.findByPk(req.params.id);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });
    await sendToChannel(channel, '[CaddyManager] Test Notification', 'This is a test notification from CaddyManager. If you received this, your channel is configured correctly.');
    res.json({ success: true, message: 'Test notification sent' });
  } catch (err) {
    console.error('Test channel error:', err);
    res.status(500).json({ success: false, message: `Failed to send test: ${err.message}` });
  }
});

// ── Alert Rules ───────────────────────────────────────────────────────────────

router.get('/rules', authMiddleware, async (req, res) => {
  try {
    const rules = await AlertRule.findAll({ order: [['createdAt', 'DESC']] });
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch alert rules' });
  }
});

router.post('/rules', adminOnly, async (req, res) => {
  try {
    const { name, condition_type, threshold, proxy_id, channel_ids, cooldown_minutes, enabled } = req.body;
    if (!name || !condition_type) {
      return res.status(400).json({ success: false, message: 'name and condition_type are required' });
    }
    const validTypes = ['cert_expiry', 'upstream_down', 'error_rate', 'no_traffic'];
    if (!validTypes.includes(condition_type)) {
      return res.status(400).json({ success: false, message: `condition_type must be one of: ${validTypes.join(', ')}` });
    }
    const rule = await AlertRule.create({
      name, condition_type, threshold, proxy_id: proxy_id || null,
      channel_ids: channel_ids || [], cooldown_minutes: cooldown_minutes || 60,
      enabled: enabled !== false,
    });
    res.status(201).json({ success: true, rule });
  } catch (err) {
    console.error('Create alert rule error:', err);
    res.status(500).json({ success: false, message: 'Failed to create alert rule' });
  }
});

router.put('/rules/:id', adminOnly, async (req, res) => {
  try {
    const rule = await AlertRule.findByPk(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: 'Alert rule not found' });
    const { name, condition_type, threshold, proxy_id, channel_ids, cooldown_minutes, enabled } = req.body;
    await rule.update({ name, condition_type, threshold, proxy_id, channel_ids, cooldown_minutes, enabled });
    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update alert rule' });
  }
});

router.delete('/rules/:id', adminOnly, async (req, res) => {
  try {
    const rule = await AlertRule.findByPk(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: 'Alert rule not found' });
    await rule.destroy();
    res.json({ success: true, message: 'Alert rule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete alert rule' });
  }
});

/** Manually trigger all alert checks */
router.post('/run', adminOnly, async (req, res) => {
  try {
    await runAlertChecks();
    res.json({ success: true, message: 'Alert checks completed' });
  } catch (err) {
    res.status(500).json({ success: false, message: `Alert check failed: ${err.message}` });
  }
});

module.exports = router;
