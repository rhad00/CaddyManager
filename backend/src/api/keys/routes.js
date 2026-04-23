const express = require('express');
const crypto = require('crypto');
const { ApiKey, User } = require('../../models');
const { authMiddleware } = require('../../middleware/auth');
const { logAction } = require('../../services/auditService');

const router = express.Router();

/** Hash the raw API key for storage. */
const hashKey = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

/** Generate a new key: `cm_<random32hex>` */
const generateRawKey = () => `cm_${crypto.randomBytes(20).toString('hex')}`;

/**
 * @swagger
 * tags:
 *   name: API Keys
 *   description: Programmatic access key management
 *
 * /keys:
 *   get:
 *     summary: List API keys
 *     description: "Returns keys for the current user. Admins see all keys."
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array of API key objects (key_hash excluded)
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const where = req.user.role === 'admin' ? {} : { created_by: req.user.id };
    const keys = await ApiKey.findAll({
      where,
      include: [{ model: User, as: 'owner', attributes: ['id', 'email'] }],
      order: [['createdAt', 'DESC']],
    });
    // Never return key_hash
    const safe = keys.map(k => {
      const obj = k.toJSON();
      delete obj.key_hash;
      return obj;
    });
    res.json({ success: true, keys: safe });
  } catch (err) {
    console.error('List API keys error:', err);
    res.status(500).json({ success: false, message: 'Failed to list API keys' });
  }
});

/**
 * @swagger
 * /keys:
 *   post:
 *     summary: Create a new API key
 *     description: "Returns the raw key ONCE — it is not stored and cannot be retrieved again."
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "CI/CD pipeline" }
 *               permissions:
 *                 type: array
 *                 items: { type: string, enum: [read, write, admin] }
 *                 default: [read]
 *               expires_at: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: API key created — raw_key shown once
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 key: { type: object }
 *                 raw_key: { type: string, example: "cm_abc123..." }
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, permissions = ['read'], expires_at } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const validPerms = ['read', 'write', 'admin'];
    const perms = Array.isArray(permissions) ? permissions : [permissions];
    if (!perms.every(p => validPerms.includes(p))) {
      return res.status(400).json({ success: false, message: `permissions must be a subset of: ${validPerms.join(', ')}` });
    }

    // Non-admins cannot create admin-level keys
    if (perms.includes('admin') && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can create admin-level keys' });
    }

    const rawKey = generateRawKey();
    const key = await ApiKey.create({
      name,
      key_hash: hashKey(rawKey),
      key_prefix: rawKey.substring(0, 8),
      permissions: perms,
      created_by: req.user.id,
      expires_at: expires_at ? new Date(expires_at) : null,
    });

    await logAction({
      userId: req.user.id, action: 'API_KEY_CREATED',
      resource: 'api_key', resourceId: key.id,
      details: { name, permissions: perms }, status: 'success',
    }, req);

    res.status(201).json({
      success: true,
      key: { id: key.id, name: key.name, key_prefix: key.key_prefix, permissions: key.permissions, expires_at: key.expires_at },
      raw_key: rawKey, // Only shown once
    });
  } catch (err) {
    console.error('Create API key error:', err);
    res.status(500).json({ success: false, message: 'Failed to create API key' });
  }
});

/**
 * @swagger
 * /keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     tags: [API Keys]
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
 *         description: API key revoked
 *       403:
 *         $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const key = await ApiKey.findByPk(req.params.id);
    if (!key) return res.status(404).json({ success: false, message: 'Key not found' });
    if (req.user.role !== 'admin' && key.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await logAction({
      userId: req.user.id, action: 'API_KEY_REVOKED',
      resource: 'api_key', resourceId: key.id,
      details: { name: key.name }, status: 'success',
    }, req);

    await key.destroy();
    res.json({ success: true, message: 'API key revoked' });
  } catch (err) {
    console.error('Delete API key error:', err);
    res.status(500).json({ success: false, message: 'Failed to revoke API key' });
  }
});

/**
 * @swagger
 * /keys/{id}:
 *   put:
 *     summary: Update API key name or enabled status
 *     tags: [API Keys]
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
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: API key updated
 *       403:
 *         $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const key = await ApiKey.findByPk(req.params.id);
    if (!key) return res.status(404).json({ success: false, message: 'Key not found' });
    if (req.user.role !== 'admin' && key.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { name, enabled } = req.body;
    if (name !== undefined) key.name = name;
    if (enabled !== undefined) key.enabled = Boolean(enabled);
    await key.save();

    const safe = key.toJSON();
    delete safe.key_hash;
    res.json({ success: true, key: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update API key' });
  }
});

module.exports = router;
