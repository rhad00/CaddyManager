const express = require('express');
const { authenticateUser } = require('../../services/authService');
const { authMiddleware } = require('../../middleware/auth');
const { logAction } = require('../../services/auditService');
const passwordResetRoutes = require('./passwordReset');
const twoFactorRoutes = require('./twoFactor');
const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and get token
 * @access Public
 */
const { loginLimiter } = require('../../middleware/rateLimiter');
const { loginValidation } = require('../../middleware/validation');

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and get token
 * @access Public
 */
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 *
 * /auth/login:
 *   post:
 *     summary: Log in with email and password
 *     tags: [Auth]
 *     security: []
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
 *     responses:
 *       200:
 *         description: Login successful or 2FA required
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean }
 *                     token: { type: string }
 *                     user: { $ref: '#/components/schemas/User' }
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean }
 *                     require_2fa: { type: boolean }
 *                     totp_session: { type: string }
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/login', loginLimiter, loginValidation, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Authenticate user
    const result = await authenticateUser(email, password);

    if (!result.success) {
      await logAction({
        action: 'LOGIN_FAILED',
        resource: 'auth',
        details: { email, reason: result.message },
        status: 'failure'
      }, req);

      return res.status(401).json({
        success: false,
        message: result.message
      });
    }

    // If 2FA is required, return a challenge ticket (no full token yet)
    if (result.require_2fa) {
      return res.status(200).json({ success: true, require_2fa: true, totp_session: result.totp_session });
    }

    // Log successful login
    await logAction({
      userId: result.user.id,
      action: 'LOGIN',
      resource: 'auth',
      details: { email },
      status: 'success'
    }, req);

    // Set JWT as httpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Return user info (token still in body for backward compatibility with API clients)
    res.status(200).json({
      success: true,
      user: result.user,
      token: result.token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (client-side only, invalidate token on client)
 * @access Public
 */
router.post('/logout', (req, res) => {
  // Clear the httpOnly auth cookie
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/'
  });

  res.status(200).json({
    success: true,
    message: 'Logout successful'
  });
});

/**
 * @route GET /api/auth/me
 * @desc Get current user info
 * @access Private (will be protected by auth middleware)
 */
router.get('/me', authMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

// Password reset routes
router.use('/password-reset', passwordResetRoutes);

// 2FA routes
router.use('/2fa', twoFactorRoutes);

module.exports = router;
