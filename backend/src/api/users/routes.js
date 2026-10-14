const express = require('express');
const { sequelize, User, ApiKey } = require('../../models');
const { generateToken } = require('../../services/authService');
const { userValidation } = require('../../middleware/validation');
const { authMiddleware, roleMiddleware, requireApiKeyPermission } = require('../../middleware/auth');
const router = express.Router();

class LastAdminError extends Error {}

const isActiveAdmin = (user) => user.role === 'admin' && user.status === 'active';

/**
 * Apply a change to a user in a transaction, refusing it when it would leave no active
 * admin. The admin rows are locked so two concurrent requests cannot both pass the check.
 * @param {Object} user - the user being changed
 * @param {boolean} staysActiveAdmin - whether the user is still an active admin afterwards
 * @param {(transaction) => Promise<unknown>} change
 */
async function changeUserKeepingAnAdmin(user, staysActiveAdmin, change) {
  await sequelize.transaction(async (transaction) => {
    if (isActiveAdmin(user) && !staysActiveAdmin) {
      const admins = await User.findAll({
        where: { role: 'admin', status: 'active' },
        attributes: ['id'],
        lock: true,
        transaction,
      });
      if (!admins.some((admin) => admin.id !== user.id)) {
        throw new LastAdminError('This would leave no active admin user');
      }
    }
    await change(transaction);
  });
}

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management (admin only)
 *
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *               role: { type: string, enum: [admin, read-only], default: read-only }
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/', [authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('admin')], userValidation, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Create user
    const user = await User.create({
      email,
      password_hash: password, // Will be hashed by model hook
      role: role || 'read-only'
    });

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during user creation'
    });
  }
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all users
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *     responses:
 *       200:
 *         description: Array of user objects
 *       401:
 *         $ref: '#/components/schemas/Error'
 *       403:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/', [authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('admin')], async (req, res) => {
  try {
    const { page, limit } = req.query;

    const attributes = ['id', 'email', 'role', 'status', 'last_login', 'createdAt', 'updatedAt'];

    if (page || limit) {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
      const offset = (pageNum - 1) * limitNum;

      const { count, rows: users } = await User.findAndCountAll({
        attributes,
        limit: limitNum,
        offset,
        order: [['createdAt', 'DESC']],
      });

      return res.status(200).json({
        success: true,
        users,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      });
    }

    const users = await User.findAll({ attributes });

    res.status(200).json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving users'
    });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: "Update user (role, status, or password)"
 *     tags: [Users]
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
 *               role: { type: string, enum: [admin, read-only] }
 *               status: { type: string, enum: [active, locked] }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: User updated
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/:id', [authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('admin')], async (req, res) => {
  try {
    const userId = req.params.id;
    const { role, status, password } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent demoting or locking self
    if (role && role !== 'admin' && req.user.id === userId) {
      return res.status(400).json({ success: false, message: 'Cannot change your own admin role' });
    }
    if (status === 'locked' && req.user.id === userId) {
      return res.status(400).json({ success: false, message: 'Cannot lock your own account' });
    }

    const updates = {};
    if (role && ['admin', 'read-only'].includes(role)) {
      updates.role = role;
    }
    if (status && ['active', 'locked'].includes(status)) {
      updates.status = status;
      if (status === 'active') {
        updates.failed_login_attempts = 0;
        updates.lockout_until = null;
      }
    }
    if (password) {
      updates.password_hash = password; // Will be hashed by model hook
    }

    const staysActiveAdmin = isActiveAdmin({ role: updates.role ?? user.role, status: updates.status ?? user.status });
    await changeUserKeepingAnAdmin(user, staysActiveAdmin, (transaction) => user.update(updates, { transaction }));

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    if (error instanceof LastAdminError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating user' });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
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
 *         description: User deleted
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', [authMiddleware, roleMiddleware('admin'), requireApiKeyPermission('admin')], async (req, res) => {
  try {
    const userId = req.params.id;

    // Don't allow deleting self via this endpoint to avoid accidental lockout
    if (req.user && req.user.id === userId) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own user account via this endpoint' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // API keys act as their owner, so they go with the user (created_by is NOT NULL)
    await changeUserKeepingAnAdmin(user, false, async (transaction) => {
      await ApiKey.destroy({ where: { created_by: user.id }, transaction });
      await user.destroy({ transaction });
    });

    res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) {
    if (error instanceof LastAdminError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting user' });
  }
});

module.exports = router;
