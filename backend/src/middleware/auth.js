const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

// JWT secret key from environment variables (REQUIRED - no fallback for security)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is required in production.');
  process.exit(1);
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';

/**
 * Lazily loads ApiKey model to avoid circular-require issues at startup.
 */
let _ApiKey;
const getApiKey = () => {
  if (!_ApiKey) _ApiKey = require('../models').ApiKey;
  return _ApiKey;
};

/**
 * Authentication middleware to protect routes.
 * Priority: httpOnly cookie → Bearer token → X-API-Key header → ?token query param (SSE).
 */
const authMiddleware = async (req, res, next) => {
  try {
    // ── 1. X-API-Key header ───────────────────────────────────────────────
    const rawApiKey = req.headers['x-api-key'];
    if (rawApiKey) {
      const ApiKey = getApiKey();
      const keyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
      const apiKey = await ApiKey.findOne({ where: { key_hash: keyHash, enabled: true } });

      if (!apiKey) {
        return res.status(401).json({ success: false, message: 'Invalid API key' });
      }
      if (apiKey.expires_at && new Date() > new Date(apiKey.expires_at)) {
        return res.status(401).json({ success: false, message: 'API key expired' });
      }

      // Update last_used_at asynchronously (don't block the request)
      apiKey.update({ last_used_at: new Date() }).catch(() => {});

      // Map API key permissions to a req.user-like object.
      // 'admin' perm  → role 'admin'  (may pass roleMiddleware('admin'))
      // 'write' perm  → role 'user'   (blocked from admin-only routes by design)
      // 'read'  perm  → role 'read-only'
      const perms = apiKey.permissions || ['read'];
      let role = 'read-only';
      if (perms.includes('admin')) role = 'admin';
      else if (perms.includes('write')) role = 'user';

      req.user = {
        id: apiKey.created_by,
        role,
        api_key_id: apiKey.id,
        api_key_permissions: perms,
      };
      return next();
    }

    // ── 2. JWT (cookie → Authorization header → ?token query param) ───────
    let token = null;
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }
    // SSE clients can't set headers; allow ?token= query param
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);
    // Reject TOTP challenge tokens from being used as full auth
    if (decoded.purpose === 'totp_challenge') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
/**
 * Role-based authorization middleware
 * Checks if the user has the required role
 * @param {Array|String} roles - Required role(s)
 */
const roleMiddleware = (roles) => {
  return (req, res, next) => {
    // authMiddleware should be used before this middleware
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    // Convert single role to array
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    // Check if user role is in allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: insufficient permissions'
      });
    }
    
    // User has required role, proceed
    next();
  };
};

/**
 * API key granular permission middleware.
 *
 * When a request is authenticated via an API key, this middleware additionally
 * enforces that the key carries the required permission scope.  JWT-authenticated
 * sessions are not affected — their access is governed solely by `roleMiddleware`.
 *
 * Usage: place AFTER authMiddleware and roleMiddleware in the route handler array.
 *
 * @param {'read'|'write'|'admin'} permission - Required API key permission scope.
 */
const requireApiKeyPermission = (permission) => (req, res, next) => {
  // Not an API-key request — JWT role-based checks already apply.
  if (!req.user || !req.user.api_key_id) return next();

  const perms = req.user.api_key_permissions || [];
  // 'admin' permission on a key grants all scopes.
  if (perms.includes('admin')) return next();

  if (!perms.includes(permission)) {
    return res.status(403).json({
      success: false,
      message: `This API key does not have the required '${permission}' permission`
    });
  }
  return next();
};

module.exports = {
  authMiddleware,
  roleMiddleware,
  requireApiKeyPermission
};
