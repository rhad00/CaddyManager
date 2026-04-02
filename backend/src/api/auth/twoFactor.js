const express = require('express');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { authMiddleware } = require('../../middleware/auth');
const { User } = require('../../models');
const { logAction } = require('../../services/auditService');
const { verifyTotpSession, generateToken } = require('../../services/authService');
const { twoFaLimiter } = require('../../middleware/rateLimiter');

const router = express.Router();

const APP_NAME = process.env.APP_NAME || 'CaddyManager';

/**
 * Generate 10 single-use backup codes.
 */
function generateBackupCodes() {
  return Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex'));
}

/**
 * POST /api/auth/2fa/setup
 * Generates a new TOTP secret and returns a QR code (PNG data URL).
 * Does NOT yet enable 2FA — that requires a verify call.
 */
router.post('/setup', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.totp_enabled) {
      return res.status(400).json({ success: false, message: '2FA is already enabled. Disable it first.' });
    }

    const secretObj = speakeasy.generateSecret({ name: `${APP_NAME} (${user.email})`, length: 20 });
    const secret = secretObj.base32;
    // Temporarily store secret (not yet active — enabled on verify)
    user.totp_secret = secret;
    user.totp_enabled = false;
    await user.save();

    const otpauthUrl = secretObj.otpauth_url;
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    res.json({ success: true, secret, qr: qrDataUrl });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ success: false, message: 'Failed to set up 2FA' });
  }
});

/**
 * POST /api/auth/2fa/verify
 * Verifies the TOTP code and activates 2FA.
 * Returns backup codes on success.
 */
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'TOTP code required' });

    const user = await User.findByPk(req.user.id);
    if (!user || !user.totp_secret) {
      return res.status(400).json({ success: false, message: 'No 2FA setup in progress. Call /setup first.' });
    }
    if (user.totp_enabled) {
      return res.status(400).json({ success: false, message: '2FA already enabled' });
    }

    const isValid = speakeasy.totp.verify({ token: String(code).trim(), secret: user.totp_secret, encoding: 'base32', window: 1 });
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid or expired TOTP code' });

    const backupCodes = generateBackupCodes();
    user.totp_enabled = true;
    user.totp_backup_codes = backupCodes;
    await user.save();

    await logAction({ userId: user.id, action: '2FA_ENABLED', resource: 'auth', status: 'success' }, req);

    res.json({ success: true, backup_codes: backupCodes });
  } catch (err) {
    console.error('2FA verify error:', err);
    res.status(500).json({ success: false, message: 'Failed to verify 2FA code' });
  }
});

/**
 * POST /api/auth/2fa/disable
 * Disables 2FA for the authenticated user. Requires current TOTP code.
 */
router.post('/disable', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'TOTP code required to disable 2FA' });

    const user = await User.findByPk(req.user.id);
    if (!user || !user.totp_enabled) {
      return res.status(400).json({ success: false, message: '2FA is not enabled' });
    }

    const isValid = speakeasy.totp.verify({ token: String(code).trim(), secret: user.totp_secret, encoding: 'base32', window: 1 });
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid TOTP code' });

    user.totp_enabled = false;
    user.totp_secret = null;
    user.totp_backup_codes = null;
    await user.save();

    await logAction({ userId: user.id, action: '2FA_DISABLED', resource: 'auth', status: 'success' }, req);

    res.json({ success: true, message: '2FA disabled' });
  } catch (err) {
    console.error('2FA disable error:', err);
    res.status(500).json({ success: false, message: 'Failed to disable 2FA' });
  }
});

/**
 * GET /api/auth/2fa/status
 * Returns whether 2FA is enabled for the current user.
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'totp_enabled'] });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, enabled: user.totp_enabled });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get 2FA status' });
  }
});

/**
 * POST /api/auth/2fa/challenge
 * Complete login for users with 2FA enabled.
 * Takes totp_session (from login response) + TOTP code or backup code.
 */
router.post('/challenge', twoFaLimiter, async (req, res) => {
  try {
    const { totp_session, code } = req.body;
    if (!totp_session || !code) {
      return res.status(400).json({ success: false, message: 'totp_session and code are required' });
    }

    const userId = verifyTotpSession(totp_session);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid or expired 2FA session' });
    }

    const user = await User.findByPk(userId);
    if (!user || !user.totp_enabled) {
      return res.status(401).json({ success: false, message: 'Invalid 2FA session' });
    }

    const trimmedCode = String(code).trim();
    const isValidTotp = speakeasy.totp.verify({ token: trimmedCode, secret: user.totp_secret, encoding: 'base32', window: 1 });

    // Also allow backup codes
    let isValidBackup = false;
    if (!isValidTotp && user.totp_backup_codes) {
      const idx = user.totp_backup_codes.indexOf(trimmedCode);
      if (idx !== -1) {
        isValidBackup = true;
        // Consume the backup code (one-time use)
        const remaining = [...user.totp_backup_codes];
        remaining.splice(idx, 1);
        user.totp_backup_codes = remaining;
      }
    }

    if (!isValidTotp && !isValidBackup) {
      return res.status(401).json({ success: false, message: 'Invalid 2FA code' });
    }

    user.failed_login_attempts = 0;
    user.last_login = new Date();
    await user.save();

    const token = generateToken(user);
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('auth_token', token, {
      httpOnly: true, secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/', maxAge: 24 * 60 * 60 * 1000,
    });

    await logAction({ userId: user.id, action: 'LOGIN', resource: 'auth', details: { method: '2fa' }, status: 'success' }, req);

    res.json({
      success: true,
      user: { id: user.id, email: user.email, role: user.role, lastLogin: user.last_login },
      token,
      used_backup_code: isValidBackup,
    });
  } catch (err) {
    console.error('2FA challenge error:', err);
    res.status(500).json({ success: false, message: 'Server error during 2FA' });
  }
});

module.exports = router;
