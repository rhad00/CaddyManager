const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { User } = require('../../models');
const { logAction } = require('../../services/auditService');
const { body, validationResult } = require('express-validator');
const { passwordResetLimiter } = require('../../middleware/rateLimiter');

const router = express.Router();

/**
 * @route POST /api/auth/password-reset/request
 * @desc Request password reset (generates token)
 * @access Public
 */
router.post(
  '/request',
  passwordResetLimiter,
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
      // But only generate token if user exists
      if (user) {
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Store hashed token in database with 1-hour expiry
        user.reset_token = resetTokenHash;
        user.reset_token_expires = new Date(Date.now() + 3600000); // 1 hour
        await user.save();

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

      // Find user with matching token that hasn't expired
      const user = await User.findOne({
        where: { reset_token: tokenHash }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token',
        });
      }

      if (new Date() > new Date(user.reset_token_expires)) {
        // Clear expired token
        user.reset_token = null;
        user.reset_token_expires = null;
        await user.save();
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

      // Find user with matching token
      const user = await User.findOne({
        where: { reset_token: tokenHash }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token',
        });
      }

      if (new Date() > new Date(user.reset_token_expires)) {
        // Clear expired token
        user.reset_token = null;
        user.reset_token_expires = null;
        await user.save();
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired',
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update user password and clear reset token
      await user.update({
        password: hashedPassword,
        reset_token: null,
        reset_token_expires: null
      });

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

module.exports = router;
