const express = require('express');
const User = require('../../models/user');
const { generateToken } = require('../../services/authService');
const { userValidation } = require('../../middleware/validation');
const { authMiddleware, roleMiddleware } = require('../../middleware/auth');
const router = express.Router();

/**
 * @route POST /api/users
 * @desc Create a new user
 * @access Private (Admin only)
 */
router.post('/', [authMiddleware, roleMiddleware('admin')], userValidation, async (req, res) => {
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
 * @route GET /api/users
 * @desc Get all users
 * @access Private (Admin only)
 */
router.get('/', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
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
 * @route PUT /api/users/:id
 * @desc Update a user (role, status/unlock, password)
 * @access Private (Admin only)
 */
router.put('/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
  try {
    const userId = req.params.id;
    const { role, status, password } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent demoting self from admin
    if (role && role !== 'admin' && req.user.id === userId) {
      return res.status(400).json({ success: false, message: 'Cannot change your own admin role' });
    }

    // Prevent removing the last admin
    if (role && role !== 'admin' && user.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot demote the last admin user' });
      }
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

    await user.update(updates);

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
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating user' });
  }
});

/**
 * @route DELETE /api/users/:id
 * @desc Delete a user by id
 * @access Private (Admin only)
 */
router.delete('/:id', [authMiddleware, roleMiddleware('admin')], async (req, res) => {
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

    // If user is an admin, ensure at least one other admin remains
    if (user.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the last admin user' });
      }
    }

    await user.destroy();

    res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting user' });
  }
});

module.exports = router;
