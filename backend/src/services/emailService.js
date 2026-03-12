const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

/**
 * Initialize the email transporter from environment variables.
 * If SMTP_HOST is not set, emails are logged to console instead of sent.
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST) {
    logger.warn('SMTP_HOST not configured — password reset emails will be logged to console');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send a password reset email containing the reset link.
 * Falls back to console logging when SMTP is not configured.
 *
 * @param {string} to - Recipient email address
 * @param {string} resetToken - Raw (unhashed) reset token
 */
async function sendPasswordResetEmail(to, resetToken) {
  const baseUrl = process.env.APP_URL || 'http://localhost:8080';
  const resetLink = `${baseUrl}/password-reset/confirm?token=${encodeURIComponent(resetToken)}`;
  const from = process.env.SMTP_FROM || 'noreply@caddymanager.local';

  const mail = getTransporter();

  if (!mail) {
    // No SMTP configured — log for development convenience
    logger.info(`Password reset requested for ${to}. Link: ${resetLink}`);
    return;
  }

  await mail.sendMail({
    from,
    to,
    subject: 'CaddyManager — Password Reset Request',
    text: [
      'You requested a password reset for your CaddyManager account.',
      '',
      `Click the link below to reset your password (valid for 1 hour):`,
      resetLink,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <p>You requested a password reset for your CaddyManager account.</p>
      <p>Click the link below to reset your password (valid for 1 hour):</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });

  logger.info(`Password reset email sent to ${to}`);
}

module.exports = { sendPasswordResetEmail };
