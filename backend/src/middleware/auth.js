const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT secret key from environment variables (REQUIRED - no fallback for security)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is required in production.');
  process.exit(1);
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';

/**
 * Authentication middleware to protect routes
 * Reads JWT from httpOnly cookie first, falls back to Authorization header
 */
const authMiddleware = (req, res, next) => {
  try {
    let token = null;

    // Prefer httpOnly cookie
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    // Fall back to Authorization header (for API clients)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);
    
    // Add user data to request
    req.user = decoded;
    
    // Proceed to next middleware
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
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

module.exports = {
  authMiddleware,
  roleMiddleware
};
