import crypto from 'crypto';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

dotenv.config();

export type ApiKeyScope = 'read' | 'write' | 'admin';

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
// The columns and queries this file uses. The models are plain sequelize.define() results
// without attribute types until they become classes (Phase 3 of MODERNIZATION.md).
interface ApiKeyRow {
  id: string;
  created_by: string | number;
  expires_at?: Date | string | null;
  permissions?: string[] | null;
  update(values: Record<string, unknown>): Promise<unknown>;
}
interface ApiKeyModel {
  findOne(options: { where: Record<string, unknown> }): Promise<ApiKeyRow | null>;
}
interface UserRow {
  id: string | number;
  email: string;
  role: string;
  status: string;
}
interface UserModel {
  findByPk(id: string | number): Promise<UserRow | null>;
}

let _ApiKey: ApiKeyModel | undefined;
const getApiKey = (): ApiKeyModel => {
  if (!_ApiKey) _ApiKey = require('../models').ApiKey as ApiKeyModel;
  return _ApiKey;
};
let _User: UserModel | undefined;
const getUser = (): UserModel => {
  if (!_User) _User = require('../models').User as UserModel;
  return _User;
};

// Scopes are cumulative: write includes read, admin includes everything
const SCOPE_RANK: Record<string, number> = { read: 1, write: 2, admin: 3 };
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** Scope an API key needs for an HTTP method; DELETE and unknown methods need admin. */
const scopeForMethod = (method: string): ApiKeyScope => {
  if (SAFE_METHODS.has(method)) return 'read';
  if (WRITE_METHODS.has(method)) return 'write';
  return 'admin';
};

/**
 * Area markers, mounted in front of a router (see src/api/index.ts). Express's own routing
 * decides what is inside an area, so no path parsing can disagree with it.
 * - adminScopeArea: API keys need the admin scope for every method (administration).
 * - noApiKeyArea: API keys are refused whatever their scope (account security).
 */
export const adminScopeArea: RequestHandler = (req, _res, next) => {
  req.apiKeyMinScope = 'admin';
  next();
};
export const noApiKeyArea: RequestHandler = (req, _res, next) => {
  req.apiKeyForbidden = true;
  next();
};

/** @param perms - the key's permissions */
const hasScope = (perms: string[], required: string): boolean =>
  Math.max(0, ...perms.map((p) => SCOPE_RANK[p] || 0)) >= SCOPE_RANK[required];

/**
 * Authentication middleware to protect routes.
 * Priority: httpOnly cookie → Bearer token → X-API-Key header → ?token query param (SSE).
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  try {
    // ── 1. X-API-Key header ───────────────────────────────────────────────
    const rawApiKey = req.headers['x-api-key'];
    if (rawApiKey) {
      const ApiKey = getApiKey();
      const keyHash = crypto.createHash('sha256').update(String(rawApiKey)).digest('hex');
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
    let token: string | null = null;
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
    if (!token && typeof req.query.token === 'string' && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET) as jwt.JwtPayload;
    // Reject TOTP challenge tokens from being used as full auth
    if (decoded.purpose === 'totp_challenge') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    req.user = decoded as Express.AuthenticatedUser;
    next();
  } catch (error) {
    console.error('Authentication error:', error instanceof Error ? error.message : String(error));
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
/**
 * Role-based authorization middleware
 * Checks if the user has the required role
 * @param roles - Required role(s)
 */
export const roleMiddleware = (roles: string | string[]): RequestHandler => {
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
    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
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
 * @param permission - Required API key permission scope.
 */
export const requireApiKeyPermission = (permission: ApiKeyScope): RequestHandler => (req, res, next) => {
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
