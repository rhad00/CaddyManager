const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { User } = require('../../models');
const { logAction } = require('../../services/auditService');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// In-memory store for reset tokens (in production, use Redis or database)
const resetTokens = new Map();

/**
 * @route POST /api/auth/password-reset/request
 * @desc Request password reset (generates token)
 * @access Public
 */
router.post(
  '/request',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { email } = req.body;

      // Find user by email
      const user = await User.findOne({ where: { email } });

      // Always return success to prevent email enumeration
      // But only send email if user exists
      if (user) {
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Store token with expiration (1 hour)
        resetTokens.set(resetTokenHash, {
          userId: user.id,
          email: user.email,
          expiresAt: Date.now() + 3600000, // 1 hour
        });

        // Log password reset request
        await logAction({
          userId: user.id,
          action: 'PASSWORD_RESET_REQUESTED',
          resource: 'auth',
          details: { email },
          status: 'success',
        }, req);

        // In production, send email with reset link
        // For now, we'll return the token in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log(`Password reset token for ${email}: ${resetToken}`);
          return res.status(200).json({
            success: true,
            message: 'Password reset instructions sent to email',
            resetToken, // Only in development
          });
        }

        // TODO: Send email with reset link
        // const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        // await sendEmail(user.email, 'Password Reset', resetUrl);
      }

      res.status(200).json({
        success: true,
        message: 'If an account exists with that email, password reset instructions have been sent',
      });
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during password reset request',
      });
    }
  }
);

/**
 * @route POST /api/auth/password-reset/verify
 * @desc Verify reset token
 * @access Public
 */
router.post(
  '/verify',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { token } = req.body;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const tokenData = resetTokens.get(tokenHash);

      if (!tokenData) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token',
        });
      }

      if (Date.now() > tokenData.expiresAt) {
        resetTokens.delete(tokenHash);
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired',
        });
      }

      res.status(200).json({
        success: true,
        message: 'Token is valid',
      });
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during token verification',
      });
    }
  }
);

/**
 * @route POST /api/auth/password-reset/reset
 * @desc Reset password with token
 * @access Public
 */
router.post(
  '/reset',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[a-z]/)
      .withMessage('Password must contain at least one lowercase letter')
      .matches(/[A-Z]/)
      .withMessage('Password must contain at least one uppercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain at least one number')
      .matches(/[^a-zA-Z0-9]/)
      .withMessage('Password must contain at least one special character'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { token, password } = req.body;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const tokenData = resetTokens.get(tokenHash);

      if (!tokenData) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token',
        });
      }

      if (Date.now() > tokenData.expiresAt) {
        resetTokens.delete(tokenHash);
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired',
        });
      }

      // Find user
      const user = await User.findByPk(tokenData.userId);

      if (!user) {
        resetTokens.delete(tokenHash);
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update user password
      await user.update({ password: hashedPassword });

      // Delete used token
      resetTokens.delete(tokenHash);

      // Log password reset
      await logAction({
        userId: user.id,
        action: 'PASSWORD_RESET_COMPLETED',
        resource: 'auth',
        details: { email: user.email },
        status: 'success',
      }, req);

      res.status(200).json({
        success: true,
        message: 'Password has been reset successfully',
      });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during password reset',
      });
    }
  }
);

// Cleanup expired tokens periodically (every 15 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [hash, data] of resetTokens.entries()) {
    if (now > data.expiresAt) {
      resetTokens.delete(hash);
    }
  }
}, 15 * 60 * 1000);

module.exports = router;
