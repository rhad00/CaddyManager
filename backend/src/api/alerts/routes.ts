import express, { type Request, type Response } from 'express';
import { authMiddleware, roleMiddleware } from '../../middleware/auth';
import { AlertRule } from '../../models/alertRule';
import { NotificationChannel } from '../../models/notificationChannel';
import { runAlertChecks, sendToChannel } from '../../services/alertService';
import { channelProblem, redactChannel } from '../../utils/notificationChannels';

const REDACTED = '***';

/** The channel config fields the redaction logic reads */
interface ChannelFields {
  url?: unknown;
  webhook_url?: unknown;
  headers?: Record<string, unknown>;
  [field: string]: unknown;
}

/**
 * Replace "***" placeholders (from the redacted list) with the stored values. Stored
 * secrets are only kept while the destination stays the same: a new URL or channel
 * type must come with its header values, or they could be sent somewhere new.
 * @returns the merged config, or the problem that stops the merge
 */
function keepRedacted(incoming: ChannelFields, stored: ChannelFields, sameType: boolean): { config?: ChannelFields; problem?: string } {
  const merged: ChannelFields = { ...incoming };
  for (const key of ['url', 'webhook_url']) {
    if (merged[key] === REDACTED) merged[key] = stored[key];
  }
  const sameDestination = sameType && merged.url === stored.url && merged.webhook_url === stored.webhook_url;
  if (merged.headers && typeof merged.headers === 'object') {
    const kept = Object.entries(merged.headers).filter(([, value]) => value === REDACTED);
    if (kept.length > 0 && !sameDestination) {
      return { problem: 'Re-enter the header values when changing the URL or channel type' };
    }
    merged.headers = Object.fromEntries(Object.entries(merged.headers).map(([name, value]) => [
      name, value === REDACTED ? stored.headers?.[name] : value,
    ]));
  }
  return { config: merged };
}

export const router = express.Router();
const adminOnly = [authMiddleware, roleMiddleware('admin')];

/**
 * @swagger
 * tags:
 *   - name: Alerts
 *     description: Alert rules and notification channels
 */

// ── Notification Channels ─────────────────────────────────────────────────────

/**
 * @swagger
 * /alerts/channels:
 *   get:
 *     summary: List notification channels
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array of notification channels (sensitive fields redacted)
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/channels', authMiddleware, async (req: Request, res: Response) => {
  try {
    const channels = await NotificationChannel.findAll({ order: [['createdAt', 'DESC']] });
    // URLs often embed tokens and headers carry credentials
    const safe = channels.map(c => redactChannel(c.toJSON()));
    res.json({ success: true, channels: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch channels' });
  }
});

/**
 * @swagger
 * /alerts/channels:
 *   post:
 *     summary: Create notification channel
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, config]
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [email, slack, discord, webhook] }
 *               config: { type: object }
 *               enabled: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Channel created
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/channels', adminOnly, async (req: Request, res: Response) => {
  try {
    const { name, type, config, enabled } = req.body;
    if (!name || !type || !config) {
      return res.status(400).json({ success: false, message: 'name, type, and config are required' });
    }
    const problem = channelProblem(type, config);
    if (problem) {
      return res.status(400).json({ success: false, message: problem });
    }
    const channel = await NotificationChannel.create({ name, type, config, enabled: enabled !== false });
    res.status(201).json({ success: true, channel: redactChannel(channel.toJSON()) });
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ success: false, message: 'Failed to create channel' });
  }
});

/**
 * @swagger
 * /alerts/channels/{id}:
 *   put:
 *     summary: Update notification channel
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [email, slack, discord, webhook] }
 *               config: { type: object }
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: Channel updated
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/channels/:id', adminOnly, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const channel = await NotificationChannel.findByPk(req.params.id);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });
    const { name, type, config, enabled } = req.body;
    // The UI edits from the redacted list: "***" means "keep the stored value"
    const nextType = type ?? channel.type;
    const kept: { config?: ChannelFields; problem?: string } = config
      ? keepRedacted(config, (channel.config || {}) as ChannelFields, nextType === channel.type)
      : { config: channel.config as ChannelFields };
    if (kept.problem) {
      return res.status(400).json({ success: false, message: kept.problem });
    }
    const nextConfig = kept.config;
    const problem = channelProblem(nextType, nextConfig);
    if (problem) {
      return res.status(400).json({ success: false, message: problem });
    }
    await channel.update({ name, type: nextType, config: nextConfig, enabled });
    res.json({ success: true, channel: redactChannel(channel.toJSON()) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update channel' });
  }
});

/**
 * @swagger
 * /alerts/channels/{id}:
 *   delete:
 *     summary: Delete notification channel
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Channel deleted
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/channels/:id', adminOnly, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const channel = await NotificationChannel.findByPk(req.params.id);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });
    await channel.destroy();
    res.json({ success: true, message: 'Channel deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete channel' });
  }
});

/**
 * @swagger
 * /alerts/channels/{id}/test:
 *   post:
 *     summary: Send a test notification to a channel
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Test notification sent
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/channels/:id/test', adminOnly, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const channel = await NotificationChannel.findByPk(req.params.id);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });
    await sendToChannel(channel, '[CaddyManager] Test Notification', 'This is a test notification from CaddyManager. If you received this, your channel is configured correctly.');
    res.json({ success: true, message: 'Test notification sent' });
  } catch (err) {
    console.error('Test channel error:', err);
    res.status(500).json({ success: false, message: 'Failed to send test notification' });
  }
});

// ── Alert Rules ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /alerts/rules:
 *   get:
 *     summary: List alert rules
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array of alert rules
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/rules', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rules = await AlertRule.findAll({ order: [['createdAt', 'DESC']] });
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch alert rules' });
  }
});

/**
 * @swagger
 * /alerts/rules:
 *   post:
 *     summary: Create alert rule
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, condition_type]
 *             properties:
 *               name: { type: string }
 *               condition_type: { type: string, enum: [cert_expiry, upstream_down, error_rate, no_traffic] }
 *               threshold: { type: number }
 *               proxy_id: { type: string, format: uuid }
 *               channel_ids: { type: array, items: { type: string, format: uuid } }
 *               cooldown_minutes: { type: integer, default: 60 }
 *               enabled: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Alert rule created
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/rules', adminOnly, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /alerts/rules/{id}:
 *   put:
 *     summary: Update alert rule
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               condition_type: { type: string }
 *               threshold: { type: number }
 *               proxy_id: { type: string, format: uuid }
 *               channel_ids: { type: array, items: { type: string } }
 *               cooldown_minutes: { type: integer }
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: Alert rule updated
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/rules/:id', adminOnly, async (req: Request<{ id: string }>, res: Response) => {
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

/**
 * @swagger
 * /alerts/rules/{id}:
 *   delete:
 *     summary: Delete alert rule
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Alert rule deleted
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/rules/:id', adminOnly, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const rule = await AlertRule.findByPk(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: 'Alert rule not found' });
    await rule.destroy();
    res.json({ success: true, message: 'Alert rule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete alert rule' });
  }
});

/**
 * @swagger
 * /alerts/run:
 *   post:
 *     summary: Manually trigger all alert checks
 *     tags: [Alerts]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Alert checks completed
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/run', adminOnly, async (req: Request, res: Response) => {
  try {
    await runAlertChecks();
    res.json({ success: true, message: 'Alert checks completed' });
  } catch (err) {
    console.error('Alert run error:', err);
    res.status(500).json({ success: false, message: 'Alert check failed' });
  }
});
