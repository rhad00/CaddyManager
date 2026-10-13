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
let _User;
const getUser = () => {
  if (!_User) _User = require('../models').User;
  return _User;
};

// Scopes are cumulative: write includes read, admin includes everything
const SCOPE_RANK = { read: 1, write: 2, admin: 3 };
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** Scope an API key needs for an HTTP method; DELETE and unknown methods need admin. */
const scopeForMethod = (method) => {
  if (SAFE_METHODS.has(method)) return 'read';
  if (WRITE_METHODS.has(method)) return 'write';
  return 'admin';
};

/**
 * Area markers, mounted in front of a router (see src/api/index.js). Express's own routing
 * decides what is inside an area, so no path parsing can disagree with it.
 * - adminScopeArea: API keys need the admin scope for every method (administration).
 * - noApiKeyArea: API keys are refused whatever their scope (account security).
 */
const adminScopeArea = (req, _res, next) => {
  req.apiKeyMinScope = 'admin';
  next();
};
const noApiKeyArea = (req, _res, next) => {
  req.apiKeyForbidden = true;
  next();
};

/** @param {string[]} perms - the key's permissions @param {string} required */
const hasScope = (perms, required) =>
  Math.max(0, ...perms.map((p) => SCOPE_RANK[p] || 0)) >= SCOPE_RANK[required];

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

      // The key acts as its owner, with the owner's current role: it dies with the owner
      // (deleted or locked) and never grants more than the owner has now
      const owner = await getUser().findByPk(apiKey.created_by);
      if (!owner || owner.status !== 'active') {
        return res.status(401).json({ success: false, message: 'API key owner is not active' });
      }

      // Scope by HTTP method, for every route: read = GET, write = + POST/PUT/PATCH,
      // admin = everything (DELETE, user and key management)
      if (req.apiKeyForbidden) {
        return res.status(403).json({ success: false, message: 'This endpoint is not available with an API key' });
      }
      const perms = apiKey.permissions || ['read'];
      const required = req.apiKeyMinScope || scopeForMethod(req.method);
      if (!hasScope(perms, required)) {
        return res.status(403).json({
          success: false,
          message: `This API key does not have the required '${required}' permission`
        });
      }

      req.user = {
        id: owner.id,
        email: owner.email,
        role: owner.role,
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
  if (!hasScope(perms, permission)) {
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
  requireApiKeyPermission,
  adminScopeArea,
  noApiKeyArea
};
