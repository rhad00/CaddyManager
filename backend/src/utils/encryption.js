'use strict';

/**
 * Field-level encryption helpers using AES-256-GCM.
 *
 * Requires the ENCRYPTION_KEY environment variable — a 64-character hex string
 * (32 bytes).  In production this MUST be set; the helpers throw if the key is
 * absent when decryption is attempted.  Encryption silently skips (returns the
 * plain text) when the key is absent so that existing rows are not broken
 * during migrations, but callers should ensure the key is always present.
 *
 * Wire format (base64-encoded string stored in the DB):
 *   "ENC:" + base64( 4-byte magic "CMFV" | 12-byte IV | 16-byte GCM tag | ciphertext )
 *
 * The "ENC:" prefix lets decrypt() detect whether a field has already been
 * encrypted, making it safe to call idempotently on legacy plain-text rows.
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const MAGIC = 'CMFV';
const PREFIX = 'ENC:';
const IV_LEN = 12;   // 96-bit IV recommended for GCM
const TAG_LEN = 16;

/**
 * Return a 32-byte Buffer derived from ENCRYPTION_KEY, or null if the env var
 * is not set.
 *
 * @throws {Error} when the env var is present but malformed.
 */
function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) return null;
  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(trimmed, 'hex');
}

/**
 * Encrypt a plain-text string.  Returns the encrypted value as a base64
 * string prefixed with "ENC:".  If ENCRYPTION_KEY is not set returns the
 * original value unchanged (so callers are not broken in dev without the var).
 *
 * @param {string|null|undefined} plaintext
 * @returns {string|null|undefined}
 */
function encrypt(plaintext) {
  if (plaintext == null) return plaintext;
  if (typeof plaintext !== 'string') {
    plaintext = String(plaintext);
  }
  // Already encrypted — do not double-encrypt.
  if (plaintext.startsWith(PREFIX)) return plaintext;

  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const cipherBuf = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const magic = Buffer.from(MAGIC, 'ascii');
  const payload = Buffer.concat([magic, iv, tag, cipherBuf]);
  return PREFIX + payload.toString('base64');
}

/**
 * Decrypt a value previously encrypted with encrypt().  Returns the plain-text
 * string.  If the value is not prefixed with "ENC:" it is returned as-is
 * (allows transparent reads of legacy plain-text rows).
 *
 * @param {string|null|undefined} value
 * @returns {string|null|undefined}
 */
function decrypt(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  if (!value.startsWith(PREFIX)) return value; // plain text — legacy row

  const key = getKey();
  if (!key) throw new Error('ENCRYPTION_KEY is required to decrypt stored credentials');

  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  const magic = buf.slice(0, 4).toString('ascii');
  if (magic !== MAGIC) throw new Error('Encrypted value has an unrecognised format');

  const iv = buf.slice(4, 4 + IV_LEN);
  const tag = buf.slice(4 + IV_LEN, 4 + IV_LEN + TAG_LEN);
  const cipherBuf = buf.slice(4 + IV_LEN + TAG_LEN);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(cipherBuf) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
